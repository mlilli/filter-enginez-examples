/**
 * `<fe-leaflet-radius-map>` — the Angular wrapper around the shared imperative radius-map controller.
 *
 * @remarks
 * The controller owns the map lifecycle, the double-init guard, the use-after-destroy guard, the
 * view-sync rules and the marker glyph; each vertical wraps it in its own idiom. This wrapper is that
 * idiom for Angular: create in `afterNextRender`, push input changes through `effect`s, tear down
 * through `DestroyRef`.
 *
 * ### Leaflet is imported at RUNTIME, never at module scope
 *
 * `@filter-enginez/examples-shared/real-estate-map` imports `leaflet` and `leaflet/dist/leaflet.css`
 * at module scope, and `leaflet` touches `window` as it loads. The only static reference this file
 * makes to that subpath is an `import type`, which erases at compile time — the VALUE it needs
 * (`METERS_PER_KM`) comes from the pure-geometry re-export on `real-estate-domain` instead. The real
 * module arrives through the `await import()` inside `afterNextRender`, which runs in the browser and
 * only once this component is actually on screen.
 *
 * That is also why `leaflet` is deliberately absent from this app's `package.json`: nothing here
 * imports it directly, and the dynamic import resolves it from `examples-shared`, which owns the
 * dependency. Adding it here would create a second version to keep in step for no gain.
 *
 * **This `await import()` is the whole code-split**, and it is worth being precise about that,
 * because the panel above also wraps the geo section in a `@defer (on immediate)` block and that
 * block is NOT what keeps Leaflet out of the bundle — `on immediate` fetches its chunk for every
 * visitor as soon as rendering settles, so it buys paint order and nothing more. The import below
 * runs from `afterNextRender` on a component that only mounts once the distance filter is switched
 * on, so a mapping library reaches only the visitors who ask for a map.
 *
 * ### The four Angular-specific hazards, in the order they bite
 *
 * **1. `afterNextRender`, not the constructor.** The container element does not exist until the view
 * renders, and `viewChild.required` throws when read before then.
 *
 * **2. The `await` yields, so the component may already be gone.** A destroy landing between the
 * dynamic import being issued and resolving would otherwise mount a map into a detached element that
 * nothing will ever tear down. `_isDestroyed` is checked after the await for exactly that window.
 *
 * **3. Optional chaining short-circuits BEFORE its arguments.** See the emphatic comment on each
 * effect below. It is the least visible of the four: nothing throws, the effect simply stops tracking.
 *
 * **4. Leaflet measures its container once.** Hence `isPanelVisible` — see that input's docs.
 *
 * @packageDocumentation
 */

// `import type`, so it erases at compile time and this file never reaches the leaflet-bearing module
// at runtime. See the class remarks.
import type { RadiusMapController } from '@filter-enginez/examples-shared/real-estate-map';

import {
	afterNextRender,
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	effect,
	type ElementRef,
	inject,
	input,
	output,
	signal,
	viewChild,
} from '@angular/core';
import { type MapCoords, METERS_PER_KM } from '@filter-enginez/examples-shared/real-estate-domain';

/** The media query Leaflet's animation options are read from, once, at map construction. */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the visitor has asked for reduced motion.
 *
 * @remarks
 * Read once and passed to the controller at creation, because Leaflet takes its animation options at
 * construction — a later change to the media query cannot be applied without rebuilding the map, and
 * rebuilding it would discard the user's zoom and pan.
 *
 * @returns `true` when animations should be suppressed.
 */
function prefersReducedMotion(): boolean {
	return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-leaflet-radius-map',
	template: `
		<div class="fe-geo__map" role="region" [attr.aria-label]="mapLabel()">
			<div #canvas class="fe-geo__map-canvas"></div>
		</div>
	`,
})
export class LeafletRadiusMapComponent {
	/** The circle's center. */
	public readonly center = input.required<MapCoords>();

	/**
	 * Whether the filter panel is currently on screen.
	 *
	 * @remarks
	 * Leaflet measures its container ONCE at initialization and caches the result. The mobile collapse
	 * hides this panel with the `hidden` attribute rather than destroying it — that is what preserves
	 * the map's zoom and the user's filter state across a close — and a hidden element genuinely has no
	 * box. A map initialized in there lays out a single tile in the corner and never recovers on its
	 * own, so the reveal has to tell it to re-measure.
	 *
	 * Vue and Svelte drive the same call from a `ResizeObserver` on the container. Angular gets the
	 * signal for free: the page already computes panel visibility for its `[hidden]` binding, so
	 * threading it down is one input rather than an observer whose only job is to notice that binding
	 * change. Angular refreshes a parent's own bindings before descending into its children, so by the
	 * time this component's effect runs the `hidden` attribute is already off the ancestor and
	 * `invalidateSize`'s `getBoundingClientRect` measures a real box.
	 */
	public readonly isPanelVisible = input.required<boolean>();

	/** Accessible name for the map region. Not `ariaLabel` — see `<fe-result-grid>`'s `listLabel`. */
	public readonly mapLabel = input<string>(
		'Map of the listing search area — drag the cyan marker to move the center',
	);

	/** The circle's radius, in kilometers — the unit the engine's `GeoProximityRule` uses. */
	public readonly radiusKm = input.required<number>();

	/** Emitted once per completed marker drag, with the marker's new position. */
	public readonly centerChange = output<MapCoords>();

	private readonly _canvas = viewChild.required<ElementRef<HTMLDivElement>>('canvas');

	/**
	 * The live controller, or `null` until the dynamic import resolves.
	 *
	 * @remarks
	 * A SIGNAL rather than a plain field, so the sync effects below re-run the moment the map exists. A
	 * plain field would leave them having run exactly once, against nothing, and the map would then
	 * ignore every programmatic move for the rest of its life.
	 */
	private readonly _controller = signal<RadiusMapController | null>(null);

	/** Set by the destroy hook, so the post-`await` guard can bail. See the class remarks. */
	private _isDestroyed = false;

	public constructor() {
		afterNextRender(() => {
			void this._createController();
		});

		/*
		 * ⚠️ READ THE INPUT INTO A LOCAL FIRST. This is not style, and it is not defensive.
		 *
		 * `this._controller()?.setCenter(this.center())` looks equivalent and is not: optional chaining
		 * short-circuits BEFORE evaluating its arguments, so while the controller is `null` the
		 * expression never reads `center()` at all. An effect that reads nothing tracks nothing — so on
		 * its first run (which happens while the dynamic import above is still in flight, i.e. always)
		 * it would register `_controller` as its only dependency and never respond to a center change
		 * again.
		 *
		 * The symptom is a map that ignores every programmatic move: "Near me" resolves, the rule
		 * commits, the results narrow, and the marker sits where it was. Dragging still works, because
		 * that path is Leaflet moving its own marker and reporting outward — which is exactly why it
		 * presents as a geolocation bug rather than a reactivity one.
		 */
		effect(() => {
			const nextCenter = this.center();
			const controller = this._controller();

			// A no-op after destroy, and the controller only recenters the viewport when the point has
			// gone off screen — dragging the marker within view must not yank the map from under the cursor.
			controller?.setCenter(nextCenter);
		});

		// ⚠️ Same trap, same shape: read the radius BEFORE the optional call. See the comment above.
		effect(() => {
			const nextRadiusMeters = this.radiusKm() * METERS_PER_KM;
			const controller = this._controller();

			controller?.setRadius(nextRadiusMeters);
		});

		// ⚠️ Same trap once more. `isPanelVisible` MUST be read before the optional call, or a map
		// created while the panel was closed would never learn that it has a box now.
		effect(() => {
			const isVisible = this.isPanelVisible();
			const controller = this._controller();

			if (!isVisible) {
				return;
			}
			controller?.invalidateSize();
		});

		inject(DestroyRef).onDestroy(() => {
			this._isDestroyed = true;
			this._controller()?.destroy();
			this._controller.set(null);
		});
	}

	/**
	 * Load Leaflet and mount the map. Runs once, after the container element exists.
	 *
	 * @remarks
	 * `createRadiusMapController` captures `onCenterChange` ONCE at creation, so the callback handed to
	 * it must be stable for the map's lifetime — swapping it would mean rebuilding the map, tearing
	 * down the tile layer and losing the user's zoom. {@link _emitCenterChange} is a bound class field
	 * for exactly that reason; an inline arrow here would be stable too, but only by accident of this
	 * method running once, which is not a property worth depending on.
	 */
	private async _createController(): Promise<void> {
		const { createRadiusMapController } = await import(
			'@filter-enginez/examples-shared/real-estate-map',
		);

		// The await above yields, so a fast destroy in between would leave this mounting into an element
		// nothing will ever tear down. Bailing is correct: the destroy hook has already run.
		if (this._isDestroyed) {
			return;
		}
		this._controller.set(
			createRadiusMapController(this._canvas().nativeElement, {
				center: this.center(),
				onCenterChange: this._emitCenterChange,
				radiusMeters: this.radiusKm() * METERS_PER_KM,
				shouldReduceMotion: prefersReducedMotion(),
			}),
		);
	}

	/** The stable drag callback the controller captures. See {@link _createController}. */
	private readonly _emitCenterChange = (next: MapCoords): void => {
		this.centerChange.emit(next);
	};
}
