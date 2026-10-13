/**
 * `@filter-enginez/examples-shared/real-estate-map` — the framework-neutral geo-radius map.
 *
 * @remarks
 * Its own subpath, deliberately: importing `leaflet` touches `window` at module scope, so this must
 * never be pulled in by a server render. Keeping it out of the `./real-estate` barrel lets a SvelteKit
 * `+page.server.ts` import the domain slice without a mapping library reaching the server bundle.
 * Load it from `onMount` / `afterNextRender` / a dynamic `import()`.
 *
 * @packageDocumentation
 */

export {
	createRadiusMapController,
	type RadiusMapController,
	type RadiusMapOptions,
} from './createRadiusMapController.js';
export {
	boundingSquareSideMeters,
	METERS_PER_KM,
	type RadiusMapBounds,
	type RadiusMapCoords,
	shouldRecenter,
} from './radiusMapGeometry.js';
