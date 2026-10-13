/**
 * `radiusMapGeometry` — the pure decisions behind the radius map's viewport behavior.
 *
 * @remarks
 * Extracted from the controller so the two rules that actually DECIDE something can be unit-tested
 * without a Leaflet instance or a real viewport. The controller around them is glue: create a map,
 * move a marker, call `setView`. These are the parts where being wrong is visible to a user.
 *
 * @packageDocumentation
 */

/** Latitude / longitude in the `{ lat, lng }` spelling Leaflet uses. */
export interface RadiusMapCoords {
	/** Latitude in degrees. */
	readonly lat: number;
	/** Longitude in degrees. */
	readonly lng: number;
}

/** A viewport rectangle, as Leaflet's `LatLngBounds` reports it. */
export interface RadiusMapBounds {
	/** Eastern edge longitude. */
	readonly east: number;
	/** Northern edge latitude. */
	readonly north: number;
	/** Southern edge latitude. */
	readonly south: number;
	/** Western edge longitude. */
	readonly west: number;
}

/** Leaflet's `Circle` radius is meters; the engine's `GeoProximityRule` speaks kilometers. */
export const METERS_PER_KM = 1000;

/**
 * Should the viewport jump to follow a new center?
 *
 * @remarks
 * **Only when the new center is off-screen.** This is the rule that makes the map feel calm rather
 * than twitchy: dragging the marker a little inside the current view leaves the viewport alone, so
 * the map does not yank itself out from under the pointer mid-drag. A metro pick or a "near me" jump
 * lands somewhere off-screen, and only then does the map follow.
 *
 * Inclusive on all four edges, matching Leaflet's own `LatLngBounds.contains`: a point exactly on the
 * boundary is visible, so it needs no jump.
 *
 * @param bounds - The current viewport.
 * @param point - The proposed new center.
 * @returns `true` when the point falls outside the viewport and the map should recenter.
 */
export function shouldRecenter(bounds: RadiusMapBounds, point: RadiusMapCoords): boolean {
	return (
		point.lat < bounds.south ||
		point.lat > bounds.north ||
		point.lng < bounds.west ||
		point.lng > bounds.east
	);
}

/**
 * The side length, in meters, of the square the viewport should fit to show a radius circle.
 *
 * @remarks
 * A circle of radius `r` spans `2r` across, so the enclosing square is `2r` on a side — which is what
 * Leaflet's `toBounds(size)` expects. Getting this wrong by a factor of two is the classic version of
 * this bug: pass `r` and the circle overflows the viewport; pass `4r` and it sits as a dot in the
 * middle.
 *
 * @param radiusMeters - The circle's radius in meters.
 * @returns The bounding square's side length in meters.
 */
export function boundingSquareSideMeters(radiusMeters: number): number {
	return radiusMeters * 2;
}
