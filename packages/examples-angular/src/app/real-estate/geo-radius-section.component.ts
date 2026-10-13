/**
 * `<fe-geo-radius-section>` — the distance filter: a metro dropdown, a draggable map marker and a
 * radius slider, committed as one `GeoProximityRule`.
 *
 * @remarks
 * The fourteenth facet by rule count and the second by render order, and the only one that reaches a
 * mapping library — which is why the panel loads it behind a `@defer` block rather than rendering it
 * inline with the other thirteen.
 *
 * ### Miles above, kilometers below
 *
 * Every surface a person sees is in miles; the engine's rule and the map's circle are both in
 * kilometers. The conversion happens at exactly two points — reading the slider and writing the
 * readout — and nowhere in between, because a value that is sometimes miles and sometimes kilometers
 * is a bug waiting for a code review that does not catch it.
 *
 * ### Enablement is DERIVED; center and radius are a re-seeded mirror
 *
 * Vue and Svelte hold all three locally and hand a reset callback up to the panel so "clear all" can
 * reach them. This vertical does not need that machinery, because the panel derives every other facet
 * from `activeRules$` and this one can too: the rule's PRESENCE is the checkbox, so an external
 * `clearRules()` unchecks it with no reset table, no registration handshake and no chance of the two
 * lists drifting.
 *
 * Center and radius are the exception, and deliberately so. They must survive the filter being turned
 * OFF — unchecking and rechecking should not silently throw away the metro the user chose — so they
 * live in local signals, re-seeded from the committed rule by an effect. That effect is what makes a
 * shared `?f` link open the map on the sender's location rather than on San Francisco. Same pattern,
 * same reason, as the books panel's three text mirrors.
 *
 * ### The radius commits on RELEASE, not on input
 *
 * Dragging the slider paints a draft value immediately and commits once, on pointer-up / key-up /
 * blur. Committing per input event would re-run an R-tree query and a full bundle round trip for every
 * pixel of the drag. The draft is `null` when not dragging, which is what distinguishes "the user is
 * mid-gesture" from "the radius happens to equal the committed one".
 *
 * ### While disabled, nothing is mounted
 *
 * The map, the dropdown and the slider only exist when the filter is on. An unmounted map fetches no
 * tiles, which matters on a route where most visitors never touch the distance filter.
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

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectEngineBusy, injectFilterEngine } from '@filter-enginez/angular-rxjs';
import { geo, type GeoProximityRule, type RuleId } from '@filter-enginez/core';
import {
	describeMapCoords,
	extractListingCoords,
	findMetroLabel,
	kmToMiles,
	type MapCoords,
	milesToKm,
} from '@filter-enginez/examples-shared/real-estate-domain';

import { CheckboxControlComponent } from '../controls/checkbox-control.component.js';
import { SectionHeaderComponent } from '../controls/section-header.component.js';
import {
	SelectMenuComponent,
	type SelectMenuOption,
} from '../controls/select-menu.component.js';
import { LeafletRadiusMapComponent } from './leaflet-radius-map.component.js';
import { injectRealEstateFacets } from './real-estate-facets.js';

/** Rule id + registry key for the distance filter. */
const GEO_RULE_ID: RuleId = 'geo-proximity';

/** Where the map opens before the user picks a metro or grants location. */
const DEFAULT_CENTER: MapCoords = { lat: 37.7749, lng: -122.4194 };

/** A 15-mile default: wide enough to return results in any metro, tight enough to mean something. */
const DEFAULT_RADIUS_KM = milesToKm(15);

/** Radius slider extremes, in miles — the unit the control and its readout both speak. */
const RADIUS_MIN_MILES = 1;
const RADIUS_MAX_MILES = 60;

/** Coordinates are read at most once a minute, and a stale-by-a-minute fix is still your block. */
const GEOLOCATION_MAX_AGE_MS = 60_000;
const GEOLOCATION_TIMEOUT_MS = 10_000;

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CheckboxControlComponent,
		LeafletRadiusMapComponent,
		SectionHeaderComponent,
		SelectMenuComponent,
	],
	selector: 'fe-geo-radius-section',
	template: `
		<section class="fe-geo">
			<fe-section-header label="Distance" />

			<fe-checkbox-control
				label="Filter by distance"
				[isChecked]="isEnabled()"
				(toggled)="toggleEnabled($event)"
			/>

			@if (isEnabled()) {
				<div>
					<span class="fe-geo__label">Metro area</span>
					<div class="fe-geo__row">
						<div class="fe-geo__select">
							<fe-select-menu
								selectLabel="Metro area"
								placeholder="Custom location"
								[options]="metroOptions"
								[value]="selectedMetroLabel()"
								(valueChange)="selectMetro($event)"
							/>
						</div>
						<button
							type="button"
							class="fe-geo__locate"
							aria-label="Center the search radius on my current location"
							[disabled]="isLocating()"
							(click)="locateMe()"
						>
							{{ isLocating() ? 'Locating…' : 'Near me' }}
						</button>
					</div>
				</div>

				<fe-leaflet-radius-map
					[center]="center()"
					[isPanelVisible]="isPanelVisible()"
					[radiusKm]="radiusKm()"
					(centerChange)="recenter($event)"
				/>

				<div>
					<label class="fe-geo__radius-label" for="fe-geo-radius">
						<span>Radius</span>
						<span class="fe-geo__radius-value">{{ shownRadiusMiles() }} mi</span>
					</label>
					<!--
						A native single-handle range input: fe-range-slider is dual-handle by construction, and
						a radius has one end. The three commit listeners cover the three ways a gesture can end
						— pointer release, key release, and losing focus mid-drag.
					-->
					<input
						id="fe-geo-radius"
						class="fe-geo__radius"
						type="range"
						step="1"
						[min]="radiusMinMiles"
						[max]="radiusMaxMiles"
						[value]="shownRadiusMiles()"
						(input)="draftRadius($event)"
						(pointerup)="commitRadius()"
						(keyup)="commitRadius()"
						(blur)="commitRadius()"
					/>
				</div>

				<p class="fe-geo__status" aria-live="polite">{{ liveRegionText() }}</p>

				@if (locationError() !== null) {
					<p class="fe-geo__error" role="alert">{{ locationError() }}</p>
				}
			}
		</section>
	`,
})
export class GeoRadiusSectionComponent {
	/**
	 * Whether the filter panel is currently on screen.
	 *
	 * @remarks
	 * Passed straight through to the map, which is the only thing that cares — see that component's
	 * `isPanelVisible` docs for why Leaflet needs telling.
	 */
	public readonly isPanelVisible = input.required<boolean>();

	private readonly _busy = injectEngineBusy();
	private readonly _engine = injectFilterEngine<Listing>();

	/**
	 * The metro dropdown's options.
	 *
	 * @remarks
	 * From DI rather than derived here, because the results header needs the identical list to name the
	 * Distance chip's center. Two derivations would be two full corpus passes and two chances to
	 * disagree about where a metro's centroid is — and disagreeing would mean the dropdown reading
	 * "Greater Denver" while the chip printed coordinates.
	 */
	private readonly _metroCenters = injectRealEstateFacets().metroCenters;

	/** Every rule on the engine — what enablement, center and radius all ultimately derive from. */
	private readonly _activeRules = toSignal(this._engine.activeRules$, { requireSync: true });

	/** The committed distance filter, or `undefined` when the facet is off. */
	private readonly _committedRule = computed<GeoProximityRule | undefined>(
		() => this._activeRules().get(GEO_RULE_ID) as GeoProximityRule | undefined,
	);

	/** The circle's center. Local, so it survives the filter being switched off. See the class remarks. */
	protected readonly center = signal<MapCoords>(DEFAULT_CENTER);

	/** The circle's radius in kilometers. Local for the same reason as {@link center}. */
	protected readonly radiusKm = signal<number>(DEFAULT_RADIUS_KM);

	/** The slider's mid-drag value in kilometers, or `null` when not dragging. */
	protected readonly draftRadiusKm = signal<number | null>(null);

	/** Whether a geolocation request is in flight — disables the button so it cannot be double-fired. */
	protected readonly isLocating = signal(false);

	/** The last geolocation failure, or `null`. Purely local; the filter itself is unaffected. */
	protected readonly locationError = signal<string | null>(null);

	/** Whether the distance filter is on. The rule's PRESENCE is the checkbox — see the class remarks. */
	protected readonly isEnabled = computed<boolean>(() => this._committedRule() !== undefined);

	/** Slider extremes, exposed for the template (which cannot read module constants). */
	protected readonly radiusMaxMiles = RADIUS_MAX_MILES;

	/** @see radiusMaxMiles */
	protected readonly radiusMinMiles = RADIUS_MIN_MILES;

	/**
	 * The dropdown's entries, labelled by name and keyed by the same string.
	 *
	 * @remarks
	 * A plain field, not a `computed`: the metro list is derived once at the route from the booted
	 * corpus and never changes, so recomputing it would be work with no input to react to.
	 */
	protected readonly metroOptions: readonly SelectMenuOption[] = this._metroCenters.map((option) => ({
		label: option.label,
		value: option.label,
	}));

	/** The metro whose centroid we are sitting on, or `''` for a custom position. */
	protected readonly selectedMetroLabel = computed<string>(
		() => findMetroLabel(this._metroCenters, this.center()) ?? '',
	);

	/** What the readout shows — the draft while dragging, the committed value otherwise. */
	protected readonly shownRadiusMiles = computed<number>(() =>
		Math.round(kmToMiles(this.draftRadiusKm() ?? this.radiusKm())),
	);

	/**
	 * The announcement.
	 *
	 * @remarks
	 * Reads the COMMITTED radius, not the draft: a live region firing on every pixel of a drag would
	 * flood a screen reader with numbers nobody asked for. It updates once, when the drag lands.
	 */
	protected readonly liveRegionText = computed<string>(() => {
		const miles = Math.round(kmToMiles(this.radiusKm()));

		return `Showing listings within ${String(miles)} miles of ${describeMapCoords(this._metroCenters, this.center())}`;
	});

	public constructor() {
		// Re-seed the two mirrors from the COMMITTED rule. This is what makes a shared `?f` link open
		// the map where the sender left it, and what keeps a rule written from anywhere else in the
		// route — the devtools, a JSON config — from leaving the map pointing somewhere else entirely.
		//
		// No loop risk: this effect never READS `center` or `radiusKm`, only writes them, and each write
		// hands back the very object already on the rule, so the signals see no change at all after a
		// commit made from this component.
		effect(() => {
			const rule = this._committedRule();

			if (rule === undefined) {
				return;
			}
			this.center.set(rule.config.center);
			this.radiusKm.set(rule.config.radiusKm);
		});
	}

	/**
	 * Paint the draft radius while the handle moves. Nothing is committed yet.
	 *
	 * @param event - The range input's `input` event.
	 */
	protected draftRadius(event: Event): void {
		this.draftRadiusKm.set(milesToKm(Number((event.target as HTMLInputElement).value)));
	}

	/** Commit the drag, if it moved anything. */
	protected commitRadius(): void {
		const draft = this.draftRadiusKm();

		this.draftRadiusKm.set(null);
		if (draft === null || draft === this.radiusKm()) {
			return;
		}
		this._commitGeoRule(this.center(), draft);
	}

	/** Ask the browser where we are, and recenter on the answer. */
	protected locateMe(): void {
		if (!('geolocation' in navigator)) {
			this.locationError.set('Location is not available in this browser.');

			return;
		}
		this.isLocating.set(true);
		this.locationError.set(null);
		navigator.geolocation.getCurrentPosition(
			(position) => {
				this.isLocating.set(false);
				this._commitGeoRule(
					{ lat: position.coords.latitude, lng: position.coords.longitude },
					this.radiusKm(),
				);
			},
			(error) => {
				this.isLocating.set(false);
				// Two messages, because the two causes have different remedies: a denied permission is
				// something the user can reverse, an unavailable fix is something they can only retry.
				this.locationError.set(
					error.code === error.PERMISSION_DENIED
						? 'Location permission was denied.'
						: 'Your location could not be determined.',
				);
			},
			{ maximumAge: GEOLOCATION_MAX_AGE_MS, timeout: GEOLOCATION_TIMEOUT_MS },
		);
	}

	/**
	 * Move the circle to a position the user dragged the marker to.
	 *
	 * @param next - The marker's new position.
	 */
	protected recenter(next: MapCoords): void {
		this._commitGeoRule(next, this.radiusKm());
	}

	/**
	 * Recenter on a metro, or do nothing for the "custom location" placeholder.
	 *
	 * @param label - The chosen option's label, or `''` for the placeholder.
	 */
	protected selectMetro(label: string): void {
		const option = this._metroCenters.find((candidate) => candidate.label === label);

		if (option === undefined) {
			return;
		}
		this._commitGeoRule(option.center, this.radiusKm());
	}

	/**
	 * Turn the whole filter on or off.
	 *
	 * @remarks
	 * Off REMOVES the rule rather than writing a permissive one, matching every selection facet in the
	 * panel: a `GeoProximityRule` has no neutral configuration, so a radius of zero would filter to
	 * nothing rather than to everything.
	 *
	 * @param nextEnabled - The checkbox's new state.
	 */
	protected toggleEnabled(nextEnabled: boolean): void {
		if (nextEnabled) {
			this._commitGeoRule(this.center(), this.radiusKm());

			return;
		}
		this._busy.markUserAction();
		this._engine.core.removeRule(GEO_RULE_ID);
	}

	/**
	 * Write the geo rule for a center and radius, painting the controls first.
	 *
	 * @remarks
	 * `markUserAction()` before the engine write, so the "computing" indicator lights on the same frame
	 * the user clicks rather than a frame after the results have already moved.
	 *
	 * A FUNCTION extractor, not a field name: `Listing.coordinates` is `{ lat, lon }` and the rule wants
	 * `{ lat, lng }`. The rule can do this because it never has to survive serialization to a worker on
	 * this tier — the bundle query, which does, is why `locationId` had to be materialized as a real
	 * field while this one did not.
	 *
	 * @param nextCenter - The circle's center.
	 * @param nextRadiusKm - The circle's radius, in kilometers.
	 */
	private _commitGeoRule(nextCenter: MapCoords, nextRadiusKm: number): void {
		this.center.set(nextCenter);
		this.radiusKm.set(nextRadiusKm);
		this._busy.markUserAction();
		this._engine.core.addRule(
			GEO_RULE_ID,
			geo(extractListingCoords, { center: nextCenter, radiusKm: nextRadiusKm }),
		);
	}
}
