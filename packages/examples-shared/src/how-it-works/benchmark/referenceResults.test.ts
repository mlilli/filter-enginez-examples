/**
 * Unit tests for the committed reference-number lookup helpers.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import {
	type BenchmarkConfig,
	configKey,
	NAIVE_BASELINE_MS,
	REFERENCE_MS_BY_CONFIG,
	referenceMsFor,
} from './referenceResults.js';

const ALL_ON: BenchmarkConfig = { bitmap: true, exclusionGraph: true, memoization: true };
const ALL_OFF: BenchmarkConfig = { bitmap: false, exclusionGraph: false, memoization: false };

describe('configKey', () => {
	it('encodes the three booleans as an ordered bitstring', () => {
		expect(configKey(ALL_ON)).toBe('111');
		expect(configKey(ALL_OFF)).toBe('000');
		expect(configKey({ bitmap: true, exclusionGraph: false, memoization: true })).toBe('101');
	});
});

describe('referenceMsFor', () => {
	it('returns the fully-stacked cell for all-on', () => {
		expect(referenceMsFor(ALL_ON)).toBe(REFERENCE_MS_BY_CONFIG['111']);
	});

	it('returns the naive baseline for all-off', () => {
		expect(referenceMsFor(ALL_OFF)).toBe(NAIVE_BASELINE_MS);
	});

	it('covers every one of the eight reachable configurations', () => {
		for (let mask = 0; mask < 8; mask += 1) {
			const config: BenchmarkConfig = {
				bitmap: Boolean(mask & 0b100),
				exclusionGraph: Boolean(mask & 0b010),
				memoization: Boolean(mask & 0b001),
			};

			expect(referenceMsFor(config)).toBeGreaterThan(0);
		}
	});
});

describe('REFERENCE_MS_BY_CONFIG', () => {
	it('shows the all-on cell is dramatically faster than the all-off baseline', () => {
		// No `?? fallback` needed any more: the table is typed as a TOTAL map over `BenchmarkConfigKey`,
		// so a missing cell is a compile error rather than a silent substitution.
		expect(NAIVE_BASELINE_MS / REFERENCE_MS_BY_CONFIG['111']).toBeGreaterThan(100);
	});
});
