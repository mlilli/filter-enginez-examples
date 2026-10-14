/**
 * `real-estate-domain/metroCenters` — derive a geographic centroid per metro area from the corpus.
 *
 * @remarks
 * Powers the geo-radius section's metro dropdown: picking "Austin" recenters the map and the
 * `GeoProximityRule` on the mean coordinate of every Austin listing. Deriving the centers from the
 * data rather than hard-coding a lookup table means the dropdown stays correct for whatever corpus is
 * loaded — the 10k default tier, the full tier, or a regenerated dataset — with no table to
 * maintain and no chance of a metro appearing in the listings but not the dropdown.
 *
 * The mean is the right centroid here precisely because it is corpus-weighted: it lands where the
 * listings actually are, not at the municipal centroid, so the default radius covers a useful slice
 * of inventory rather than a stretch of unlisted countryside.
 *
 * Lifted out of `GeoRadiusSection.tsx` — it is pure, and every vertical's geo section needs it.
 *
 * ### Derived from the booted corpus, by every caller
 *
 * Every vertical runs {@link deriveMetroCenters} over the corpus its engine booted from
 * (`engine.core.getSourceData()`), so the geo section's dropdown and the results header's Distance
 * chip read centroids of the same listings and always agree on where a metro is. This module imports
 * only the `Listing` TYPE, with `import type`, so it never loads the dataset: the real-estate barrel
 * generates the 10,000-listing default tier when it is evaluated, and the pages load that tier on
 * demand, never at startup.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

/** Latitude / longitude in the `{ lat, lng }` spelling Leaflet and the map controller use. */
export interface MapCoords {
	/** Latitude in degrees. */
	readonly lat: number;
	/** Longitude in degrees. Note the `lng` spelling — `Listing.coordinates` uses `lon`. */
	readonly lng: number;
}

/** One entry in the metro-area dropdown: a label plus the centroid to recenter on. */
export interface MetroCenterOption {
	/** Corpus-weighted mean coordinate of every listing in this metro area. */
	readonly center: MapCoords;
	/** The metro area's name, as it appears on the listings. */
	readonly label: string;
}

/**
 * Derive one {@link MetroCenterOption} per distinct metro area in the corpus, sorted by label.
 *
 * @remarks
 * Single pass to accumulate per-metro sums and counts, then one pass to average — O(n) over the
 * corpus, which matters because callers run this at panel-build time over the whole default tier.
 * Sorting is `localeCompare` so the dropdown reads alphabetically to a human rather than by code unit.
 *
 * @param corpus - The listings to derive from.
 * @returns One option per metro area, ascending by label. Empty for an empty corpus.
 */
export function deriveMetroCenters(corpus: readonly Listing[]): readonly MetroCenterOption[] {
	const sums = new Map<string, { count: number; latSum: number; lonSum: number }>();

	for (const listing of corpus) {
		const entry = sums.get(listing.metroArea) ?? { count: 0, latSum: 0, lonSum: 0 };

		sums.set(listing.metroArea, {
			count: entry.count + 1,
			latSum: entry.latSum + listing.coordinates.lat,
			lonSum: entry.lonSum + listing.coordinates.lon,
		});
	}

	return [...sums.entries()]
		.sort(([labelA], [labelB]) => labelA.localeCompare(labelB))
		.map(([label, { count, latSum, lonSum }]) => ({
			center: { lat: latSum / count, lng: lonSum / count },
			label,
		}));
}

/**
 * Name the metro whose centroid a point sits exactly on, if any.
 *
 * @remarks
 * **Exact equality, no epsilon, deliberately.** This is not asking "which metro is this point near" —
 * a nearest-neighbor question with a real answer for any point on Earth. It asks the much narrower
 * "did this coordinate come from the dropdown", and the only coordinates that can satisfy it are ones
 * this module produced. A tolerance would start naming metros for points the user dragged to, which
 * is precisely the case that should read as a custom location.
 *
 * Two callers share this rather than each writing the comparison inline: the geo section (to show which
 * option is selected) and the chip summarizer (to name the center in words rather than in decimals).
 *
 * @param metroCenters - The derived options.
 * @param coords - The point to name.
 * @returns The metro's label, or `null` for a custom location.
 */
export function findMetroLabel(
	metroCenters: readonly MetroCenterOption[],
	coords: MapCoords,
): string | null {
	return (
		metroCenters.find(
			(option) => option.center.lat === coords.lat && option.center.lng === coords.lng,
		)?.label ?? null
	);
}

/**
 * Describe a point in whatever terms are available — a metro name, or its coordinates.
 *
 * @remarks
 * The fallback is four decimal places, which is roughly 11 metres: precise enough to be a real
 * location and short enough to sit in a filter chip.
 *
 * @param metroCenters - The derived options. Pass an empty array to always get coordinates.
 * @param coords - The point to describe.
 * @returns A human-readable description of the point.
 */
export function describeMapCoords(
	metroCenters: readonly MetroCenterOption[],
	coords: MapCoords,
): string {
	return findMetroLabel(metroCenters, coords) ?? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
}
