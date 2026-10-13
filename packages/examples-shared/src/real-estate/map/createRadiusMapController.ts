/**
 * `createRadiusMapController` — the framework-neutral radius map, driven imperatively.
 *
 * @remarks
 * One OpenStreetMap raster map with a cyan radius circle and a draggable center marker, owned by
 * plain functions rather than by any framework's component model. Every vertical wraps this in its own
 * idiom — a React ref + effect, a Svelte action, a Vue `onMounted`, an Angular directive, a bare call
 * in the framework-less app — but the map lifecycle, the view-sync rules, and the marker glyph live
 * here once.
 *
 * ### The two failure modes this is built against
 *
 * A naive `L.map()` effect throws **"Map container is already initialized"** and crashes on **async
 * view operations after `remove()`**. React 19 StrictMode double-invokes effects (mount → cleanup →
 * mount), and the filter drawer's `keepMounted` offscreen remount does it again for real. A wrapper
 * library such as `react-leaflet` hides that class of bug, but only for React.
 *
 * An imperative controller therefore has to answer both, once, here — which is the argument for the
 * controller in the first place: every vertical would otherwise have to rediscover them.
 *
 *   1. **Double-init.** Leaflet stamps its container with an internal id and refuses to initialize a
 *      second map on it. A module-level {@link WeakMap} tracks the live controller per container, and
 *      {@link createRadiusMapController} destroys any existing one before creating a new map. A
 *      StrictMode remount that somehow skips its cleanup therefore still lands on a clean container
 *      rather than throwing. The `WeakMap` keys on the element, so a discarded container is collected
 *      with its entry.
 *   2. **Use after destroy.** Every method early-returns once {@link RadiusMapController.isDestroyed}
 *      is set, and `destroy()` is idempotent. An effect cleanup racing a pending state sync — the
 *      exact crash shape described above — is then a no-op rather than an exception. Every programmatic
 *      view change also passes `animate: false`, so Leaflet never has a queued animation that could
 *      fire against a removed map.
 *
 * ### Callback stability
 *
 * `onCenterChange` is captured once at creation. Callers whose handler identity changes per render
 * (React, Vue) should pass a stable function that reads a ref — recreating the map to swap a callback
 * would tear down the tile layer and lose the user's zoom.
 *
 * ### SSR
 *
 * Importing `leaflet` touches `window` at module scope, so this module must only be loaded in the
 * browser. That is why it sits behind its own `./real-estate-map` subpath rather than in the
 * `./real-estate` barrel: a SvelteKit server render must be able to import the domain slice without
 * dragging a mapping library into the server bundle. Load it from `onMount` / `afterNextRender` /
 * a dynamic `import()`.
 *
 * @packageDocumentation
 */

import 'leaflet/dist/leaflet.css';

// A NAMESPACE import, not named imports, so no app needs a `resolve.alias` for Leaflet. Leaflet 1.9.4
// ships `main: dist/leaflet-src.js` — UMD/CommonJS — with no `module` and no `exports` field, so
// `import { map } from 'leaflet'` has no named exports to bind without aliasing the specifier onto
// `leaflet/dist/leaflet-src.esm.js` in every app. A namespace
// import needs no named bindings at resolution time: the CJS interop hands back one object and the
// members are read off it, which every bundler in the repo already handles.
//
// The types are unaffected — `@types/leaflet` declares the `leaflet` module, so this stays fully typed
// where importing the ESM subpath directly would need an ambient declaration per program.
import type { Circle, LeafletEvent, Map as LeafletMap, Marker } from 'leaflet';

import * as L from 'leaflet';

const { circle: createCircle, divIcon, latLng, map: createMap, marker: createMarker, tileLayer } = L;

import {
	boundingSquareSideMeters,
	type RadiusMapCoords,
	shouldRecenter,
} from './radiusMapGeometry.js';

/**
 * `--accent` (electric cyan) as a literal. Leaflet paints vector layers by writing SVG presentation
 * attributes (`stroke` / `fill`), where CSS custom properties do NOT resolve — so the circle needs the
 * token's raw hex. Keep in lockstep with `docs/branding/design-system/colors_and_type.css`.
 */
const ACCENT_CYAN_HEX = '#22D3EE';

/** Square hit target for the draggable center marker — ≥44px for comfortable touch dragging. */
const MARKER_SIZE_PX = 44;

/** Visible diameter of the cyan center dot inside the (mostly invisible) 44px hit target. */
const MARKER_DOT_PX = 16;

/** The dark basemap's maximum raster tile zoom. */
const TILE_MAX_ZOOM = 20;

/** Initial zoom; the first `setRadius` immediately refits to the circle. */
const INITIAL_ZOOM = 11;

/**
 * CARTO's "dark matter" basemap — OpenStreetMap data, rendered dark.
 *
 * @remarks
 * **The map is part of the product, not a window cut into it.** Standard OSM raster tiles are a
 * bright, high-saturation, print-derived style: dropping them into a dark panel puts a glowing white
 * rectangle in the middle of the filter sidebar, which breaks the surface far more than any single
 * component could. This is the same data, rendered on a near-black ground with desaturated roads —
 * so the cyan radius circle is the brightest thing in the frame, which is what the dual-accent
 * contract wants (cyan = the data being filtered).
 *
 * Still no API key and no usage token, which is why this and not a Mapbox / Stadia style. The
 * `{r}` placeholder is Leaflet's retina hook, resolved to `@2x` on high-DPI displays when
 * `detectRetina` is on.
 *
 * The rejected alternative was a CSS `filter: invert(1) hue-rotate(180deg)` over the standard tiles.
 * It needs no provider change and looks it: inverting a photograph of a map turns vegetation purple
 * and water sickly, and it inverts the LABELS too, so text ends up light-on-dark by accident rather
 * than by design. A basemap that was drawn dark is not the same thing as a light one turned inside
 * out.
 */
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

/** CARTO serves this style from four subdomains; Leaflet's default `abc` would waste the fourth. */
const TILE_SUBDOMAINS = 'abcd';

/** Attribution required by BOTH the OpenStreetMap data license and CARTO's tile usage policy. */
const TILE_ATTRIBUTION =
	'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/**
 * Class on the radius circle's SVG path, so the stylesheet can reach it.
 *
 * @remarks
 * The cyan glow is a runtime `drop-shadow`, per the brand's rule that source art stays flat and the
 * glow is added in CSS for tunability. Leaflet has no option for it — vector layers take stroke and
 * fill as presentation attributes and nothing else — so the hook is a class name and the rule lives
 * in `ui-styles` beside the rest of the map chrome.
 */
const RADIUS_CIRCLE_CLASS = 'fez-geo-radius-circle';

/**
 * The center marker as a `divIcon` — a cyan dot with a brand glow inside a 44px touch target.
 *
 * @remarks
 * Plain inline-styled HTML, which sidesteps Leaflet's well-known broken-default-marker-icon problem
 * under bundlers entirely: no PNG asset is referenced, so there is nothing for a bundler to
 * mis-resolve, and the marker is on-brand cyan rather than Leaflet blue. CSS custom properties DO
 * resolve in an inline `style` attribute (unlike in the SVG presentation attributes above), so the
 * tokens can be used directly here.
 */
const CENTER_MARKER_HTML = [
	`<span style="align-items:center;display:flex;height:${String(MARKER_SIZE_PX)}px;justify-content:center;width:${String(MARKER_SIZE_PX)}px;">`,
	`<span style="background:var(--accent);border:2px solid var(--gray-0);border-radius:50%;box-shadow:0 0 12px var(--accent-glow);display:block;height:${String(MARKER_DOT_PX)}px;width:${String(MARKER_DOT_PX)}px;"></span>`,
	'</span>',
].join('');

/** Options for {@link createRadiusMapController}. */
export interface RadiusMapOptions {
	/** Initial center of the circle and marker. */
	readonly center: RadiusMapCoords;
	/**
	 * Called once per completed marker drag with the marker's new position. Captured ONCE — pass a
	 * stable function (see the module docs on callback stability).
	 */
	readonly onCenterChange: (next: RadiusMapCoords) => void;
	/** Initial circle radius, in meters. */
	readonly radiusMeters: number;
	/** When `true`, Leaflet's zoom / fade animations are disabled. Default `false`. */
	readonly shouldReduceMotion?: boolean;
}

/** Imperative handle over one live radius map. */
export interface RadiusMapController {
	/** Tear the map down. Idempotent, and safe to call from a racing effect cleanup. */
	readonly destroy: () => void;
	/**
	 * Re-measure the container and repaint. Call after the map is revealed from a hidden state.
	 *
	 * @remarks
	 * Leaflet reads its container's size ONCE at initialization and caches it. A map created inside a
	 * collapsed element — anything carrying `display: none`, which includes the `hidden` attribute —
	 * measures 0×0, so it lays out a single tile at the top-left corner and never recovers on its own.
	 * The symptom is a map that looks broken only on the path where the panel starts closed, which is
	 * to say only on mobile.
	 *
	 * React does not need this: its filter drawer keeps the panel mounted and moves it with
	 * `transform`, so the container always has a real size. SvelteKit, Angular and vanilla hide the
	 * panel instead — keeping local control state across a close — and a hidden element genuinely has no
	 * box. So the fix belongs to whichever vertical hides its panel, and it belongs HERE rather than in
	 * each vertical, because several make the same choice for the same reason.
	 *
	 * Safe to call at any time: a no-op once destroyed, and harmless when the size has not changed.
	 */
	readonly invalidateSize: () => void;
	/** `true` once {@link RadiusMapController.destroy} has run; every other method then no-ops. */
	readonly isDestroyed: () => boolean;
	/** Move the circle + marker, recentering the viewport only if the point is off-screen. */
	readonly setCenter: (next: RadiusMapCoords) => void;
	/** Resize the circle and refit the viewport around it. */
	readonly setRadius: (radiusMeters: number) => void;
}

/**
 * Live controllers by container element — the double-init guard.
 *
 * @remarks
 * Keyed on the element so a container that goes out of scope takes its entry with it. This exists
 * because Leaflet refuses to initialize twice on one element, and a StrictMode remount whose cleanup
 * did not run (or ran out of order) would otherwise hit exactly that.
 */
const controllersByContainer = new WeakMap<HTMLElement, RadiusMapController>();

/**
 * Create a radius map inside `container`.
 *
 * @remarks
 * Any controller still attached to this container is destroyed first, so calling twice is safe.
 *
 * @param container - The element to mount into. Needs a resolved height; the map fills it.
 * @param options - Initial center + radius, the drag callback, and the motion preference.
 * @returns The imperative handle.
 */
export function createRadiusMapController(
	container: HTMLElement,
	options: RadiusMapOptions,
): RadiusMapController {
	// Guard 1: never initialize twice on one element.
	controllersByContainer.get(container)?.destroy();

	const { center, onCenterChange, radiusMeters, shouldReduceMotion = false } = options;
	const shouldAnimate = !shouldReduceMotion;

	const map: LeafletMap = createMap(container, {
		center: [center.lat, center.lng],
		fadeAnimation: shouldAnimate,
		markerZoomAnimation: shouldAnimate,
		// Scroll-wheel zoom hijacks page scrolling on a map embedded in a filter panel.
		scrollWheelZoom: false,
		zoom: INITIAL_ZOOM,
		zoomAnimation: shouldAnimate,
	});

	tileLayer(TILE_URL, {
		attribution: TILE_ATTRIBUTION,
		// Serve `@2x` tiles on high-DPI displays. A dark basemap is mostly fine hairlines and small
		// labels, which is exactly the content that turns to mush at 1x on a retina screen.
		detectRetina: true,
		maxZoom: TILE_MAX_ZOOM,
		subdomains: TILE_SUBDOMAINS,
	}).addTo(map);

	const radiusCircle: Circle = createCircle([center.lat, center.lng], {
		className: RADIUS_CIRCLE_CLASS,
		color: ACCENT_CYAN_HEX,
		fillColor: ACCENT_CYAN_HEX,
		// 0.18 rather than 0.12: the fill sits on a near-black ground, not pale OSM cream, and 0.12
		// would be barely a tint there. Same perceived weight, darker backdrop.
		fillOpacity: 0.18,
		// The circle is decoration over the tiles; it must not swallow drags aimed at the marker.
		interactive: false,
		radius: radiusMeters,
		weight: 2,
	}).addTo(map);

	const centerMarker: Marker = createMarker([center.lat, center.lng], {
		draggable: true,
		icon: divIcon({
			className: 'fez-geo-center-marker',
			html: CENTER_MARKER_HTML,
			iconAnchor: [MARKER_SIZE_PX / 2, MARKER_SIZE_PX / 2],
			iconSize: [MARKER_SIZE_PX, MARKER_SIZE_PX],
		}),
		// Keyboard users drive the geo filter through the metro dropdown and radius slider, which are
		// real form controls; a focusable marker would be a keyboard trap offering no way to set a
		// precise position.
		keyboard: false,
	}).addTo(map);

	let hasBeenDestroyed = false;
	/** Latest center, so a radius refit knows where to fit AROUND without re-reading the map. */
	let currentCenter = center;

	centerMarker.on('dragend', (event: LeafletEvent) => {
		/* v8 ignore next 3 -- requires a real Leaflet drag gesture; covered by the geo e2e. */
		const position = (event.target as Marker).getLatLng();

		onCenterChange({ lat: position.lat, lng: position.lng });
	});

	const controller: RadiusMapController = {
		destroy: (): void => {
			// Guard 2: idempotent, and it stops every other method below.
			if (hasBeenDestroyed) {
				return;
			}
			hasBeenDestroyed = true;
			controllersByContainer.delete(container);
			map.remove();
		},

		invalidateSize: (): void => {
			if (hasBeenDestroyed) {
				return;
			}
			// `animate: false` for the same reason every other view op here passes it: an animated
			// resize queues a frame that could fire against a map torn down in between.
			map.invalidateSize({ animate: false });
		},

		isDestroyed: (): boolean => hasBeenDestroyed,

		setCenter: (next: RadiusMapCoords): void => {
			if (hasBeenDestroyed) {
				return;
			}
			currentCenter = next;
			const point = latLng(next.lat, next.lng);

			centerMarker.setLatLng(point);
			radiusCircle.setLatLng(point);

			const bounds = map.getBounds();

			if (
				shouldRecenter(
					{
						east: bounds.getEast(),
						north: bounds.getNorth(),
						south: bounds.getSouth(),
						west: bounds.getWest(),
					},
					next,
				)
			) {
				map.setView(point, map.getZoom(), { animate: false });
			}
		},

		setRadius: (nextRadiusMeters: number): void => {
			if (hasBeenDestroyed) {
				return;
			}
			radiusCircle.setRadius(nextRadiusMeters);
			map.fitBounds(
				latLng(currentCenter.lat, currentCenter.lng).toBounds(
					boundingSquareSideMeters(nextRadiusMeters),
				),
				{ animate: false },
			);
		},
	};

	controllersByContainer.set(container, controller);

	return controller;
}
