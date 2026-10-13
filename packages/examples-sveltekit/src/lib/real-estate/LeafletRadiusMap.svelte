<script lang="ts">
	/**
	 * `<LeafletRadiusMap>` — the Svelte wrapper around the shared imperative radius-map controller.
	 *
	 * @remarks
	 * The controller owns the map lifecycle, the view-sync rules and the marker glyph; five verticals
	 * wrap it in their own idiom. This wrapper is that idiom for Svelte: create in `onMount`, push
	 * prop changes through two `$effect`s, destroy in `onDestroy`.
	 *
	 * ### Leaflet is imported at runtime, never at module scope
	 *
	 * `leaflet` touches `window` when it loads, so a static import would reach SvelteKit's server
	 * bundle and throw during SSR. The `await import()` inside `onMount` runs only in the browser. This
	 * component is itself dynamically imported by `<RealEstateView>` for the same reason, which makes
	 * two layers of laziness — belt and braces, and cheap.
	 *
	 * ### `onCenterChange` is captured once, so it must not be a moving target
	 *
	 * The controller captures the callback at creation; swapping it would mean recreating the map,
	 * tearing down the tile layer and losing the user's zoom. The prop is therefore read through a
	 * mutable box that the effect keeps current, so the function handed to the controller never
	 * changes identity while always calling the latest prop.
	 *
	 * ### The `ResizeObserver` keeps the map correct on mobile
	 *
	 * Leaflet measures its container ONCE at initialization and caches the result. On mobile the filter
	 * panel starts closed behind a `hidden` attribute — `display: none`, so the container genuinely has
	 * no box — and a map created in there lays out a single tile in the corner and never recovers. The
	 * observer fires when the element gains a size on reveal, and `invalidateSize()` makes Leaflet
	 * re-measure. It covers the sidebar resizing and device rotation for free, which a one-shot
	 * "the panel opened" signal threaded down from the view would not.
	 */

	// `import type`, so it erases at compile and this file never actually reaches the leaflet-bearing
	// module at runtime. The VALUE it needs (`METERS_PER_KM`) comes from the pure-geometry re-export on
	// `real-estate-domain` instead.
	import type { RadiusMapController } from '@filter-enginez/examples-shared/real-estate-map';

	import { type MapCoords, METERS_PER_KM } from '@filter-enginez/examples-shared/real-estate-domain';
	import { onDestroy, onMount } from 'svelte';

	interface Props {
		/** Accessible name for the map region. */
		readonly ariaLabel?: string;
		/** The circle's center. */
		readonly center: MapCoords;
		/** Called once per completed marker drag, with the marker's new position. */
		readonly onCenterChange: (next: MapCoords) => void;
		/** The circle's radius, in kilometers — the unit the engine's `GeoProximityRule` uses. */
		readonly radiusKm: number;
	}

	const {
		ariaLabel = 'Map of the listing search area — drag the cyan marker to move the center',
		center,
		onCenterChange,
		radiusKm,
	}: Props = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	/**
	 * The live controller, or `null` until the dynamic import resolves.
	 *
	 * @remarks
	 * `$state.raw` rather than a plain `let`, so the sync effects below re-run the moment the map
	 * exists. A plain `let` left them having run exactly once, against nothing.
	 */
	let controller = $state.raw<RadiusMapController | null>(null);

	/** The latest `onCenterChange`, so the controller's captured callback stays correct. */
	// Capturing the INITIAL value is the point — the effect below keeps it current, and the controller
	// holds a stable wrapper that reads this box.
	// svelte-ignore state_referenced_locally
	let latestOnCenterChange = onCenterChange;

	$effect(() => {
		latestOnCenterChange = onCenterChange;
	});

	onMount(async () => {
		// Kept on ONE line deliberately: wrapped, the formatter adds a trailing comma inside
		// `import(...)`, which Svelte's parser rejects as a syntax error.
		const mapModule = await import('@filter-enginez/examples-shared/real-estate-map');

		// The element is bound by the time `onMount` runs, but the await above yields — and a fast
		// unmount in between would leave this null. Bailing is correct: `onDestroy` has already run.
		if (containerEl === null) {
			return;
		}
		controller = mapModule.createRadiusMapController(containerEl, {
			center,
			onCenterChange: (next) => {
				latestOnCenterChange(next);
			},
			radiusMeters: radiusKm * METERS_PER_KM,
			// Read once, at creation: Leaflet takes its animation options at construction, so a later
			// change to the media query cannot be applied without rebuilding the map.
			shouldReduceMotion:
				typeof window !== 'undefined' && typeof window.matchMedia === 'function'
					? window.matchMedia('(prefers-reduced-motion: reduce)').matches
					: false,
		});
	});

	/*
	 * ⚠️ READ THE PROP INTO A LOCAL FIRST. This is not style.
	 *
	 * `controller?.setCenter(center)` looks equivalent and is not: optional chaining short-circuits
	 * BEFORE evaluating the arguments, so while `controller` is `null` the expression never reads
	 * `center` at all. An effect that reads nothing tracks nothing — so on its first run (which happens
	 * while the dynamic `import()` above is still in flight, i.e. always) it would register zero
	 * dependencies and never run again.
	 *
	 * The symptom would be a map that ignores every programmatic move: "Near me" resolves, the rule
	 * commits, the results narrow, and the marker sits where it was. Dragging still works, because that
	 * path is Leaflet moving its own marker and reporting outward — which is exactly why it looks like
	 * a geolocation bug rather than a reactivity one.
	 */
	$effect(() => {
		const nextCenter = center;

		// A no-op after destroy, and the controller only recenters the viewport when the point has gone
		// off screen — dragging the marker within view must not yank the map out from under the cursor.
		controller?.setCenter(nextCenter);
	});

	$effect(() => {
		const nextRadiusMeters = radiusKm * METERS_PER_KM;

		controller?.setRadius(nextRadiusMeters);
	});

	// Re-measure whenever the container gains or changes size — see the docblock.
	$effect(() => {
		if (containerEl === null || typeof ResizeObserver === 'undefined') {
			return undefined;
		}
		const observer = new ResizeObserver(() => {
			controller?.invalidateSize();
		});

		observer.observe(containerEl);

		return () => {
			observer.disconnect();
		};
	});

	onDestroy(() => {
		controller?.destroy();
		controller = null;
	});
</script>

<div class="fe-geo__map" role="region" aria-label={ariaLabel}>
	<div class="fe-geo__map-canvas" bind:this={containerEl}></div>
</div>
