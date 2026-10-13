/**
 * `real-estate/radiusMap` — the framework-less wrapper around the shared imperative radius-map
 * controller.
 *
 * @remarks
 * `createRadiusMapController` owns the map lifecycle, the view-sync rules and the marker glyph; every
 * vertical wraps it in its own idiom — a React ref + effect, a Svelte action, a Vue `onMounted`, an
 * Angular directive. Its docblock names "a bare call in the framework-less app" as a consumer, and
 * this module is that call. What it adds is only what the *absence* of a framework
 * costs: a place to hold the controller, and a queue for state that arrives before it does.
 *
 * ### Leaflet is reached ONLY through a dynamic `import()`
 *
 * `@filter-enginez/examples-shared/real-estate-map` opens with `import 'leaflet/dist/leaflet.css'` and
 * pulls `leaflet` itself, which touches `window` as it loads. Nothing in `real-estate/` may reach that
 * subpath statically — the `RadiusMapController` type above is an `import type`, so it erases at
 * compile and this file never actually loads the module until {@link RadiusMap.mount} runs. The
 * payoff is concrete: a visitor who never opens the distance filter never downloads a mapping library.
 *
 * ### Center and radius are BUFFERED, not dropped
 *
 * The import is asynchronous, so a `setCenter` issued between `mount()` and the module resolving has
 * no controller to talk to. The reactive verticals get this for free — their effects re-run when the
 * controller ref fills — but here the equivalent is explicit: the latest center and radius are held in
 * closure variables and applied at creation. Dropping them instead would leave the map opening on the
 * default San Francisco pin after a shared `?f` link asked for Denver, which reads as the URL state
 * having failed to load rather than as a race.
 *
 * ### The callback is captured ONCE
 *
 * `onCenterChange` is handed to the controller at creation and never swapped. Recreating the map to
 * change it would tear down the tile layer and lose the user's zoom, so the geo section passes a
 * stable function that reads its own current state rather than a fresh closure per commit.
 *
 * @packageDocumentation
 */

import type { RadiusMapController } from '@filter-enginez/examples-shared/real-estate-map';

import { prefersReducedMotion } from '@filter-enginez/brand/motion';
import { el } from '@filter-enginez/examples-shared/dom';
import {
	type MapCoords,
	METERS_PER_KM,
} from '@filter-enginez/examples-shared/real-estate-domain';

/**
 * Accessible name for the map region.
 *
 * @remarks
 * It names the INTERACTION as well as the content, because the marker is the only way to set a center
 * the dropdown does not offer and nothing else on screen says so.
 */
const MAP_LABEL = 'Map of the listing search area — drag the cyan marker to move the center';

/** A mounted map frame plus the imperative handle the geo section drives it with. */
export interface RadiusMap {
	/** Tear the map down and block every later call. Idempotent. */
	readonly destroy: () => void;
	/** The map frame — append it once; it outlives every mount. */
	readonly element: HTMLElement;
	/** Re-measure the container after it is revealed from a hidden state. Safe before mount. */
	readonly invalidateSize: () => void;
	/**
	 * Start loading Leaflet and create the map. Idempotent — a second call only records the requested
	 * center + radius, so the geo section can call it on every enable without tracking whether it has.
	 *
	 * @param center - Where the circle opens.
	 * @param radiusKm - The circle's radius, in kilometers.
	 */
	readonly mount: (center: MapCoords, radiusKm: number) => void;
	/** Move the circle + marker. Buffered until the controller exists. */
	readonly setCenter: (next: MapCoords) => void;
	/** Resize the circle and refit the viewport. Buffered until the controller exists. */
	readonly setRadius: (radiusKm: number) => void;
}

/** Construction options for {@link createRadiusMap}. */
export interface RadiusMapOptions {
	/**
	 * Called once per completed marker drag. Captured ONCE by the controller, so this must be a stable
	 * function that reads current state rather than a closure over a snapshot of it.
	 */
	readonly onCenterChange: (next: MapCoords) => void;
}

/**
 * Build the map frame and its lazy controller.
 *
 * @param options - The (stable) drag callback.
 * @returns The frame element plus the imperative handle.
 */
export function createRadiusMap(options: RadiusMapOptions): RadiusMap {
	const { onCenterChange } = options;

	// Two elements: the frame carries the resolved height Leaflet needs to measure, the canvas is what
	// Leaflet stamps and fills. Handing Leaflet the frame directly would work until the frame grew a
	// sibling, which is a footgun the other verticals already avoid the same way.
	const canvas = el('div', { className: 'fe-geo__map-canvas' });
	const element = el('div', {
		attrs: { 'aria-label': MAP_LABEL, role: 'region' },
		children: [canvas],
		className: 'fe-geo__map',
	});

	let controller: RadiusMapController | null = null;
	let isLoading = false;
	let isDestroyed = false;
	/** The latest requested view, applied at creation when the controller arrives late. */
	let center: MapCoords | null = null;
	let radiusKm = 0;

	return {
		destroy: () => {
			isDestroyed = true;
			controller?.destroy();
			controller = null;
		},

		element,

		invalidateSize: () => {
			controller?.invalidateSize();
		},

		mount: (nextCenter, nextRadiusKm) => {
			center = nextCenter;
			radiusKm = nextRadiusKm;
			if (isDestroyed || isLoading || controller !== null) {
				return;
			}
			isLoading = true;
			void import('@filter-enginez/examples-shared/real-estate-map').then(
				(module) => {
					isLoading = false;
					// The section may have been torn down while the chunk was in flight; `center` is only
					// null when `mount` never ran, which cannot happen here but keeps the narrowing honest.
					if (isDestroyed || center === null) {
						return;
					}
					controller = module.createRadiusMapController(canvas, {
						center,
						onCenterChange,
						radiusMeters: radiusKm * METERS_PER_KM,
						// Read once, at creation: Leaflet takes its animation options at construction, so a
						// later change to the media query cannot be applied without rebuilding the map.
						shouldReduceMotion: prefersReducedMotion(),
					});
				},
				(error: unknown) => {
					isLoading = false;
					// The dropdown, the radius slider and the rule all still work without a map — the map is
					// the only part of this facet that needs a network chunk, so a failed load degrades to a
					// mapless distance filter rather than taking the route down.
					console.error('[real-estate] the radius map failed to load:', error);
				},
			);
		},

		setCenter: (next) => {
			center = next;
			controller?.setCenter(next);
		},

		setRadius: (nextRadiusKm) => {
			radiusKm = nextRadiusKm;
			controller?.setRadius(nextRadiusKm * METERS_PER_KM);
		},
	};
}
