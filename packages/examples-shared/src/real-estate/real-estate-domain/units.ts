/**
 * Distance unit conversion for the real-estate UI.
 *
 * @remarks
 * US real-estate distances read in miles, but the engine's `GeoProximityRule` (and the Leaflet map
 * circle) work in kilometers. The geo-radius section + the results-header "Distance" chip convert at
 * this single shared boundary, so the km↔mi factor lives in exactly one place.
 *
 * @packageDocumentation
 */

/** Kilometers per statute mile. */
const KM_PER_MILE = 1.609344;

/**
 * Convert miles to kilometers — for the engine rule + the map circle.
 *
 * @param miles - A distance in miles.
 * @returns The equivalent distance in kilometers.
 */
export function milesToKm(miles: number): number {
	return miles * KM_PER_MILE;
}

/**
 * Convert kilometers to miles — for display.
 *
 * @param km - A distance in kilometers.
 * @returns The equivalent distance in miles.
 */
export function kmToMiles(km: number): number {
	return km / KM_PER_MILE;
}
