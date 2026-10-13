/**
 * `vocabularies.ts` — corpus-derived control inputs for the config-driven panel.
 *
 * @remarks
 * The JSON `FilterEngineConfig` declares *which* fields to filter and *how* (rule type + declared
 * bounds), but never enumerates an `InSetRule`'s selectable values or a `RangeRule`'s real extent —
 * those are a function of the DATA, which is exactly the thesis the config-driven showcase sells. So
 * a `ConfigDrivenPanel` derives them at mount by scanning the engine's source data:
 *
 *   - {@link CorpusVocabulary.distinctStrings} → the chip vocabulary for `InSetRule` controls.
 *   - {@link CorpusVocabulary.numericBounds} → the slider baseline track for `RangeRule` controls
 *     (falling back to the config's declared min/max when the corpus is empty).
 *   - {@link CorpusVocabulary.numericValueStep} → the grid those values fall on, which sets the
 *     slider's histogram bucket count.
 *   - {@link CorpusVocabulary.isArrayField} → whether a fuzzy-searched field is array-valued (e.g.
 *     `authors: string[]`), which decides whether `FuzzySearchRule` needs Fuse's multi-key mode.
 *
 * This is the DRY home for the derivation logic the hand-authored `BooksFilterPanel` inlines; the
 * generic panel reuses it so both stay in lockstep.
 *
 * @packageDocumentation
 */

import { deriveBaselineBounds, type NumericBounds } from '@filter-enginez/react-ui';

/**
 * Per-field lookups over a booted corpus, memoized so repeated reads during a render are cheap.
 */
export interface CorpusVocabulary {
	/** Distinct string values of a top-level field, sorted for stable chip ordering. */
	distinctStrings(field: string): readonly string[];
	/** Whether any record holds an array at `field` (→ fuzzy search needs `keys: [field]`). */
	isArrayField(field: string): boolean;
	/**
	 * The `{ min, max }` track a `RangeRule` slider spans — the tight numeric extent of the corpus,
	 * padded by `step`, falling back to the config's declared bounds when no finite values exist.
	 */
	numericBounds(field: string, fallback: NumericBounds, step?: number): NumericBounds;
	/**
	 * The grid a numeric field's values fall on — `1` for integers, `0.1` for one decimal — or `0` when
	 * no grid is detectable.
	 *
	 * @remarks
	 * Feeds `sliderBucketCount`, which must not ask for finer histogram bars than the data has
	 * positions. **This is measured, not declared**, and that is the point: a `FilterEngineConfig`
	 * carries a field's declared BOUNDS but nothing about its granularity, and the hand-authored panels
	 * answer the same question with a maintained table read off the mock-data generator. Here it comes
	 * from the corpus, which is the config-driven showcase's whole thesis — and it happens to reproduce
	 * those tables exactly on the books fields.
	 *
	 * Do NOT substitute the slider's `step`. That is drag granularity: real estate's price slider steps
	 * by 10,000 over values stored to the dollar, and using it would ask for 200 buckets on a field that
	 * has 2,000,000 positions.
	 */
	numericValueStep(field: string): number;
}

/**
 * Build a {@link CorpusVocabulary} over a booted corpus. Field access is by top-level key — the
 * books config declares only flat fields (`genre`, `pageCount`, `authors`, …); nested-path support
 * would layer in `getPath` here, but v1 has no need.
 *
 * @param sourceData - The engine's source records (`engine.core.getSourceData()`).
 * @typeParam T - The record shape (e.g. `Book`); accessed structurally by string key.
 */
export function buildCorpusVocabulary<T extends object>(sourceData: readonly T[]): CorpusVocabulary {
	const distinctCache = new Map<string, readonly string[]>();
	const numericCache = new Map<string, readonly unknown[]>();
	const arrayFieldCache = new Map<string, boolean>();
	const stepCache = new Map<string, number>();

	/** Read a field off a record by string key (the flat-field escape hatch). */
	function readField(record: T, field: string): unknown {
		return (record as Record<string, unknown>)[field];
	}

	return {
		distinctStrings(field: string): readonly string[] {
			const cached = distinctCache.get(field);

			if (cached !== undefined) {
				return cached;
			}
			const distinct = Array.from(
				new Set(sourceData.map((record) => readField(record, field)).filter((value): value is string => typeof value === 'string')),
			).sort();

			distinctCache.set(field, distinct);

			return distinct;
		},

		isArrayField(field: string): boolean {
			// Read-then-compute, mirroring `distinctStrings` above, so no unreachable `?? false` fallback
			// is needed.
			//
			// Checking `!== undefined` rather than truthiness is load-bearing: a cached `false` is a real
			// answer, and a truthiness check would re-scan the whole corpus on every call for every non-array
			// field — which is most of them.
			const isCachedArrayField = arrayFieldCache.get(field);

			if (isCachedArrayField !== undefined) {
				return isCachedArrayField;
			}
			const isArray = sourceData.some((record) => Array.isArray(readField(record, field)));

			arrayFieldCache.set(field, isArray);

			return isArray;
		},

		numericBounds(field: string, fallback: NumericBounds, step = 0): NumericBounds {
			// No `typeof value === 'number' && Number.isFinite(value)` filter here on purpose.
			// `deriveBaselineBounds` accepts `readonly unknown[]` and applies that EXACT predicate
			// itself, so filtering first would be duplicated validation — two copies of one rule, which
			// is the failure the DRY contract names, and an unobservable one, because the callee rejects
			// the same values either way.
			//
			// Caching the raw field reads (rather than pre-filtered numbers) keeps the single source of
			// truth in `react-ui/bounds`, where it is directly tested.
			let values = numericCache.get(field);

			if (values === undefined) {
				values = sourceData.map((record) => readField(record, field));
				numericCache.set(field, values);
			}

			return deriveBaselineBounds(values, fallback, step);
		},

		numericValueStep(field: string): number {
			const cached = stepCache.get(field);

			if (cached !== undefined) {
				return cached;
			}
			// The SMALLEST gap between adjacent distinct values. On a regular grid that gap IS the grid —
			// exact for integers (1), for one-decimal ratings (0.1) and for cent-denominated prices (0.01).
			// On irregular data it is merely small, which `sliderBucketCount` caps into the dense count, so
			// the wrong answer degrades to the same answer a continuous field would get.
			const distinct = Array.from(
				new Set(
					sourceData
						.map((record) => readField(record, field))
						.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
				),
			).sort((left, right) => left - right);
			let smallestGap = Number.POSITIVE_INFINITY;

			for (let index = 1; index < distinct.length; index++) {
				const gap = (distinct[index] as number) - (distinct[index - 1] as number);

				if (gap > 0 && gap < smallestGap) {
					smallestGap = gap;
				}
			}
			// Fewer than two distinct values means no grid is observable. Zero reads as "continuous", which
			// yields the dense count — the honest answer when the corpus cannot tell us.
			const step = Number.isFinite(smallestGap) ? smallestGap : 0;

			stepCache.set(field, step);

			return step;
		},
	};
}
