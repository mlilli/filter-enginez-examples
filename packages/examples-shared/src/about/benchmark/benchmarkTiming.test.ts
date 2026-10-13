/**
 * Unit tests for the pure benchmark timing + statistics helpers.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import {
	assessSamples,
	computeSpeedup,
	formatDuration,
	formatSpeedup,
	logBarWidthPercent,
	median,
	medianAbsoluteDeviation,
} from './benchmarkTiming.js';

describe('median', () => {
	it('returns 0 for an empty list', () => {
		expect(median([])).toBe(0);
	});

	it('returns the middle value for an odd-length list', () => {
		expect(median([3, 1, 2])).toBe(2);
	});

	it('averages the two middle values for an even-length list', () => {
		expect(median([1, 2, 3, 4])).toBe(2.5);
	});
});

describe('medianAbsoluteDeviation', () => {
	it('returns 0 for an empty list', () => {
		expect(medianAbsoluteDeviation([], 0)).toBe(0);
	});

	it('measures dispersion around the center', () => {
		// deviations from 5 are [3,1,0,1,3] → median 1.
		expect(medianAbsoluteDeviation([2, 4, 5, 6, 8], 5)).toBe(1);
	});
});

describe('assessSamples', () => {
	it('falls back to reference when there are too few post-warmup samples', () => {
		const result = assessSamples([1, 1, 1], { minSamples: 3, warmupDiscard: 2 });

		expect(result.mode).toBe('reference');
	});

	it('reports live for a tight cluster of samples', () => {
		const result = assessSamples([9, 9, 0.1, 0.1, 0.1, 0.1, 0.1], { warmupDiscard: 2 });

		expect(result.mode).toBe('live');
		expect(result.medianMs).toBeCloseTo(0.1, 5);
		expect(result.relativeSpread).toBeLessThanOrEqual(0.5);
	});

	it('falls back to reference for a noisy cluster', () => {
		// Post-warmup [1,3,1,5,2,8]: median 2.5, MAD 1.5 → relative spread 0.6 > 0.5.
		const result = assessSamples([0, 0, 1, 3, 1, 5, 2, 8], { warmupDiscard: 2 });

		expect(result.mode).toBe('reference');
		expect(result.relativeSpread).toBeGreaterThan(0.5);
	});

	it('treats a degenerate zero median as reference with infinite spread', () => {
		const result = assessSamples([5, 5, 0, 0, 0, 0], { warmupDiscard: 2 });

		expect(result.mode).toBe('reference');
		expect(result.relativeSpread).toBe(Number.POSITIVE_INFINITY);
	});

	it('discards non-finite / negative samples', () => {
		const result = assessSamples([0, 0, Number.NaN, -1, 0.2, 0.2, 0.2, 0.2], { warmupDiscard: 2 });

		expect(result.medianMs).toBeCloseTo(0.2, 5);
	});
});

describe('computeSpeedup', () => {
	it('divides baseline by current', () => {
		expect(computeSpeedup(28, 0.08)).toBeCloseTo(350, 0);
	});

	it('returns 1 for a non-positive current or baseline', () => {
		expect(computeSpeedup(28, 0)).toBe(1);
		expect(computeSpeedup(0, 5)).toBe(1);
	});
});

describe('formatDuration', () => {
	it('uses three decimals sub-millisecond', () => {
		expect(formatDuration(0.0867)).toBe('0.087 ms');
	});

	it('uses two decimals under 10 ms', () => {
		expect(formatDuration(5.234)).toBe('5.23 ms');
	});

	it('uses one decimal at or above 10 ms', () => {
		expect(formatDuration(28.93)).toBe('28.9 ms');
	});

	it('renders an em dash for invalid input', () => {
		expect(formatDuration(-1)).toBe('—');
		expect(formatDuration(Number.NaN)).toBe('—');
	});
});

describe('formatSpeedup', () => {
	it('uses one decimal under 10x', () => {
		expect(formatSpeedup(3.42)).toBe('3.4×');
	});

	it('rounds to a whole number at or above 10x', () => {
		expect(formatSpeedup(334.2)).toBe('334×');
	});

	it('renders an em dash for invalid input', () => {
		expect(formatSpeedup(0)).toBe('—');
	});
});

describe('logBarWidthPercent', () => {
	it('returns 0 for a non-positive duration', () => {
		expect(logBarWidthPercent(0)).toBe(0);
	});

	it('maps the floor to 0 and the ceiling to 100', () => {
		expect(logBarWidthPercent(0.05, 0.05, 40)).toBeCloseTo(0, 5);
		expect(logBarWidthPercent(40, 0.05, 40)).toBeCloseTo(100, 5);
	});

	it('clamps out-of-range values', () => {
		expect(logBarWidthPercent(0.001, 0.05, 40)).toBe(0);
		expect(logBarWidthPercent(1000, 0.05, 40)).toBe(100);
	});

	it('places a mid-range value monotonically between the ends', () => {
		const low = logBarWidthPercent(0.1);
		const mid = logBarWidthPercent(1);
		const high = logBarWidthPercent(10);

		expect(low).toBeLessThan(mid);
		expect(mid).toBeLessThan(high);
	});
});
