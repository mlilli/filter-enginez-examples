/**
 * `books-domain/bundle` — the predictive-disable plumbing for the books panel (framework-neutral).
 *
 * @remarks
 * Books runs on the main thread, so the single-round-trip bundle is computed SYNCHRONOUSLY via
 * `engine.core.applyFiltersAndQuery(query)` once per engine change — one pass returning per-candidate
 * `wouldBeEmpty` exclusion data (genre / format / language chips), filtered-except-self bounds (the
 * range sliders' dimmed "available" zone) and each slider field's distribution (the bars drawn over
 * the track). Each framework panel wires it up off its `lastChange` reactive primitive; these are the
 * pure readers over the resulting bundle, plus the one builder that shapes the query going in.
 *
 * Single-value toggles (`BooleanRule` / `ExistsRule`) have no bundle candidate kind, so their disable
 * state is computed separately by {@link toggleWouldBeEmpty} — the equivalent one-pass
 * `results.some(rule.action)` check the React `useIsToggleDisabled` hook performs.
 *
 * @packageDocumentation
 */

import type { FilterBundle, FilterBundleQuery, FilterEngine } from '@filter-enginez/core';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { type NumericBounds, sliderBucketCount } from '@filter-enginez/react-ui/bounds';

import { getSuperGroupNodeSpecs } from './curated.js';


// The pure readers below are pure functions of a bundle — nothing about them is books-specific — so
// they live in `filter-bundle/bundleReaders.ts`, shared with wine. Re-exported so `books-domain`
// consumers reach every bundle reader, including the two histogram readers, from one import path.
export {
	bundleHistogramToBuckets,
	type ChipExclusion,
	chipExclusionMap,
	type ExclusionMap,
	fieldBounds,
	fieldHistogram,
	isToggleDisabled,
	toggleWouldBeEmpty,
} from '../../filter-bundle/bundleReaders.js';
// The fetch loop for an engine that answers a round trip later (the `/books-server` HTTP engine): the
// same dataset-neutral fetcher the wine routes use, reachable from the books import path.
export {
	type BundleFetcher,
	type BundleFetchHandlers,
	type BundleQueryable,
	createBundleFetcher,
} from '../../filter-bundle/bundleFetcher.js';

/**
 * The three books slider tracks' full-corpus extents.
 *
 * @remarks
 * Passed in rather than derived here: the five verticals do not agree on how they derive these — the
 * React panel filters nulls out of `averageRating` before deriving while the others let
 * `deriveBaselineBounds` skip them, and page count snaps to a different grid in two of them. That
 * divergence is deliberate, so this builder takes the result rather than imposing one derivation.
 */
export interface BooksBundleBaselines {
	readonly pageCount: NumericBounds;
	readonly publicationYear: NumericBounds;
	readonly rating: NumericBounds;
}

/** The candidate values for books' three flat chip groups. */
export interface BooksChipVocabularies {
	readonly formats: readonly string[];
	readonly genres: readonly string[];
	readonly languages: readonly string[];
}

/**
 * The grid each books slider field's VALUES fall on in the corpus.
 *
 * @remarks
 * Read off `mock-data/src/books/generate.ts`: `publicationYear` and `pageCount` are whole numbers,
 * `averageRating` is `Math.round(x * 10) / 10`. Feeds `sliderBucketCount`; **not** a slider `step` —
 * see that function's remarks for why the distinction has teeth.
 *
 * The practical effect: year and page count are wide enough to cap at the dense count, while rating's
 * 1.0–5.0 track holds 41 tenths and therefore gets exactly one bar per achievable rating.
 */
export const BOOKS_FIELD_VALUE_STEPS = {
	pageCount: 1,
	publicationYear: 1,
	rating: 0.1,
} as const satisfies Record<keyof BooksBundleBaselines, number>;

/**
 * Build the books bundle query: three flat chip groups, the curated super-group tree, and three
 * slider fields.
 *
 * @remarks
 * **One builder for every vertical's books panel**, the same arrangement the wine and real-estate
 * panels have. An inline object literal per panel would make every query change (such as a field's
 * `bucketCount`) a five-place edit, and a facet that silently renders all-enabled when its entry is
 * missing is not a thing to maintain five copies of.
 *
 * `getSuperGroupNodeSpecs()` is called here rather than taken as a parameter because every caller
 * would pass exactly that, and it is a pure function of the curated tree.
 *
 * @param baselines - The three slider tracks' extents.
 * @param vocabularies - The candidate values for the three flat chip groups.
 * @returns The query to hand to `applyFiltersAndQuery`.
 */
export function buildBooksBundleQuery(
	baselines: BooksBundleBaselines,
	vocabularies: BooksChipVocabularies,
): FilterBundleQuery {
	return {
		chipGroups: [
			{ candidates: vocabularies.genres, field: 'genre', kind: 'inSet', ruleId: 'genre' },
			{ candidates: vocabularies.formats, field: 'format', kind: 'inSet', ruleId: 'format' },
			{ candidates: vocabularies.languages, field: 'language', kind: 'inSet', ruleId: 'language' },
			{ candidates: getSuperGroupNodeSpecs(), field: 'genre', kind: 'inSetOfSets', ruleId: 'genre-groups' },
		],
		fields: [
			{
				baselineMax: baselines.publicationYear.max,
				baselineMin: baselines.publicationYear.min,
				bucketCount: sliderBucketCount(baselines.publicationYear, BOOKS_FIELD_VALUE_STEPS.publicationYear),
				fieldKey: 'publicationYear',
				ruleId: 'publication-year',
			},
			{
				baselineMax: baselines.rating.max,
				baselineMin: baselines.rating.min,
				bucketCount: sliderBucketCount(baselines.rating, BOOKS_FIELD_VALUE_STEPS.rating),
				fieldKey: 'averageRating',
				ruleId: 'rating',
			},
			{
				baselineMax: baselines.pageCount.max,
				baselineMin: baselines.pageCount.min,
				bucketCount: sliderBucketCount(baselines.pageCount, BOOKS_FIELD_VALUE_STEPS.pageCount),
				fieldKey: 'pageCount',
				ruleId: 'page-count',
			},
		],
	};
}

/**
 * Compute the bundle for the current engine state, swallowing any failure into `null`.
 *
 * @remarks
 * Defensive by design: a partially-shaped corpus (a test fixture missing a queried numeric field) must
 * degrade to "no exclusion data," never throw and blank the panel. The sync engine resolves the bundle
 * in the same tick, so callers wrap this in their framework's derived/computed off `lastChange`.
 *
 * @param engine - The signals engine whose `.core` runs the query.
 * @param query - The bundle query describing the chip groups + fields to simulate.
 * @returns The computed bundle, or `null` when the query could not be run.
 */
export function safeApplyBundle<T>(engine: SignalsEngine<T>, query: FilterBundleQuery): FilterBundle | null {
	return safeApplyBundleFromCore(engine.core, query);
}

/**
 * The same guarded bundle read, taking the bare engine directly.
 *
 * @remarks
 * `applyFiltersAndQuery` lives on the core, so the reactive surface is incidental to this call. The
 * framework-less vertical drives one of its two demo routes off the bare engine with no reactive
 * adapter at all, and needs this entry point; {@link safeApplyBundle} is the convenience wrapper for
 * callers that already hold a `SignalsEngine`.
 *
 * @param core - The engine running the query.
 * @param query - The bundle query describing the chip groups + fields to simulate.
 * @returns The computed bundle, or `null` when the query could not be run.
 */
export function safeApplyBundleFromCore<T>(core: FilterEngine<T>, query: FilterBundleQuery): FilterBundle | null {
	try {
		return core.applyFiltersAndQuery(query);
	} catch {
		return null;
	}
}
