/**
 * Tests for the slider scales and the histogram math that follows them.
 *
 * @remarks
 * The properties that matter are the ones a user feels: every value stays reachable (the scale is a
 * bijection on the baseline), the dense end of the data gets the room (a log track spends more of
 * itself near its anchor than a linear one), a keyboard press always moves the thumb, and the bars
 * count every record exactly once.
 */

import { describe, expect, it } from 'vitest';

import type { HistogramBucket } from './histogram.js';

import {
	createSliderScale,
	FINE_HISTOGRAM_BUCKET_CAP,
	fineHistogramQuery,
	linearSliderScale,
	LOG_KEYBOARD_FRACTION,
	logSliderScale,
	rebinHistogram,
	scaledBucketCount,
	snapToStep,
	stepScaledValue,
} from './scale.js';

/** A price-shaped baseline: a $4 floor and a long tail. */
const PRICE = { max: 3242, min: 4 } as const;

/** A vintage-shaped baseline: a few very old bottles, nearly everything recent. */
const VINTAGE = { max: 2025, min: 1911 } as const;

describe('linearSliderScale', () => {
	const scale = linearSliderScale({ max: 20, min: 10 });

	it('maps the baseline onto 0..1 proportionally', () => {
		expect(scale.toFraction(10)).toBe(0);
		expect(scale.toFraction(15)).toBe(0.5);
		expect(scale.toFraction(20)).toBe(1);
		expect(scale.fromFraction(0.25)).toBe(12.5);
	});

	it('clamps values and fractions outside the track', () => {
		expect(scale.toFraction(-5)).toBe(0);
		expect(scale.toFraction(99)).toBe(1);
		expect(scale.fromFraction(2)).toBe(20);
	});

	it('maps everything to the start of a degenerate baseline', () => {
		expect(linearSliderScale({ max: 3, min: 3 }).toFraction(3)).toBe(0);
	});
});

describe('logSliderScale', () => {
	it.each(['min', 'max'] as const)('round-trips every value when anchored at the %s', (anchor) => {
		// The scale changes spacing, never reach: each value is somewhere on the track, and reading the
		// track there gives the value back.
		const scale = logSliderScale(PRICE, anchor, 10);

		for (const value of [4, 5, 9, 27, 85, 163, 999, 3242]) {
			expect(scale.fromFraction(scale.toFraction(value))).toBeCloseTo(value, 6);
		}
		expect(scale.toFraction(PRICE.min)).toBe(0);
		expect(scale.toFraction(PRICE.max)).toBe(1);
	});

	it('gives the dense end of a price track far more room than a linear track does', () => {
		// Half of all wines cost under $27. Linear puts $27 at under 1% of the track.
		const log = logSliderScale(PRICE, 'min', 10);
		const linear = linearSliderScale(PRICE);

		expect(linear.toFraction(27)).toBeLessThan(0.01);
		expect(log.toFraction(27)).toBeGreaterThan(0.15);
	});

	it('anchored at the max, gives recent vintages the room', () => {
		const scale = logSliderScale(VINTAGE, 'max', 10);

		expect(scale.toFraction(2006)).toBeGreaterThan(0.5);
		expect(linearSliderScale(VINTAGE).toFraction(2006)).toBeGreaterThan(0.8);
		// Monotonic: an older vintage is further left.
		expect(scale.toFraction(1990)).toBeLessThan(scale.toFraction(2006));
	});

	it('falls back to linear for a non-positive softening or a degenerate span', () => {
		expect(logSliderScale(PRICE, 'min', 0).kind).toBe('linear');
		expect(logSliderScale({ max: 5, min: 5 }, 'min', 10).kind).toBe('linear');
	});
});

describe('createSliderScale', () => {
	it('builds a linear scale for a linear spec', () => {
		expect(createSliderScale({ kind: 'linear' }, PRICE, 1).kind).toBe('linear');
	});

	it('softens a log scale by ten grid steps', () => {
		const scale = createSliderScale({ anchor: 'min', kind: 'log' }, PRICE, 1);

		expect(scale.toFraction(27)).toBeCloseTo(logSliderScale(PRICE, 'min', 10).toFraction(27), 12);
	});

	it('softens a continuous field by a hundredth of its span', () => {
		const scale = createSliderScale({ anchor: 'min', kind: 'log' }, { max: 104, min: 4 }, 0);

		expect(scale.toFraction(54)).toBeCloseTo(logSliderScale({ max: 104, min: 4 }, 'min', 1).toFraction(54), 12);
	});
});

describe('snapToStep', () => {
	it('rounds onto the grid without float noise', () => {
		expect(snapToStep(0.30000000000000004, 0.1)).toBe(0.3);
		expect(snapToStep(26.6, 1)).toBe(27);
		expect(snapToStep(13.26, 0.1)).toBe(13.3);
	});

	it('leaves a value alone for a non-positive step', () => {
		expect(snapToStep(26.6, 0)).toBe(26.6);
	});
});

describe('stepScaledValue', () => {
	it('moves a linear thumb by exactly one step', () => {
		expect(stepScaledValue(linearSliderScale(PRICE), 50, 1, 5)).toBe(55);
		expect(stepScaledValue(linearSliderScale(PRICE), 50, -1, 5)).toBe(45);
	});

	it('moves a log thumb by about one percent of the track', () => {
		const scale = logSliderScale(PRICE, 'min', 10);
		const next = stepScaledValue(scale, 1000, 1, 1);

		expect(scale.toFraction(next) - scale.toFraction(1000)).toBeCloseTo(LOG_KEYBOARD_FRACTION, 3);
	});

	it('always moves a log thumb by at least one step', () => {
		// Near the anchor one percent of the track can be less than a dollar; snapping would then leave
		// the thumb where it was, and the key would appear dead.
		const scale = logSliderScale(PRICE, 'min', 10);

		expect(stepScaledValue(scale, 4, 1, 1)).toBe(5);
		expect(stepScaledValue(scale, 5, -1, 1)).toBe(4);
	});
});

describe('scaledBucketCount', () => {
	it('keeps the linear rule for a linear scale', () => {
		expect(scaledBucketCount(linearSliderScale({ max: 100, min: 80 }), { max: 100, min: 80 }, 1)).toBe(21);
	});

	it('sizes log bars so none is narrower than the widest grid step', () => {
		// The comb rule in track space: near the anchor one dollar takes the most track, and a bar
		// narrower than that could fall between two whole-dollar prices and draw empty.
		const scale = logSliderScale(PRICE, 'min', 10);
		const count = scaledBucketCount(scale, PRICE, 1);
		const widest = scale.toFraction(PRICE.min + 1) - scale.toFraction(PRICE.min);

		expect(count).toBe(Math.floor(1 / widest));
		expect(1 / count).toBeGreaterThanOrEqual(widest);
		expect(count).toBe(60);
	});

	it('measures the widest step at the max end for a max-anchored scale', () => {
		const scale = logSliderScale(VINTAGE, 'max', 10);
		const widest = scale.toFraction(VINTAGE.max) - scale.toFraction(VINTAGE.max - 1);

		expect(scaledBucketCount(scale, VINTAGE, 1)).toBe(Math.floor(1 / widest));
		expect(scaledBucketCount(scale, VINTAGE, 1)).toBe(26);
	});

	it('never yields an empty bar over a fully populated grid', () => {
		// The property the count exists for, checked directly: one record at every whole dollar.
		const scale = logSliderScale(PRICE, 'min', 10);
		const count = scaledBucketCount(scale, PRICE, 1);
		const everyDollar = Array.from({ length: PRICE.max - PRICE.min + 1 }, (_unused, index) => ({
			bucketMax: PRICE.min + index + 0.5,
			bucketMin: PRICE.min + index - 0.5,
			count: 1,
			heightFraction: 0,
			inSelection: false,
		}));

		expect(rebinHistogram(everyDollar, scale, count, PRICE.min, PRICE.max).every((slice) => slice.count > 0)).toBe(true);
	});

	it('uses the dense count for a continuous field', () => {
		expect(scaledBucketCount(logSliderScale(PRICE, 'min', 10), PRICE, 0)).toBe(84);
	});
});

describe('fineHistogramQuery', () => {
	it('asks for one bucket per grid position, centered on it', () => {
		const query = fineHistogramQuery({ max: 10, min: 4 }, 1);

		expect(query).toEqual({ baselineMax: 10.5, baselineMin: 3.5, bucketCount: 7 });
	});

	it('caps the bucket count for a very fine grid', () => {
		expect(fineHistogramQuery(PRICE, 0.01)).toEqual({
			baselineMax: PRICE.max,
			baselineMin: PRICE.min,
			bucketCount: FINE_HISTOGRAM_BUCKET_CAP,
		});
	});
});

describe('rebinHistogram', () => {
	/**
	 * Build fine buckets centered on consecutive integers.
	 *
	 * @param counts - One count per integer, starting at `start`.
	 * @param start - The first integer.
	 * @returns The buckets.
	 */
	function fineBuckets(counts: readonly number[], start: number): readonly HistogramBucket[] {
		return counts.map((count, index) => ({
			bucketMax: start + index + 0.5,
			bucketMin: start + index - 0.5,
			count,
			heightFraction: 0,
			inSelection: false,
		}));
	}

	it('keeps every record, exactly once', () => {
		const counts = Array.from({ length: 200 }, (_unused, index) => (index * 7) % 13);
		const scale = logSliderScale({ max: 203, min: 4 }, 'min', 10);
		const slices = rebinHistogram(fineBuckets(counts, 4), scale, 20, 4, 203);

		expect(slices.reduce((sum, slice) => sum + slice.count, 0)).toBe(counts.reduce((sum, count) => sum + count, 0));
	});

	it('puts each value in the slice whose value-space edges contain it', () => {
		const scale = logSliderScale({ max: 203, min: 4 }, 'min', 10);
		const counts = new Array<number>(200).fill(0);

		counts[50] = 3;
		const slices = rebinHistogram(fineBuckets(counts, 4), scale, 20, 4, 203);
		const holder = slices.find((slice) => slice.count === 3);

		expect(holder?.bucketMin).toBeLessThanOrEqual(54);
		expect(holder?.bucketMax).toBeGreaterThan(54);
	});

	it('slices the track evenly, so the bars line up with the thumbs', () => {
		const scale = logSliderScale({ max: 203, min: 4 }, 'min', 10);
		const slices = rebinHistogram(fineBuckets([1, 1, 1], 4), scale, 4, 4, 203);

		const starts = slices.map((slice) => scale.toFraction(slice.bucketMin));

		expect(starts).toHaveLength(4);
		for (const [index, start] of starts.entries()) {
			expect(start).toBeCloseTo(index / 4, 9);
		}
		expect(slices.at(-1)?.bucketMax).toBeCloseTo(203, 9);
	});

	it('normalizes heights and flags the selected slices', () => {
		const scale = linearSliderScale({ max: 7, min: 4 });
		const slices = rebinHistogram(fineBuckets([2, 4, 0, 1], 4), scale, 4, 6, 7);

		expect(slices.map((slice) => slice.heightFraction)).toEqual([0.5, 1, 0, 0.25]);
		// Slices [4, 4.75], [4.75, 5.5], [5.5, 6.25], [6.25, 7] against a selection of 6..7.
		expect(slices.map((slice) => slice.inSelection)).toEqual([false, false, true, true]);
	});

	it('returns nothing for nothing', () => {
		expect(rebinHistogram([], linearSliderScale(PRICE), 10, 0, 1)).toEqual([]);
		expect(rebinHistogram(fineBuckets([1], 4), linearSliderScale(PRICE), 0, 0, 1)).toEqual([]);
	});
});
