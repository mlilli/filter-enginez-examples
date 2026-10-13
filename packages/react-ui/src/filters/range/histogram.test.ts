/**
 * Tests for the histogram helpers: `computeHistogram` (equal-width bucketing +
 * in-selection tagging), `applyRulesExcept` (filtered-except-self evaluation), and the four
 * shared BAR primitives every vertical's overlay renders through.
 *
 * @remarks
 * Pure logic — no rendering. `applyRulesExcept` is fed hand-built rule stubs shaped
 * `{ action }` rather than real engine rules, keeping this suite free of any engine
 * dependency (the `react-ui` layer rule).
 *
 * The bar primitives are tested HERE rather than through any one framework's slider precisely
 * because six sliders share them: a tier bug found through `<RangeHistogram>` would say nothing
 * about the Angular or vanilla port, and asserting it six times would be the duplication sharing
 * them avoids.
 */

import { describe, expect, it } from 'vitest';

import {
	applyRulesExcept,
	computeHistogram,
	DENSE_BUCKET_COUNT,
	histogramBarClassName,
	histogramBarHeightPercent,
	histogramBarTier,
	type HistogramBucket,
	sliderBucketCount,
} from './histogram.js';

/** Minimal rule stub matching the structural contract `applyRulesExcept` consumes. */
type RuleStub<T> = { readonly action: (item: T, rule: unknown) => boolean };

/**
 * Build a bucket with only the fields under test specified.
 *
 * @param bucketMin - Left edge.
 * @param bucketMax - Right edge.
 * @param overrides - `count` / `heightFraction` when the case cares.
 * @returns The bucket. `inSelection` is always `false` — the tier functions must IGNORE it, which
 *   is the property the fixture is shaped to expose rather than accommodate.
 */
function bucketOf(
	bucketMin: number,
	bucketMax: number,
	overrides: Partial<Pick<HistogramBucket, 'count' | 'heightFraction'>> = {},
): HistogramBucket {
	return {
		bucketMax,
		bucketMin,
		count: overrides.count ?? 1,
		heightFraction: overrides.heightFraction ?? 0.5,
		inSelection: false,
	};
}

describe('computeHistogram', () => {
	it('returns [] when the range span is non-positive', () => {
		expect(computeHistogram([1, 2, 3], { max: 5, min: 5 }, 0, 10)).toEqual([]);
		expect(computeHistogram([1, 2, 3], { max: 0, min: 10 }, 0, 10)).toEqual([]);
	});

	it('returns [] when bucketCount is non-positive', () => {
		expect(computeHistogram([1, 2, 3], { max: 10, min: 0 }, 0, 10, 0)).toEqual([]);
	});

	it('buckets values, skips out-of-range, clamps the max value into the last bucket, and normalizes', () => {
		// bounds [0,10] / 10 buckets → width 1; buckets i cover [i, i+1).
		// values: in-range 0,2,2,5,10 (10 clamps into bucket 9) + out-of-range -1,11 (skipped).
		const buckets = computeHistogram([0, 2, 2, 5, 10, -1, 11], { max: 10, min: 0 }, 2, 5, 10);

		expect(buckets).toHaveLength(10);
		// Tallest bucket is index 2 (count 2) → it normalizes to 1; a count-1 bucket to 0.5.
		expect(buckets[0]).toEqual({ bucketMax: 1, bucketMin: 0, count: 1, heightFraction: 0.5, inSelection: false });
		expect(buckets[2]).toEqual({ bucketMax: 3, bucketMin: 2, count: 2, heightFraction: 1, inSelection: true });
		// The value 10 landed in the last bucket via the `Math.min(..., bucketCount - 1)` clamp.
		expect(buckets[9]).toEqual({ bucketMax: 10, bucketMin: 9, count: 1, heightFraction: 0.5, inSelection: false });
	});

	it('marks the in-selection arm true/false by overlap, not containment', () => {
		const buckets = computeHistogram([], { max: 10, min: 0 }, 2, 5, 10);

		// bucket [2,3) overlaps [2,5]; bucket [5,6) overlaps at its left edge; bucket [0,1) does not.
		expect(buckets[2]?.inSelection).toBe(true);
		expect(buckets[5]?.inSelection).toBe(true);
		expect(buckets[0]?.inSelection).toBe(false);
	});

	it('safe-divides when every bucket is empty (maxCount === 0)', () => {
		// All values fall outside the bounds → every count 0 → heightFraction 0 (not NaN).
		const buckets = computeHistogram([-5, 20], { max: 10, min: 0 }, 0, 10, 4);

		expect(buckets).toHaveLength(4);
		expect(buckets.every((bucket) => bucket.count === 0 && bucket.heightFraction === 0)).toBe(true);
	});
});

describe('applyRulesExcept', () => {
	it('returns the same items reference when no rules remain after the exclusion', () => {
		const items = [{ n: 1 }, { n: 2 }];
		const rules = new Map<string, RuleStub<{ n: number }>>([['target', { action: () => true }]]);

		expect(applyRulesExcept(items, rules, 'target')).toBe(items);
	});

	it('skips the excluded rule and keeps items passing every remaining rule (pass + fail-break arms)', () => {
		const items = [{ n: 5 }, { n: -1 }, { n: 20 }];
		const rules = new Map<string, RuleStub<{ n: number }>>([
			['positive', { action: (item) => item.n > 0 }],
			['single-digit', { action: (item) => item.n < 10 }],
			// The excluded rule would reject everything; proving it is genuinely skipped.
			['target', { action: () => false }],
		]);

		// {n:5} passes both; {n:-1} fails 'positive' (early break); {n:20} passes 'positive', fails 'single-digit'.
		expect(applyRulesExcept(items, rules, 'target')).toEqual([{ n: 5 }]);
	});
});

describe('histogramBarTier', () => {
	const AVAILABLE = { max: 8, min: 2 };

	it('tiers a bucket wholly inside the displayed selection as selected', () => {
		expect(histogramBarTier(bucketOf(4, 5), AVAILABLE, 3, 6)).toBe('selected');
	});

	it('tiers a bucket inside available but past the selection as available', () => {
		expect(histogramBarTier(bucketOf(7, 8), AVAILABLE, 3, 6)).toBe('available');
		expect(histogramBarTier(bucketOf(2, 3), AVAILABLE, 5, 6)).toBe('available');
	});

	it('tiers a bucket beyond the available zone as outside, on either side', () => {
		expect(histogramBarTier(bucketOf(0, 1), AVAILABLE, 3, 6)).toBe('outside');
		expect(histogramBarTier(bucketOf(9, 10), AVAILABLE, 3, 6)).toBe('outside');
	});

	it('admits a boundary bucket by OVERLAP rather than containment', () => {
		// [1,3) straddles available.min and [7,9) straddles available.max. Under containment both
		// would read as outside and render dim, leaving a thumb parked at the edge hanging over a dim
		// bar. Overlap tiers both as real territory.
		//
		// NB the lower case needs a selection that clears bucketMax: with `displayLower` at 3 the
		// bucket touches the selection too and correctly tiers 'selected', which would prove the
		// availability test nothing.
		expect(histogramBarTier(bucketOf(1, 3), AVAILABLE, 5, 6)).toBe('available');
		expect(histogramBarTier(bucketOf(7, 9), AVAILABLE, 3, 6)).toBe('available');
	});

	it('admits an exactly-touching edge, which is what the epsilon buys', () => {
		// bucketMax === available.min and bucketMin === available.max: a strict comparison tiers
		// both outside, and the epsilon is the only reason they do not flip on float drift.
		expect(histogramBarTier(bucketOf(1, 2), AVAILABLE, 3, 6)).toBe('available');
		expect(histogramBarTier(bucketOf(8, 9), AVAILABLE, 3, 6)).toBe('available');
		// Same at the selection boundary: [6,7) touches displayUpper exactly.
		expect(histogramBarTier(bucketOf(6, 7), AVAILABLE, 3, 6)).toBe('selected');
	});

	it('ignores the bucket\'s own inSelection flag', () => {
		// The flag is computed upstream from raw rule config, which mis-tiers default-wide rules.
		// Every fixture here carries `inSelection: false`, so a tier of 'selected'
		// proves the classification came from displayLower / displayUpper instead.
		const claimsNotSelected = { ...bucketOf(4, 5), inSelection: false };

		expect(histogramBarTier(claimsNotSelected, AVAILABLE, 3, 6)).toBe('selected');
	});
});

describe('histogramBarHeightPercent', () => {
	it('floors an empty bucket at the 4% nub', () => {
		expect(histogramBarHeightPercent(bucketOf(0, 1, { count: 0, heightFraction: 0 }))).toBe(4);
	});

	it('floors a populated bucket at 18%, well clear of the empty nub', () => {
		// 1 item in 130_000 maps to ~0%, which is why the two floors differ at all.
		expect(histogramBarHeightPercent(bucketOf(0, 1, { count: 1, heightFraction: 0.0000077 }))).toBe(18);
	});

	it('uses the fraction once it clears the floor', () => {
		expect(histogramBarHeightPercent(bucketOf(0, 1, { count: 9, heightFraction: 0.5 }))).toBe(50);
		expect(histogramBarHeightPercent(bucketOf(0, 1, { count: 20, heightFraction: 1 }))).toBe(100);
	});
});

describe('histogramBarClassName', () => {
	const AVAILABLE = { max: 8, min: 2 };

	it('emits the base class then the tier modifier', () => {
		expect(histogramBarClassName(bucketOf(4, 5), AVAILABLE, 3, 6)).toBe(
			'fe-range-histogram__bar fe-range-histogram__bar--selected',
		);
		expect(histogramBarClassName(bucketOf(7, 8), AVAILABLE, 3, 6)).toBe(
			'fe-range-histogram__bar fe-range-histogram__bar--available',
		);
		expect(histogramBarClassName(bucketOf(0, 1, { count: 3 }), AVAILABLE, 3, 6)).toBe(
			'fe-range-histogram__bar fe-range-histogram__bar--outside',
		);
	});

	it('appends the empty modifier for a zero-count bucket, in every tier', () => {
		expect(histogramBarClassName(bucketOf(4, 5, { count: 0 }), AVAILABLE, 3, 6)).toBe(
			'fe-range-histogram__bar fe-range-histogram__bar--selected fe-range-histogram__bar--empty',
		);
		expect(histogramBarClassName(bucketOf(0, 1, { count: 0 }), AVAILABLE, 3, 6)).toBe(
			'fe-range-histogram__bar fe-range-histogram__bar--outside fe-range-histogram__bar--empty',
		);
	});
});

describe('sliderBucketCount', () => {
	it('gives a continuous field the dense count regardless of its extent', () => {
		expect(sliderBucketCount({ max: 2_000_000, min: 0 }, 0)).toBe(DENSE_BUCKET_COUNT);
		expect(sliderBucketCount({ max: 5, min: 0 }, 0)).toBe(DENSE_BUCKET_COUNT);
	});

	it('gives a narrow integer field exactly one bucket per value', () => {
		// Wine's `points`: 80–100 inclusive is 21 integers, and any finer count combs them.
		expect(sliderBucketCount({ max: 100, min: 80 }, 1)).toBe(21);
		// Real estate's `bedrooms`: 0–10.
		expect(sliderBucketCount({ max: 10, min: 0 }, 1)).toBe(11);
	});

	it('counts positions on a FRACTIONAL grid, not integers within it', () => {
		// Real estate's `bathrooms` generates as `Math.round(x * 2) / 2`, so 0–10 holds 21 half-steps.
		// Treating it as integer would give 11 buckets, each pairing a half-bath with a whole one —
		// the comb this function exists to avoid, arrived at by reading the slider instead of the data.
		expect(sliderBucketCount({ max: 10, min: 0 }, 0.5)).toBe(21);
		// Books' `averageRating` is stored to one decimal.
		expect(sliderBucketCount({ max: 5, min: 1 }, 0.1)).toBe(41);
	});

	it('caps a wide grid at the dense count', () => {
		// `year-built` 1900–2025 is 126 values; 84 buckets is formally uneven and invisible at ≈2px.
		expect(sliderBucketCount({ max: 2025, min: 1900 }, 1)).toBe(DENSE_BUCKET_COUNT);
		// Wine's `price`, stored to the cent over a wide track, is capped rather than asked for 35,001.
		expect(sliderBucketCount({ max: 350, min: 0 }, 0.01)).toBe(DENSE_BUCKET_COUNT);
	});

	it('never returns less than one bucket for a degenerate baseline', () => {
		// A corpus with a single distinct value: one bar beats an empty overlay.
		expect(sliderBucketCount({ max: 7, min: 7 }, 1)).toBe(1);
		// Inverted bounds should not produce a negative or zero count either.
		expect(sliderBucketCount({ max: 0, min: 5 }, 1)).toBe(1);
	});

	it('rounds a grid-position count rather than truncating it', () => {
		// A baseline derived from data can carry float dust (2024.9999999); rounding keeps the count
		// at one-per-year instead of silently dropping the last bucket.
		expect(sliderBucketCount({ max: 2024.9999999, min: 2020 }, 1)).toBe(6);
	});
});
