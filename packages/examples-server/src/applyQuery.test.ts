/**
 * Unit tests for `applyConfigQuery` — the parity endpoint's brain (results + JSON-safe facet meta).
 *
 * @packageDocumentation
 */

import { and, type CompositeRule, exportConfig, type FilterBundleQuery, type FilterEngineConfig, type FilterRule, inSet, or, type RuleId, ruleRegistry } from '@filter-enginez/core';
import { describe, expect, it } from 'vitest';

import { applyConfigQuery } from './applyQuery.js';
import { getDataset, UnknownDatasetError } from './datasets.js';

const EMPTY_CONFIG: FilterEngineConfig = { rules: [], version: 1 };

/**
 * Build a config that puts `expr` in EXPRESSION mode, exactly as the server-backed transport does:
 * serialize → deserialize the composite, then `exportConfig` (which hoists inline leaves into `rules`
 * and emits the reference-tree `expression`).
 */
function buildExpressionConfig(expr: FilterRule): FilterEngineConfig {
	const reinstated = ruleRegistry.deserialize(expr.serialize()) as CompositeRule;

	return exportConfig({
		getExpression: () => reinstated,
		getGroups: () => [],
		getRules: () => new Map<RuleId, FilterRule>(),
	});
}

/** A single-rule config (fantasy genre) used to exercise the client-query path. */
const FANTASY_CONFIG: FilterEngineConfig = {
	rules: [{ id: 'genre', rule: { config: { set: ['fantasy']}, field: 'genre', type: 'InSetRule' }}],
	version: 1,
};

describe('applyConfigQuery', () => {
	it('returns results + JSON-safe predictive-disable facet metadata for the books config', async () => {
		const result = await applyConfigQuery('books', getDataset('books').defaultConfig, { limit: 5 });

		expect(result.datasetLabel).toBe('Books');
		expect(result.total).toBeGreaterThan(0);
		expect(result.matched).toBeGreaterThan(0);
		expect(result.results.length).toBeLessThanOrEqual(5);
		expect(result.truncated).toBe(true);

		// Chip groups (genre / language / format) carry per-candidate exclusion data.
		expect(result.chipGroups.length).toBeGreaterThan(0);
		const candidate = result.chipGroups[0]?.candidates[0];

		expect(typeof candidate?.value).toBe('string');
		expect(typeof candidate?.projectedCount).toBe('number');
		expect(typeof candidate?.wouldBeEmpty).toBe('boolean');

		// Slider fields (pageCount / publicationYear) carry plain-array histograms (not TypedArrays).
		expect(result.fields.length).toBeGreaterThan(0);
		const field = result.fields[0];

		expect(Array.isArray(field?.histogram.bucketEdges)).toBe(true);
		expect(Array.isArray(field?.histogram.counts)).toBe(true);
		expect(field?.histogram.bucketEdges.every((edge) => typeof edge === 'number')).toBe(true);

		// `resultIndices` is the FULL match set (a plain number[]), not sliced by `limit`.
		expect(Array.isArray(result.resultIndices)).toBe(true);
		expect(result.resultIndices.length).toBe(result.matched);
		expect(result.resultIndices.every((index) => Number.isInteger(index))).toBe(true);
	});

	it('honors an explicit client query verbatim (candidate order + fields preserved)', async () => {
		const query: FilterBundleQuery = {
			chipGroups: [{ candidates: ['fantasy', 'mystery', 'romance'], field: 'genre', kind: 'inSet', ruleId: 'genre' }],
			fields: [{ baselineMax: 1000, baselineMin: 0, bucketCount: 8, fieldKey: 'pageCount', ruleId: 'page-count' }],
		};
		const result = await applyConfigQuery('books', FANTASY_CONFIG, { limit: 0, query });

		// Records skipped (limit 0), but indices + facets are still computed.
		expect(result.results).toEqual([]);
		expect(result.resultIndices.length).toBe(result.matched);

		// Chip candidates come back in the exact order + set the client asked for.
		expect(result.chipGroups).toHaveLength(1);
		expect(result.chipGroups[0]?.candidates.map((candidate) => candidate.value)).toEqual(['fantasy', 'mystery', 'romance']);

		// The single requested field is echoed with an 8-bucket histogram (9 edges).
		expect(result.fields).toHaveLength(1);
		expect(result.fields[0]?.ruleId).toBe('page-count');
		expect(result.fields[0]?.histogram.counts).toHaveLength(8);
		expect(result.fields[0]?.histogram.bucketEdges).toHaveLength(9);
	});

	it('skips facet computation for an explicit empty query (the mirror-sync fast path)', async () => {
		const result = await applyConfigQuery('books', FANTASY_CONFIG, { limit: 0, query: {}});

		expect(result.chipGroups).toEqual([]);
		expect(result.fields).toEqual([]);
		// Indices + count are still authoritative — the mirror path only skips the facet work.
		expect(result.resultIndices.length).toBe(result.matched);
		expect(result.matched).toBeGreaterThan(0);
	});

	it('returns empty facet metadata for a config with no rules', async () => {
		const result = await applyConfigQuery('books', EMPTY_CONFIG, { limit: 0 });

		expect(result.matched).toBe(result.total);
		expect(result.chipGroups).toEqual([]);
		expect(result.fields).toEqual([]);
	});

	it('yields no chip candidates when an InSetRule points at a non-string field', async () => {
		// fieldString returns undefined for every record here, so the distinct-value set stays empty.
		// Covers both the "not a string" ternary arm and the `value !== undefined` false path.
		// A version that coerced instead of skipping would offer numeric chips as filter options.
		const result = await applyConfigQuery('books', {
			rules: [{ id: 'year-as-chip', rule: { config: { set: []}, field: 'publicationYear', type: 'InSetRule' }}],
			version: 1,
		});
		const group = result.chipGroups.find((entry) => entry.ruleId === 'year-as-chip');

		expect(group?.candidates).toEqual([]);
	});

	it('reports null bounds when a RangeRule points at a non-numeric field', async () => {
		// The mirror case: fieldNumber never yields a number, so the running min/max stay at ±Infinity
		// and the `Number.isFinite(...) ? ... : undefined` guards must hand back undefined. That is
		// what keeps the response JSON-safe — `JSON.stringify(Infinity)` is `null` anyway, but
		// arriving there by accident rather than by guard means NaN and Infinity leak into the
		// histogram maths too, which is how a slider ends up with an unusable range.
		const result = await applyConfigQuery('books', {
			rules: [{ id: 'title-as-range', rule: { config: { max: 10, min: 0 }, field: 'title', type: 'RangeRule' }}],
			version: 1,
		});
		const field = result.fields.find((entry) => entry.ruleId === 'title-as-range');

		expect(field?.bounds).toEqual({ max: null, min: null });
		expect(field?.histogram.counts.every((count) => count === 0)).toBe(true);
	});

	it('falls back to the default limit of 24 when none is supplied', async () => {
		const result = await applyConfigQuery('books', { rules: [], version: 1 });

		expect(result.results).toHaveLength(24);
	});

	it('returns every matching record when the limit is negative', async () => {
		// `limit < 0 ? bundle.resultIndices : slice(...)` — the unsliced arm. This is what the worker
		// and mirror-sync paths use to pull a full index set in one round trip.
		const result = await applyConfigQuery('books', { rules: [], version: 1 }, { limit: -1, query: {}});

		expect(result.results.length).toBe(result.matched);
		expect(result.results.length).toBeGreaterThan(24);
	});

	it('throws UnknownDatasetError for an unregistered dataset', async () => {
		await expect(applyConfigQuery('nope', EMPTY_CONFIG)).rejects.toBeInstanceOf(UnknownDatasetError);
	});

	describe('expression mode (smart filters)', () => {
		// What these guard: results are taken from `engine.getResultIndices()`, which honors an explicit
		// expression. `applyFiltersAndQuery().resultIndices` is a flat-rule + facet evaluator that ignores
		// the expression, so reading results from it would return the whole corpus whenever the flat rules
		// are cleared, and smart filters would have no effect on the server-backed routes.
		it('unions an OR expression (not the whole-corpus flat-rule fallback)', async () => {
			const fantasy = await applyConfigQuery('books', buildExpressionConfig(inSet('genre', ['fantasy'])), { limit: 0, query: {}});
			const mystery = await applyConfigQuery('books', buildExpressionConfig(inSet('genre', ['mystery'])), { limit: 0, query: {}});
			const either = await applyConfigQuery('books', buildExpressionConfig(or(inSet('genre', ['fantasy']), inSet('genre', ['mystery']))), { limit: 0, query: {}});

			// Genre is single-valued, so the OR is the disjoint union — strictly between one alone and all.
			expect(fantasy.matched).toBeGreaterThan(0);
			expect(mystery.matched).toBeGreaterThan(0);
			expect(either.matched).toBe(fantasy.matched + mystery.matched);
			expect(either.matched).toBeGreaterThan(fantasy.matched);
			expect(either.matched).toBeLessThan(either.total);
			expect(either.resultIndices.length).toBe(either.matched);
		});

		it('intersects an AND expression (two disjoint genres → zero)', async () => {
			const both = await applyConfigQuery('books', buildExpressionConfig(and(inSet('genre', ['fantasy']), inSet('genre', ['mystery']))), { limit: 0, query: {}});

			expect(both.matched).toBe(0);
			expect(both.resultIndices).toEqual([]);
		});
	});
});
