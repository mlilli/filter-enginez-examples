/**
 * `real-estate/geoSection` — the distance filter: an enable checkbox, a metro dropdown, a "Near me"
 * button, a draggable map marker and a radius slider, committed as ONE `GeoProximityRule`: the shared
 * distance rule every app commits, over the listing's `coords` field (`buildListingGeoRadiusRule`), so a
 * `?f` link this section writes loads the same circle in every app, and after a reload.
 *
 * @remarks
 * The framework-less port of Vue's `<GeoRadiusSection>` and its Svelte / Angular twins. It is the only
 * section that loads a library, and therefore the only one whose contents appear late.
 *
 * ### Miles above, kilometers below
 *
 * Every surface a person sees is in miles; the engine's rule and the map's circle are both in
 * kilometers. The conversion happens at exactly two points — reading the slider and writing the
 * readout — and nowhere in between, because a value that is sometimes miles and sometimes kilometers
 * is a bug waiting for a code review that does not catch it.
 *
 * ### The radius commits on RELEASE, not on input
 *
 * Dragging paints a draft immediately and commits once, on pointer-up / key-up / blur. Committing per
 * input event would re-run an R-tree query and a full bundle round trip for every pixel of the drag.
 * The draft is `null` when idle, which is what distinguishes "the user is mid-gesture" from "the
 * radius happens to equal the committed one".
 *
 * ### Enablement is the RULE's presence, not a local flag
 *
 * This panel — like the books panel beside it, and like the Vue and Svelte geo sections — derives the
 * checkbox from the engine's committed rule map, read by the shared `deriveGeoRadius`, repainting
 * wholesale on every change. So the
 * checkbox is checked exactly when a `geo-proximity` rule exists, and clearing that rule from
 * anywhere (an active-filter pill's ×, "Clear all", a shared `?f` link that omits it) turns the
 * section off with no reset table to keep in step.
 *
 * The center and radius are still kept in closure variables, because those are the one thing the rule
 * genuinely does not carry: the rule is *absent* while the filter is off, and re-enabling should
 * restore the user's last pin rather than jumping back to the default.
 *
 * ### The map exists only while the filter is on
 *
 * As in every other vertical, turning the filter off destroys the map and removes its frame, and
 * turning it back on builds a fresh one on the last-used center and radius. Zoom and pan therefore
 * do not survive the toggle — the circle the rule describes is what the new map frames — and a
 * disabled section holds no Leaflet instance, tiles or listeners. The mobile collapse is a different
 * case: it hides a LIVE map, which is why {@link GeoSection.invalidateMapSize} exists.
 *
 * ### No predictive disable here, deliberately
 *
 * A radius is a continuous surface, not a candidate list — there is nothing to enumerate and project.
 * It is the geo rule's ABSENCE from the bundle query that lets it govern every other facet's disable
 * state: the engine evaluates every other active rule when projecting a candidate, so a 15-mile Denver
 * radius is exactly what greys out "Austin ISD".
 *
 * @packageDocumentation
 */

import type { FilterRule, RuleId } from '@filter-enginez/core';

import { el, setHidden } from '@filter-enginez/examples-shared/dom';
import {
	buildListingGeoRadiusRule,
	describeMapCoords,
	findMetroLabel,
	GEO_RADIUS_RULE_ID,
	type GeoRadius,
	kmToMiles,
	type MapCoords,
	type MetroCenterOption,
	milesToKm,
} from '@filter-enginez/examples-shared/real-estate-domain';

import { createCheckboxControl } from '../controls/controls.js';
import { section } from '../controls/sections.js';
import { createSelectMenu } from '../controls/selectMenu.js';
import { createRadiusMap, type RadiusMap } from './radiusMap.js';

/**
 * The panel's single write path, handed down so this section cannot grow a second one.
 *
 * @remarks
 * `null` means REMOVE the facet. "Clear this facet" is a removal rather than an empty rule, so the
 * engine holds no rule the panel does not show — the panel enforces that in one place and every
 * section, including this one, writes through it.
 */
export type FacetCommit = (ruleId: RuleId, rule: FilterRule | null) => void;

/** The mounted distance section. */
export interface GeoSection {
	/** Drop the map and its Leaflet handle. */
	readonly dispose: () => void;
	/** The `<section>` element, ready to append into the panel body. */
	readonly element: HTMLElement;
	/**
	 * Re-measure the map after the panel is revealed.
	 *
	 * @remarks
	 * Leaflet reads its container's size ONCE at initialization and caches it. The mobile collapse hides
	 * the panel with the `hidden` attribute rather than destroying it, so a map that initializes while
	 * the collapse is closed measures 0×0 and, without this, lays out a single tile in the corner
	 * forever. The route wires this to the breakpoint tracker's `subscribe`.
	 */
	readonly invalidateMapSize: () => void;
	/**
	 * Re-apply the committed circle.
	 *
	 * @param radius - The engine's distance rule as `deriveGeoRadius` reads it, or `undefined` when the
	 *   facet is off.
	 */
	readonly update: (radius: GeoRadius | undefined) => void;
}

/** Construction options for {@link createGeoSection}. */
export interface GeoSectionOptions {
	/** The panel's single write path. */
	readonly commit: FacetCommit;
	/**
	 * The metro dropdown's options.
	 *
	 * @remarks
	 * Passed in rather than derived here, because the results header needs the identical list to name
	 * the Distance chip's center. Two derivations would be two full corpus passes and two chances to
	 * disagree about where a metro's centroid is — and disagreeing would mean the dropdown reading
	 * "Greater Denver" while the chip printed coordinates.
	 */
	readonly metroCenters: readonly MetroCenterOption[];
}

/** Where the map opens before the user picks a metro or grants location. */
const DEFAULT_CENTER: MapCoords = { lat: 37.7749, lng: -122.4194 };

/** A 15-mile default: wide enough to return results in any metro, tight enough to mean something. */
const DEFAULT_RADIUS_KM = milesToKm(15);

/** Radius slider extents, in miles — the unit the control is labelled in. */
const RADIUS_MIN_MILES = 1;
const RADIUS_MAX_MILES = 60;

/** Coordinates are read at most once a minute, and a stale-by-a-minute fix is still your block. */
const GEOLOCATION_MAX_AGE_MS = 60_000;
const GEOLOCATION_TIMEOUT_MS = 10_000;

/** The radius input's id, so its `<label for>` associates. One geo section exists per page. */
const RADIUS_INPUT_ID = 'fe-geo-radius';

/**
 * Build the distance section.
 *
 * @param options - The panel's commit path and the metro options.
 * @returns The mounted section.
 */
export function createGeoSection(options: GeoSectionOptions): GeoSection {
	const { commit, metroCenters } = options;

	/** Last-used center + radius, so turning the filter back on restores the user's choice. */
	let center: MapCoords = DEFAULT_CENTER;
	let radiusKm = DEFAULT_RADIUS_KM;
	/** The slider's mid-drag value, or `null` when idle. */
	let draftRadiusKm: number | null = null;
	let isEnabled = false;
	let isLocating = false;
	let locationError: string | null = null;

	/**
	 * Write the geo rule for a center and radius.
	 *
	 * @remarks
	 * The controls are NOT painted here. The engine change fires the panel's `update`, which calls
	 * {@link GeoSection.update} with the committed rule — so what is on screen is always what the
	 * engine holds, and a write that somehow failed to land shows as a control that did not move.
	 *
	 * @param nextCenter - The circle's center.
	 * @param nextRadiusKm - The circle's radius, in kilometers.
	 */
	function commitGeo(nextCenter: MapCoords, nextRadiusKm: number): void {
		center = nextCenter;
		radiusKm = nextRadiusKm;
		commit(GEO_RADIUS_RULE_ID, buildListingGeoRadiusRule({ center: nextCenter, radiusKm: nextRadiusKm }));
	}

	/**
	 * The live map, or `null` while the filter is off. Each map's `onCenterChange` reads the CURRENT
	 * radius out of the closure rather than a copy captured at creation, which is what makes it safe
	 * to hand over exactly once (see radiusMap's docs on callback stability).
	 */
	let map: RadiusMap | null = null;

	const enableToggle = createCheckboxControl({
		label: 'Filter by distance',
		onToggle: (checked) => {
			if (checked) {
				commitGeo(center, radiusKm);

				return;
			}
			commit(GEO_RADIUS_RULE_ID, null);
		},
	});

	const metroSelect = createSelectMenu({
		onChange: (label) => {
			const option = metroCenters.find((candidate) => candidate.label === label);

			// The placeholder ("Custom location") is a real option so the user can see where they are,
			// but choosing it means nothing — there is no coordinate to move to.
			if (option === undefined) {
				return;
			}
			commitGeo(option.center, radiusKm);
		},
		placeholder: 'Custom location',
		selectLabel: 'Metro area',
	});

	const locateButton = el('button', {
		attrs: {
			'aria-label': 'Center the search radius on my current location',
			type: 'button',
		},
		className: 'fe-geo__locate',
		on: {
			click: () => {
				locateMe();
			},
		},
	});

	const radiusValue = el('span', { className: 'fe-geo__radius-value' });
	// A native single-handle range input: `createRangeSlider` is dual-handle by construction, and a
	// radius has one end.
	const radiusInput = el('input', {
		attrs: {
			id: RADIUS_INPUT_ID,
			max: RADIUS_MAX_MILES,
			min: RADIUS_MIN_MILES,
			step: 1,
			type: 'range',
		},
		className: 'fe-geo__radius',
		on: {
			blur: () => {
				commitRadius();
			},
			input: (event) => {
				draftRadiusKm = milesToKm(Number((event.target as HTMLInputElement).value));
				paint();
			},
			keyup: () => {
				commitRadius();
			},
			pointerup: () => {
				commitRadius();
			},
		},
	});

	const statusNote = el('p', { attrs: { 'aria-live': 'polite' }, className: 'fe-geo__status' });
	const errorNote = el('p', { attrs: { role: 'alert' }, className: 'fe-geo__error' });

	/** The radius label and slider. The map's frame is inserted directly above it while it exists. */
	const radiusBlock = el('div', {
		children: [
			el('label', {
				attrs: { for: RADIUS_INPUT_ID },
				children: [el('span', { text: 'Radius' }), radiusValue],
				className: 'fe-geo__radius-label',
			}),
			radiusInput,
		],
	});

	/** Everything below the enable checkbox — present in the DOM, hidden while the filter is off. */
	const body = el('div', {
		children: [
			el('div', {
				children: [
					el('span', { className: 'fe-geo__label', text: 'Metro area' }),
					el('div', {
						children: [
							el('div', { children: [metroSelect.element], className: 'fe-geo__select' }),
							locateButton,
						],
						className: 'fe-geo__row',
					}),
				],
			}),
			radiusBlock,
			statusNote,
			errorNote,
		],
	});

	/**
	 * Show the rule's circle: build the map in its slot on the first enable, then point it at the view.
	 *
	 * @param nextCenter - The rule's center.
	 * @param nextRadiusKm - The rule's radius.
	 */
	function showMap(nextCenter: MapCoords, nextRadiusKm: number): void {
		if (map === null) {
			map = createRadiusMap({
				onCenterChange: (next) => {
					commitGeo(next, radiusKm);
				},
			});
			radiusBlock.before(map.element);
		}
		// Idempotent: the first call loads Leaflet, every later call only records the view.
		map.mount(nextCenter, nextRadiusKm);
		map.setCenter(nextCenter);
		map.setRadius(nextRadiusKm);
	}

	/** Destroy the map and take its frame out of the section — the filter is off. */
	function dropMap(): void {
		map?.destroy();
		map?.element.remove();
		map = null;
	}

	/**
	 * Commit the drag, if it moved anything.
	 *
	 * @remarks
	 * Clearing the draft FIRST, then testing it, is what makes a pointer-up that changed nothing (and
	 * the `keyup` that fires for every arrow key) a no-op rather than a redundant engine write.
	 */
	function commitRadius(): void {
		const draft = draftRadiusKm;

		draftRadiusKm = null;
		if (draft === null || draft === radiusKm) {
			paint();

			return;
		}
		commitGeo(center, draft);
	}

	/** Ask the browser where we are, and recenter on the answer. */
	function locateMe(): void {
		if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
			locationError = 'Location is not available in this browser.';
			paint();

			return;
		}
		isLocating = true;
		locationError = null;
		paint();
		navigator.geolocation.getCurrentPosition(
			(position) => {
				isLocating = false;
				commitGeo(
					{ lat: position.coords.latitude, lng: position.coords.longitude },
					radiusKm,
				);
				paint();
			},
			(error) => {
				isLocating = false;
				// Two messages, because the two causes have different remedies: a denied permission is
				// something the user can reverse, an unavailable fix is something they can only retry.
				locationError =
					error.code === error.PERMISSION_DENIED
						? 'Location permission was denied.'
						: 'Your location could not be determined.';
				paint();
			},
			{ maximumAge: GEOLOCATION_MAX_AGE_MS, timeout: GEOLOCATION_TIMEOUT_MS },
		);
	}

	/** Re-apply every control from the section's current state. */
	function paint(): void {
		// Miles are what the slider speaks; the draft wins while a drag is in flight.
		const shownMiles = Math.round(kmToMiles(draftRadiusKm ?? radiusKm));

		enableToggle.update({ checked: isEnabled });
		setHidden(body, !isEnabled);

		metroSelect.update({
			options: metroCenters.map((option) => ({ label: option.label, value: option.label })),
			value: findMetroLabel(metroCenters, center) ?? '',
		});

		locateButton.textContent = isLocating ? 'Locating…' : 'Near me';
		locateButton.disabled = isLocating;

		radiusValue.textContent = `${String(shownMiles)} mi`;
		radiusInput.value = String(shownMiles);

		// Reads the COMMITTED radius, not the draft: a live region firing on every pixel of a drag would
		// flood a screen reader with numbers nobody asked for. It updates once, when the drag lands.
		statusNote.textContent = `Showing listings within ${String(Math.round(kmToMiles(radiusKm)))} miles of ${describeMapCoords(metroCenters, center)}`;

		errorNote.textContent = locationError ?? '';
		setHidden(errorNote, locationError === null);
	}

	paint();

	return {
		dispose: () => {
			dropMap();
		},

		element: section('Distance', el('div', {
			children: [enableToggle.element, body],
			className: 'fe-geo',
		})),

		invalidateMapSize: () => {
			map?.invalidateSize();
		},

		update: (radius) => {
			isEnabled = radius !== undefined;
			if (radius === undefined) {
				dropMap();
			} else {
				center = radius.center;
				radiusKm = radius.radiusKm;
				showMap(center, radiusKm);
			}
			paint();
		},
	};
}
