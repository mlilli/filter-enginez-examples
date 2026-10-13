/**
 * Tests for the two chip-group readers that reshape a bundle for a hierarchical picker, and for the
 * two histogram readers that reshape one for a range slider.
 *
 * @remarks
 * What is actually being tested for the chip pair, beyond the reshaping, is that the rule id is a PARAMETER — real estate's
 * location tree reads the identical structure over `'location'`, and a reader that silently only
 * answers for one group would return an empty map, which every control reads as "no information" and
 * renders as all-enabled. That failure has no error and no visual tell: the picker simply stops
 * disabling, and the user clicks a node that yields nothing.
 *
 * `bundleHistogramToBuckets` is tested here, its one home; `wine-domain` only re-exports it.
 *
 * The other readers on this module (`chipExclusionMap`, `fieldBounds`, `toggleWouldBeEmpty`) are
 * covered from `books-domain/bundle.test.ts`.
 */

import type { FilterBundle, FilterBundleFieldMeta } from '@filter-enginez/core';

import { describe, expect, it } from 'vitest';

import { bundleHistogramToBuckets, chipDisabledSet, chipProjectedCounts, fieldHistogram } from './bundleReaders.js';

/**
 * A histogram in the typed-array shape the engine returns.
 *
 * @param counts - Per-bucket counts.
 * @param edges - Bucket edges, one more than `counts`.
 * @returns The histogram.
 */
function histogram(counts: readonly number[], edges: readonly number[]): FilterBundleFieldMeta['histogram'] {
	return { bucketEdges: Float64Array.from(edges), counts: Uint32Array.from(counts) };
}

/**
 * A bundle carrying two chip groups, so a reader that ignores its `ruleId` argument fails loudly, and
 * two slider fields for the same reason.
 *
 * @returns The bundle, cast past the parts these readers never touch.
 */
function makeBundle(): FilterBundle {
	return {
		chipGroups: [
			{
				candidates: [
					{ projectedCount: 2, value: 'armenia', wouldBeEmpty: false },
					{ projectedCount: 0, value: 'atlantis', wouldBeEmpty: true },
				],
				ruleId: 'origin',
			},
			{
				candidates: [
					{ projectedCount: 41, value: 'metro:CO/Greater Denver', wouldBeEmpty: false },
					{ projectedCount: 0, value: 'metro:TX/Austin', wouldBeEmpty: true },
				],
				ruleId: 'location',
			},
		],
		fields: [
			{
				bounds: { max: 30, min: 0 },
				fieldKey: 'priceUsd',
				histogram: histogram([1, 4, 2], [0, 10, 20, 30]),
				ruleId: 'price',
			},
			{
				bounds: { max: 2, min: 0 },
				fieldKey: 'bedrooms',
				histogram: histogram([], []),
				ruleId: 'bedrooms',
			},
		],
	} as unknown as FilterBundle;
}

describe('chipProjectedCounts', () => {
	it('maps each candidate to its PROJECTED result count', () => {
		// The number the user gets after clicking — not the node's leaf count, which is a different
		// quantity that merely looks like one. "Armenia" has one leaf region beneath it and produces 2
		// results; the badge must read 2.
		const counts = chipProjectedCounts(makeBundle(), 'origin');

		expect(counts.get('armenia')).toBe(2);
		// Zero is a real answer, distinct from absent: the row is disabled AND says why.
		expect(counts.get('atlantis')).toBe(0);
	});

	it('reads a group other than the first', () => {
		// The rule id is a real parameter, not a hardcoded `'origin'`.
		expect(chipProjectedCounts(makeBundle(), 'location').get('metro:CO/Greater Denver')).toBe(41);
	});

	it('returns empty before the bundle settles, so no badge renders', () => {
		// Better than a placeholder: any number shown here would be replaced moments later by a
		// different one, which reads as the UI correcting itself.
		expect(chipProjectedCounts(null, 'origin').size).toBe(0);
	});

	it('returns empty when the bundle carries no such group', () => {
		expect(chipProjectedCounts(makeBundle(), 'school-district').size).toBe(0);
	});
});

describe('chipDisabledSet', () => {
	it('collects only the candidates that would empty the results', () => {
		expect([...chipDisabledSet(makeBundle(), 'origin')]).toEqual(['atlantis']);
	});

	it('reads a group other than the first', () => {
		expect([...chipDisabledSet(makeBundle(), 'location')]).toEqual(['metro:TX/Austin']);
	});

	it.each([
		['the bundle has not arrived', null],
		['the bundle carries no such group', makeBundle()],
	])('returns an empty set when %s', (label, bundle) => {
		// Empty means "everything selectable" — the recoverable direction to be wrong in. A set of all
		// node ids would render the entire picker dead during the first frame after boot.
		expect(chipDisabledSet(bundle, label === 'the bundle has not arrived' ? 'origin' : 'absent').size).toBe(0);
	});
});

describe('bundleHistogramToBuckets', () => {
	it('normalizes heights against the tallest bucket', () => {
		const buckets = bundleHistogramToBuckets(histogram([1, 4, 2], [0, 10, 20, 30]), 0, 30);

		expect(buckets.map((bucket) => bucket.heightFraction)).toEqual([0.25, 1, 0.5]);
	});

	it('carries each bucket its own edges and count', () => {
		const buckets = bundleHistogramToBuckets(histogram([3, 7], [0, 50, 100]), 0, 100);

		expect(buckets[0]).toMatchObject({ bucketMax: 50, bucketMin: 0, count: 3 });
		expect(buckets[1]).toMatchObject({ bucketMax: 100, bucketMin: 50, count: 7 });
	});

	it('marks only the buckets overlapping the selection', () => {
		const buckets = bundleHistogramToBuckets(histogram([1, 1, 1], [0, 10, 20, 30]), 12, 18);

		expect(buckets.map((bucket) => bucket.inSelection)).toEqual([false, true, false]);
	});

	it('marks both buckets a selection straddles', () => {
		// [45, 55] crosses the 50 boundary, so the first two overlap and the third does not.
		const buckets = bundleHistogramToBuckets(histogram([1, 1, 1], [0, 50, 60, 100]), 45, 55);

		expect(buckets.map((bucket) => bucket.inSelection)).toEqual([true, true, false]);
	});

	it('counts a bucket that merely touches the selection edge as in-selection', () => {
		// Inclusive on both ends. Excluding the touching bucket leaves a visible one-bar gap between the
		// handle and the shaded region, which reads as an off-by-one in the slider rather than in here.
		const buckets = bundleHistogramToBuckets(histogram([1, 1], [0, 10, 20]), 10, 10);

		expect(buckets.map((bucket) => bucket.inSelection)).toEqual([true, true]);
	});

	it('survives an all-zero histogram', () => {
		// A real state — every bucket filtered out. Dividing by a zero max would make every bar NaN
		// tall, which renders as NO bars rather than as a flat empty distribution.
		const buckets = bundleHistogramToBuckets(histogram([0, 0], [0, 10, 20]), 0, 20);

		expect(buckets.every((bucket) => bucket.heightFraction === 0)).toBe(true);
	});

	it('returns nothing for an empty histogram', () => {
		expect(bundleHistogramToBuckets(histogram([], []), 0, 10)).toEqual([]);
	});
});

describe('fieldHistogram', () => {
	it('finds the named field and reshapes its histogram', () => {
		const buckets = fieldHistogram(makeBundle(), 'price', 0, 30);

		expect(buckets?.map((bucket) => bucket.count)).toEqual([1, 4, 2]);
		expect(buckets?.[1]).toMatchObject({ bucketMax: 20, bucketMin: 10 });
	});

	it('passes the selection through to the in-selection flags', () => {
		// Not what tiers the bars — the controls recompute that from their own displayed handles — but a
		// consumer reading the flag directly must still get an answer that reflects its arguments.
		expect(fieldHistogram(makeBundle(), 'price', 12, 18)?.map((bucket) => bucket.inSelection))
			.toEqual([false, true, false]);
	});

	it.each([
		['the bundle has not arrived', null, 'price'],
		['the field was not queried', makeBundle(), 'square-feet'],
		['the field carried no buckets', makeBundle(), 'bedrooms'],
	])('returns undefined when %s', (_label, bundle, ruleId) => {
		// Undefined and not `[]`: the sliders read absent as "render no overlay" and empty as "render an
		// overlay of nothing", and the second is 38px of blank space above the track that collapses a
		// frame later. Three different absences, one honest answer.
		expect(fieldHistogram(bundle, ruleId, 0, 100)).toBeUndefined();
	});
});
