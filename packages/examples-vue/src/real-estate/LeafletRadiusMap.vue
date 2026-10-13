<script setup lang="ts">
/**
 * `<LeafletRadiusMap>` — the Vue wrapper around the shared imperative radius-map controller.
 *
 * @remarks
 * The controller owns the map lifecycle, the view-sync rules and the marker glyph; the verticals wrap
 * it in their own idiom. This wrapper is that idiom for Vue: create in `onMounted`, push prop changes
 * through two `watchEffect`s, destroy in `onUnmounted`.
 *
 * ### Leaflet is imported at runtime, never at module scope
 *
 * `leaflet` touches `window` when it loads. The `await import()` inside `onMounted` runs only in the
 * browser — and this component is itself dynamically imported by `<RealEstateView>`, which makes two
 * layers of laziness. The Vue app is a client-only SPA so there is no server bundle to protect, but the
 * laziness still buys the thing that matters on this route: a visitor who never opens the distance
 * filter never downloads a mapping library.
 *
 * ### `centerChange` is captured once, so it must not be a moving target
 *
 * The controller captures its callback at creation; swapping it would mean recreating the map, tearing
 * down the tile layer and losing the user's zoom. So the controller is handed a stable wrapper that
 * emits, and the emit itself is stable for the component's lifetime.
 *
 * ### The `ResizeObserver` keeps the mobile map sized
 *
 * Leaflet measures its container ONCE at initialization and caches the result. On mobile the filter
 * panel starts closed behind a `hidden` attribute — `display: none`, so the container genuinely has no
 * box — and a map created in there lays out a single tile in the corner and never recovers. The
 * observer fires when the element gains a size on reveal, and `invalidateSize()` makes Leaflet
 * re-measure. It covers the sidebar resizing and device rotation for free, which a one-shot "the panel
 * opened" signal threaded down from the view would not.
 */
// `import type`, so it erases at compile and this file never actually reaches the leaflet-bearing
// module at runtime. The VALUE it needs (`METERS_PER_KM`) comes from the pure-geometry re-export on
// `real-estate-domain` instead.
import type { RadiusMapController } from '@filter-enginez/examples-shared/real-estate-map';

import { type MapCoords, METERS_PER_KM } from '@filter-enginez/examples-shared/real-estate-domain';
import { onMounted, onUnmounted, ref, shallowRef, watchEffect } from 'vue';

const props = withDefaults(
	defineProps<{
		/** Accessible name for the map region. Not `ariaLabel` — see `<ResultGrid>`'s `listLabel`. */
		mapLabel?: string;
		/** The circle's center. */
		center: MapCoords;
		/** The circle's radius, in kilometers — the unit the engine's `GeoProximityRule` uses. */
		radiusKm: number;
	}>(),
	{
		mapLabel: 'Map of the listing search area — drag the cyan marker to move the center',
	},
);

const emit = defineEmits<{
	/** Emitted once per completed marker drag, with the marker's new position. */
	centerChange: [next: MapCoords];
}>();

const containerEl = ref<HTMLDivElement | null>(null);

/**
 * The live controller, or `null` until the dynamic import resolves.
 *
 * @remarks
 * `shallowRef` rather than a plain `let`, so the sync effects below re-run the moment the map exists.
 * A plain `let` would leave them having run exactly once, against nothing. Shallow rather than deep
 * because it holds a class instance wrapping a Leaflet map — deep-proxying that would be pure cost,
 * and would very likely break Leaflet besides.
 */
const controller = shallowRef<RadiusMapController | null>(null);

onMounted(async () => {
	const mapModule = await import('@filter-enginez/examples-shared/real-estate-map');

	// The element is bound by the time `onMounted` runs, but the await above yields — and a fast unmount
	// in between would leave this null. Bailing is correct: `onUnmounted` has already run.
	if (containerEl.value === null) {
		return;
	}
	controller.value = mapModule.createRadiusMapController(containerEl.value, {
		center: props.center,
		onCenterChange: (next) => {
			emit('centerChange', next);
		},
		radiusMeters: props.radiusKm * METERS_PER_KM,
		// Read once, at creation: Leaflet takes its animation options at construction, so a later change
		// to the media query cannot be applied without rebuilding the map.
		shouldReduceMotion:
			typeof window !== 'undefined' && typeof window.matchMedia === 'function'
				? window.matchMedia('(prefers-reduced-motion: reduce)').matches
				: false,
	});
});

/*
 * ⚠️ READ THE PROP INTO A LOCAL FIRST. This is not style.
 *
 * `controller.value?.setCenter(props.center)` looks equivalent and is not: optional chaining
 * short-circuits BEFORE evaluating the arguments, so while `controller.value` is `null` the expression
 * never reads `props.center` at all. An effect that reads nothing tracks nothing — so on its first run
 * (which happens while the dynamic `import()` above is still in flight, i.e. always) it would register
 * `controller` as its only dependency and never respond to a center change again.
 *
 * The symptom is a map that ignores every programmatic move: "Near me" resolves, the rule commits, the
 * results narrow, and the marker sits where it was. Dragging still works, because that path is Leaflet
 * moving its own marker and reporting outward — which is exactly why it presents as a geolocation bug
 * rather than a reactivity one. Svelte's effects and Vue's `watchEffect` track identically here.
 */
watchEffect(() => {
	const nextCenter = props.center;

	// A no-op after destroy, and the controller only recenters the viewport when the point has gone off
	// screen — dragging the marker within view must not yank the map out from under the cursor.
	controller.value?.setCenter(nextCenter);
});

watchEffect(() => {
	const nextRadiusMeters = props.radiusKm * METERS_PER_KM;

	controller.value?.setRadius(nextRadiusMeters);
});

// Re-measure whenever the container gains or changes size — see the docblock.
watchEffect((onCleanup) => {
	const element = containerEl.value;

	if (element === null || typeof ResizeObserver === 'undefined') {
		return;
	}
	const observer = new ResizeObserver(() => {
		controller.value?.invalidateSize();
	});

	observer.observe(element);

	onCleanup(() => {
		observer.disconnect();
	});
});

onUnmounted(() => {
	controller.value?.destroy();
	controller.value = null;
});
</script>

<template>
	<div class="fe-geo__map" role="region" :aria-label="mapLabel">
		<div ref="containerEl" class="fe-geo__map-canvas" />
	</div>
</template>
