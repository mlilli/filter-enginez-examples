/**
 * Tests for the corpus-derived control vocabularies.
 *
 * @remarks
 * This module is the thesis of the config-driven showcase made executable: a JSON `FilterEngineConfig`
 * declares WHICH fields to filter and HOW, but never enumerates an `InSetRule`'s selectable values or
 * a `RangeRule`'s real extent — those are a function of the DATA. If this derivation is wrong, the
 * generic panel renders controls that look right and filter wrong: chips for values no record holds,
 * or a slider whose track excludes records that exist.
 *
 * It is also the DRY home for logic the hand-authored `BooksFilterPanel` inlines, so a divergence here
 * shows up as the two panels disagreeing about the same corpus — which is exactly the comparison the
 * `/books-config` route puts side by side on screen.
 *
 * The caching is tested by identity (`toBe` on repeated calls) rather than by counting scans: the
 * cache is module-private, and returning an equal-but-new array on every call would defeat the
 * `useMemo`-style consumers downstream just as thoroughly as not caching at all.
 */

import { describe, expect, it } from 'vitest';

import { buildCorpusVocabulary } from './vocabularies.js';

/** A record shape loose enough to hold the odd values these tests need. */
interface Row {
	readonly authors?: unknown;
	readonly genre?: unknown;
	readonly pageCount?: unknown;
}

describe('distinctStrings', () => {
	it('returns distinct values sorted for stable chip order', () => {
		// Sorted matters: chip order is user-visible, and Set iteration follows insertion order, so
		// without the sort the vocabulary would reorder whenever the corpus did.
		const vocabulary = buildCorpusVocabulary<Row>([
			{ genre: 'mystery' },
			{ genre: 'fantasy' },
			{ genre: 'mystery' },
			{ genre: 'adventure' },
		]);

		expect(vocabulary.distinctStrings('genre')).toEqual(['adventure', 'fantasy', 'mystery']);
	});

	it('ignores non-string values rather than coercing them', () => {
		// A numeric or null field must yield NO chips, not chips reading "42" and "null". The
		// config-driven panel would happily render whatever it is handed.
		const vocabulary = buildCorpusVocabulary<Row>([
			{ genre: 'fantasy' },
			{ genre: 42 },
			{ genre: null },
			{ genre: undefined },
			{ genre: ['fantasy']},
			{},
		]);

		expect(vocabulary.distinctStrings('genre')).toEqual(['fantasy']);
	});

	it('returns an empty list for a field no record holds', () => {
		expect(buildCorpusVocabulary<Row>([{ genre: 'fantasy' }]).distinctStrings('nonexistent')).toEqual([]);
	});

	it('returns an empty list for an empty corpus', () => {
		expect(buildCorpusVocabulary<Row>([]).distinctStrings('genre')).toEqual([]);
	});

	it('caches per field, returning the same array instance', () => {
		const vocabulary = buildCorpusVocabulary<Row>([{ genre: 'fantasy' }]);

		expect(vocabulary.distinctStrings('genre')).toBe(vocabulary.distinctStrings('genre'));
	});

	it('keeps separate caches per field', () => {
		const vocabulary = buildCorpusVocabulary<Row>([{ authors: 'Le Guin', genre: 'fantasy' }]);

		expect(vocabulary.distinctStrings('genre')).toEqual(['fantasy']);
		expect(vocabulary.distinctStrings('authors')).toEqual(['Le Guin']);
	});
});

describe('isArrayField', () => {
	it('is true when ANY record holds an array', () => {
		// `some`, not `every`: a sparse corpus where most records omit `authors` still needs Fuse's
		// multi-key mode for the ones that have it.
		const vocabulary = buildCorpusVocabulary<Row>([{ authors: 'solo' }, { authors: ['a', 'b']}]);

		expect(vocabulary.isArrayField('authors')).toBe(true);
	});

	it('is false for a scalar field', () => {
		expect(buildCorpusVocabulary<Row>([{ genre: 'fantasy' }]).isArrayField('genre')).toBe(false);
	});

	it('is false for a field no record holds', () => {
		expect(buildCorpusVocabulary<Row>([{ genre: 'fantasy' }]).isArrayField('missing')).toBe(false);
	});

	it('caches a FALSE answer rather than re-scanning', () => {
		// The case a truthiness-based cache check gets wrong. `false` is a real answer, and most fields
		// are not arrays — so a cache that only short-circuits on `true` re-scans the entire corpus on
		// every call for nearly every field. Asserted behaviorally: the answer must not change when the
		// underlying array is mutated after the first read, which can only hold if it was cached.
		const rows: Row[] = [{ genre: 'fantasy' }];
		const vocabulary = buildCorpusVocabulary<Row>(rows);

		expect(vocabulary.isArrayField('genre')).toBe(false);

		rows.push({ genre: ['now', 'an', 'array']});

		expect(vocabulary.isArrayField('genre')).toBe(false);
	});

	it('caches a TRUE answer too', () => {
		const rows: Row[] = [{ authors: ['a']}];
		const vocabulary = buildCorpusVocabulary<Row>(rows);

		expect(vocabulary.isArrayField('authors')).toBe(true);

		rows.length = 0;

		expect(vocabulary.isArrayField('authors')).toBe(true);
	});
});

describe('numericBounds', () => {
	const fallback = { max: 1000, min: 0 };

	it('spans the corpus extent', () => {
		const vocabulary = buildCorpusVocabulary<Row>([{ pageCount: 120 }, { pageCount: 900 }, { pageCount: 400 }]);

		expect(vocabulary.numericBounds('pageCount', fallback)).toEqual({ max: 900, min: 120 });
	});

	it('falls back to the declared bounds when no finite value exists', () => {
		// The config's declared min/max is the only sane track for a field the corpus cannot inform.
		// A `{ min: Infinity, max: -Infinity }` track would render an unusable slider.
		const vocabulary = buildCorpusVocabulary<Row>([{ pageCount: 'lots' }, { pageCount: null }, {}]);

		expect(vocabulary.numericBounds('pageCount', fallback)).toEqual(fallback);
	});

	it('excludes NaN and Infinity, which are numbers but not usable bounds', () => {
		// `typeof NaN === 'number'`, so a plain typeof check would let it through and poison the
		// min/max — every comparison against NaN is false, so the track silently collapses.
		//
		// The rejection happens in `deriveBaselineBounds`, not here. The assertion lives here because
		// the CONTRACT is this module's — a caller reads `numericBounds` and must get a usable track
		// regardless of which layer enforces it.
		const vocabulary = buildCorpusVocabulary<Row>([
			{ pageCount: Number.NaN },
			{ pageCount: Number.POSITIVE_INFINITY },
			{ pageCount: 300 },
		]);

		expect(vocabulary.numericBounds('pageCount', fallback)).toEqual({ max: 300, min: 300 });
	});

	it('falls back for an empty corpus', () => {
		expect(buildCorpusVocabulary<Row>([]).numericBounds('pageCount', fallback)).toEqual(fallback);
	});

	it('widens the track outward to the step grid when one is given', () => {
		// Delegated to react-ui's deriveBaselineBounds. Asserted here because the DELEGATION is the
		// contract: this is what keeps the config-driven sliders on the same grid as the hand-authored
		// panel's, which is the comparison /books-config exists to make.
		const vocabulary = buildCorpusVocabulary<Row>([{ pageCount: 123 }, { pageCount: 877 }]);

		expect(vocabulary.numericBounds('pageCount', fallback, 50)).toEqual({ max: 900, min: 100 });
	});

	it('reuses the cached numeric scan across calls with different fallbacks', () => {
		const vocabulary = buildCorpusVocabulary<Row>([{ pageCount: 200 }]);

		expect(vocabulary.numericBounds('pageCount', fallback)).toEqual({ max: 200, min: 200 });
		expect(vocabulary.numericBounds('pageCount', { max: 5, min: 1 })).toEqual({ max: 200, min: 200 });
	});
});

describe('numericValueStep', () => {
	/**
	 * A corpus holding one numeric field.
	 *
	 * @param values - The field's values, in any order.
	 * @returns The vocabulary over them.
	 */
	function overValues(values: readonly number[]) {
		return buildCorpusVocabulary<Row>(values.map((pageCount) => ({ pageCount })));
	}

	it('reads an integer grid as 1', () => {
		expect(overValues([120, 121, 400, 900]).numericValueStep('pageCount')).toBe(1);
	});

	it('reads a one-decimal grid as 0.1, within float tolerance', () => {
		// Books' `averageRating` shape. The measured gap carries float dust (0.09999999999999998), which
		// is why `sliderBucketCount` rounds rather than truncating — the count still lands on 41 over a
		// 1.0–5.0 track.
		expect(overValues([3.1, 3.2, 4.7]).numericValueStep('pageCount')).toBeCloseTo(0.1, 10);
	});

	it('takes the SMALLEST gap, not the first or the average', () => {
		// A field is only as coarse as its finest pair. Reading 10 here (the first gap) would ask for a
		// tenth of the bars the data can support.
		expect(overValues([0, 10, 20, 21]).numericValueStep('pageCount')).toBe(1);
	});

	it('is order-independent', () => {
		expect(overValues([900, 120, 400, 121]).numericValueStep('pageCount')).toBe(1);
	});

	it('ignores duplicate values, which contribute a zero gap', () => {
		// Distinct-first matters: a repeated value would otherwise measure a gap of 0 and, taken as the
		// grid, divide by zero on the way to a bucket count.
		expect(overValues([5, 5, 5, 8]).numericValueStep('pageCount')).toBe(3);
	});

	it.each([
		['a single distinct value', [7, 7, 7]],
		['an empty corpus', []],
	])('returns 0 for %s — no grid is observable', (_label, values) => {
		// Zero reads as "continuous" downstream, which yields the dense bucket count. That is the honest
		// answer: we did not measure a coarse grid, so we must not claim one.
		expect(overValues(values).numericValueStep('pageCount')).toBe(0);
	});

	it('skips non-numeric and non-finite entries', () => {
		const vocabulary = buildCorpusVocabulary<Row>([
			{ pageCount: 10 },
			{ pageCount: 'many' },
			{ pageCount: Number.NaN },
			{ pageCount: Number.POSITIVE_INFINITY },
			{ pageCount: 12 },
		]);

		expect(vocabulary.numericValueStep('pageCount')).toBe(2);
	});

	it('caches the scan', () => {
		const vocabulary = overValues([1, 2, 3]);

		expect(vocabulary.numericValueStep('pageCount')).toBe(vocabulary.numericValueStep('pageCount'));
	});
});
