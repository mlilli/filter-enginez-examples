/**
 * `buildRealEstateEngine` — construct a real-estate `FilterEngine` from a corpus.
 *
 * @remarks
 * Mirror of `buildBooksEngine`: the single construction point for the real-estate engine. No rules
 * are pre-registered — the UI adds them organically on first interaction so the devtools log shows
 * real add/change/remove entries. Bitmap acceleration is initialized by the caller before building;
 * the R-tree spatial index (for `GeoProximityRule`) and the text index engage on `'auto'` once their
 * rules go active, so no extra construction options are needed here.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { createFilterEngine, type FilterEngine } from '@filter-enginez/core';

/**
 * Build a real-estate engine over the given corpus.
 *
 * @param corpus - The listing records to load as source data.
 * @returns A constructed sync `FilterEngine<Listing>` (no rules pre-registered).
 */
export function buildRealEstateEngine(corpus: readonly Listing[]): FilterEngine<Listing> {
	return createFilterEngine<Listing>({ sourceData: corpus });
}
