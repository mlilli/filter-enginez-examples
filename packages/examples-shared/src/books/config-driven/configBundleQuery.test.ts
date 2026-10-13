/**
 * Tests for deriving a predictive-disable bundle query from a JSON config.
 *
 * @remarks
 * This is the config-driven panel's half of a two-sided contract: it decides which facets get
 * predictive-disable data at all. A rule the query omits produces no bundle entry, which the consuming
 * hooks correctly read as "no information" and render as all-enabled — so a missed rule does not
 * error, it just silently turns predictive disable off for that control while every other facet keeps
 * working.
 *
 * The other side is `controlRegistry.deriveStep`. Both the slider and this query pad the baseline by
 * the same step, and they must agree: if they diverge, the bundle's available-range shading lands off
 * the slider's own grid, so the dimmed region is a pixel or two out and never quite lines up with the
 * handle. That coupling is asserted here rather than assumed.
 */

import type { FilterEngineConfig } from '@filter-enginez/core';

import { DENSE_BUCKET_COUNT } from '@filter-enginez/react-ui';
import { describe, expect, it, vi } from 'vitest';

import { buildConfigBundleQuery } from './configBundleQuery.js';
import { deriveStep } from './controlRegistry.js';
import { type CorpusVocabulary } from './vocabularies.js';

/** A vocabulary stub whose answers each test dictates. */
function stubVocabulary(overrides: Partial<CorpusVocabulary> = {}): CorpusVocabulary {
	return {
		distinctStrings: () => [],
		isArrayField: () => false,
		numericBounds: (_field, fallback) => fallback,
		// `0` reads as "no grid observable" → the dense bucket count. A test that cares about the count
		// overrides this; the rest get a stable, documented default.
		numericValueStep: () => 0,
		...overrides,
	};
}

/**
 * Build a config from bare rule descriptors.
 *
 * @param rules - `{ id, type, field, config }` tuples.
 * @returns A `FilterEngineConfig`-shaped object.
 */
function config(...rules: readonly { id: string; config?: unknown; field?: unknown; type: string }[]): FilterEngineConfig {
	return {
		rules: rules.map(({ config: ruleConfig = {}, field = 'genre', id, type }) => ({
			id,
			rule: { config: ruleConfig, field, type },
		})),
		version: 1,
	} as unknown as FilterEngineConfig;
}

describe('chip groups', () => {
	it('emits an inSet group for every InSetRule, with the corpus vocabulary as candidates', () => {
		const query = buildConfigBundleQuery(
			config({ field: 'genre', id: 'genre', type: 'InSetRule' }),
			stubVocabulary({ distinctStrings: () => ['fantasy', 'mystery']}),
		);

		expect(query.chipGroups).toEqual([{
			candidates: ['fantasy', 'mystery'],
			field: 'genre',
			kind: 'inSet',
			ruleId: 'genre',
		}]);
	});

	it('asks the vocabulary for the rule\'s OWN field', () => {
		// A query that asked about the wrong field would return a plausible candidate list belonging to
		// another facet — chips that exist, for values this control cannot select.
		const distinctStrings = vi.fn(() => ['en']);

		buildConfigBundleQuery(config({ field: 'language', id: 'language', type: 'InSetRule' }), stubVocabulary({ distinctStrings }));

		expect(distinctStrings).toHaveBeenCalledWith('language');
	});
});

describe('range fields', () => {
	it('pads the baseline with the SAME step the slider derives', () => {
		// The coupling that matters. `deriveStep` is the single source; if this query passed a different
		// step, the shaded available range would sit off the slider's grid.
		const seen: number[] = [];
		const query = buildConfigBundleQuery(
			config({ config: { max: 1500, min: 0 }, field: 'pageCount', id: 'page-count', type: 'RangeRule' }),
			stubVocabulary({
				numericBounds: (_field, fallback, step) => {
					seen.push(step ?? -1);

					return fallback;
				},
			}),
		);

		expect(seen[0]).toBe(deriveStep(0, 1500));
		expect(query.fields).toEqual([{
			baselineMax: 1500,
			baselineMin: 0,
			// The stub reports no observable grid, so the histogram falls to the dense count.
			bucketCount: DENSE_BUCKET_COUNT,
			fieldKey: 'pageCount',
			ruleId: 'page-count',
		}]);
	});

	it('sizes the histogram from the corpus grid, NOT from the slider step', () => {
		// The whole point of asking the vocabulary. `deriveStep(0, 1500)` is 10 — a comfortable drag
		// granularity — while the values are whole pages, so the grid is 1. Sizing off the step would ask
		// for 151 buckets on a field the config cannot describe; sizing off the grid caps at the dense
		// count. The two numbers are different here precisely so a mix-up cannot pass.
		const query = buildConfigBundleQuery(
			config({ config: { max: 1500, min: 0 }, field: 'pageCount', id: 'page-count', type: 'RangeRule' }),
			stubVocabulary({ numericValueStep: () => 1 }),
		);

		expect(deriveStep(0, 1500)).not.toBe(1);
		expect(query.fields?.[0]?.bucketCount).toBe(DENSE_BUCKET_COUNT);
	});

	it('gives a coarse field exactly one bucket per grid position', () => {
		// A 0-10 field on an integer grid: 11 positions, 11 bars. Any finer count straddles them into a
		// comb, which is the failure `sliderBucketCount` exists to prevent — and the reason this query
		// asks the corpus at all rather than defaulting.
		const query = buildConfigBundleQuery(
			config({ config: { max: 10, min: 0 }, field: 'pageCount', id: 'page-count', type: 'RangeRule' }),
			stubVocabulary({ numericValueStep: () => 1 }),
		);

		expect(query.fields?.[0]?.bucketCount).toBe(11);
	});

	it('carries the corpus-derived bounds rather than the declared ones', () => {
		// The config declares the slider's EXTENT; the corpus decides what is actually reachable. Using
		// the declared bounds here would shade the whole track as available.
		const query = buildConfigBundleQuery(
			config({ config: { max: 1500, min: 0 }, field: 'pageCount', id: 'page-count', type: 'RangeRule' }),
			stubVocabulary({ numericBounds: () => ({ max: 900, min: 100 }) }),
		);

		expect(query.fields?.[0]).toMatchObject({ baselineMax: 900, baselineMin: 100 });
	});
});

describe('rules the query skips', () => {
	it.each([
		['BooleanRule'],
		['ExistsRule'],
		['TextSearchRule'],
		['FuzzySearchRule'],
		['RegexRule'],
	])('produces no entry for a %s', (type) => {
		// Deliberate: none of these is expressible as a chip-group or range candidate. Skipping them is
		// what "no predictive data for this control" means, and the hooks handle it as all-enabled.
		const query = buildConfigBundleQuery(config({ id: 'rule', type }), stubVocabulary());

		expect(query.chipGroups).toEqual([]);
		expect(query.fields).toEqual([]);
	});

	it('skips a rule whose field is not a plain string', () => {
		// Function and array-path fields cannot cross the wire — the query is JSON for the server tier
		// and structured-cloned for the worker. Including one would throw at the boundary rather than
		// here, which is a far worse place to find out.
		const query = buildConfigBundleQuery(
			config({ field: ['nested', 'path'], id: 'genre', type: 'InSetRule' }),
			stubVocabulary({ distinctStrings: () => ['fantasy']}),
		);

		expect(query.chipGroups).toEqual([]);
	});

	it('keeps going after skipping one rule', () => {
		// `continue`, not `return`. An early exit would silently drop every facet declared after the
		// first non-string field.
		const query = buildConfigBundleQuery(
			config(
				// A NUMBER, not `undefined` — the helper's `field = 'genre'` default fires on undefined,
				// which would quietly hand this rule a valid field and defeat the test.
				{ field: 42, id: 'skipped', type: 'InSetRule' },
				{ field: 'genre', id: 'genre', type: 'InSetRule' },
			),
			stubVocabulary({ distinctStrings: () => ['fantasy']}),
		);

		expect(query.chipGroups?.map((group) => group.ruleId)).toEqual(['genre']);
	});
});

describe('whole-config shape', () => {
	it('returns empty collections for a config with no rules', () => {
		// The neutral boot state. Returning undefined instead would make the consuming hooks treat it
		// as "not queried" rather than "queried, nothing to report" — same render, different meaning.
		expect(buildConfigBundleQuery(config(), stubVocabulary())).toEqual({ chipGroups: [], fields: []});
	});

	it('handles a mixed config, preserving declaration order within each collection', () => {
		const query = buildConfigBundleQuery(
			config(
				{ field: 'genre', id: 'genre', type: 'InSetRule' },
				{ config: { max: 5, min: 0 }, field: 'rating', id: 'rating', type: 'RangeRule' },
				{ field: 'inPrint', id: 'in-print', type: 'BooleanRule' },
				{ field: 'language', id: 'language', type: 'InSetRule' },
			),
			stubVocabulary(),
		);

		expect(query.chipGroups?.map((group) => group.ruleId)).toEqual(['genre', 'language']);
		expect(query.fields?.map((field) => field.ruleId)).toEqual(['rating']);
	});
});
