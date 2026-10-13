/**
 * Tests for the framework-neutral bundle readers.
 *
 * @remarks
 * These are the React-free twins of the `filter-bundle` hooks — the same reads, exposed as plain
 * functions so Vue, Svelte and vanilla can use them without React. That makes DIVERGENCE the risk
 * worth guarding: if these and the hooks disagreed about what a missing group means, the same corpus
 * would render different disable states in different verticals, which is precisely the claim the
 * six demo apps exist to make.
 *
 * So the empty/missing cases are asserted in the same terms as `bundleHooks.test.tsx`: a null bundle
 * and an absent rule both mean "no information", never "everything unavailable".
 */

import { createFilterEngine, type FilterBundle, type FilterBundleQuery, type FilterRule, inSet } from '@filter-enginez/core';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { describe, expect, it } from 'vitest';

import {
	buildBooksBundleQuery,
	chipExclusionMap,
	fieldBounds,
	safeApplyBundle,
	safeApplyBundleFromCore,
	toggleWouldBeEmpty,
} from './bundle.js';

const rows = [
	{ id: 'a', kind: 'alpha', size: 10 },
	{ id: 'b', kind: 'beta', size: 20 },
	{ id: 'c', kind: 'alpha', size: 30 },
];

type Row = (typeof rows)[number];

/** A bundle carrying one chip group and one field. */
function makeBundle(overrides: Partial<FilterBundle> = {}): FilterBundle {
	return {
		chipGroups: [{
			candidates: [
				{ projectedCount: 2, value: 'alpha', wouldBeEmpty: false },
				{ projectedCount: 0, value: 'beta', wouldBeEmpty: true },
			],
			ruleId: 'kind',
		}],
		fields: [{ bounds: { max: 30, min: 10 }, fieldKey: 'size', histogram: { bucketEdges: [], counts: []}, ruleId: 'size' }],
		resultCount: 2,
		resultIndices: new Uint32Array([0, 2]),
		...overrides,
	} as unknown as FilterBundle;
}

describe('buildBooksBundleQuery', () => {
	const BASELINES = {
		pageCount: { max: 1200, min: 20 },
		publicationYear: { max: 2025, min: 1950 },
		rating: { max: 5, min: 1 },
	};
	const VOCABULARIES = { formats: ['ebook'], genres: ['sci-fi'], languages: ['en']};
	const query = buildBooksBundleQuery(BASELINES, VOCABULARIES);

	it('queries the three flat chip groups plus the curated super-group tree', () => {
		// The super-group entry is the one that cannot be derived from a vocabulary: it is
		// `inSetOfSets`, so each candidate carries the full genre set selecting it would activate.
		expect(query.chipGroups?.map((group) => [group.ruleId, group.kind])).toEqual([
			['genre', 'inSet'],
			['format', 'inSet'],
			['language', 'inSet'],
			['genre-groups', 'inSetOfSets'],
		]);
		expect(query.chipGroups?.[3]?.candidates.length).toBeGreaterThan(0);
	});

	it('maps each slider rule id to its corpus field key', () => {
		// `rating` maps to `averageRating` and `page-count` to `pageCount` — the rule ids and the
		// corpus fields disagree, and a query naming the rule id returns an empty histogram plus null
		// bounds for a field that is fully populated.
		expect(query.fields?.map((field) => [field.ruleId, field.fieldKey])).toEqual([
			['publication-year', 'publicationYear'],
			['rating', 'averageRating'],
			['page-count', 'pageCount'],
		]);
	});

	it('passes each baseline through, which is what aligns the bars with the thumbs', () => {
		// Omitting these makes the engine bucket the FILTERED range instead, and the bars drift out
		// from under the handles as the user filters.
		const year = query.fields?.find((field) => field.ruleId === 'publication-year');

		expect(year?.baselineMin).toBe(1950);
		expect(year?.baselineMax).toBe(2025);
	});

	it('derives a bucket count per field from its baseline and value grid', () => {
		// Literals, not a re-read of the same table the builder used — and all three land somewhere
		// different, which is the point of deriving them:
		//   publication-year  1950–2025 at 1    → 76 years, under the cap → one bar per year
		//   rating            1.0–5.0 at 0.1    → 41 tenths → one bar per achievable rating
		//   page-count        20–1200 at 1      → 1,181 positions → capped at the dense 84
		const byRule = new Map(query.fields?.map((field) => [field.ruleId, field.bucketCount]));

		expect(byRule.get('publication-year')).toBe(76);
		expect(byRule.get('rating')).toBe(41);
		expect(byRule.get('page-count')).toBe(84);
	});

	it('asks for a bucket count on EVERY field', () => {
		// Without one, a field silently takes the engine's 12-bucket default — a count nothing in the
		// repo chose, and one that flattens a skewed distribution into a dozen fat columns.
		expect(query.fields?.every((field) => field.bucketCount !== undefined)).toBe(true);
	});
});

describe('safeApplyBundleFromCore', () => {
	it('returns the bundle for a valid query', () => {
		const core = createFilterEngine<Row>({ sourceData: rows });
		const query: FilterBundleQuery = {
			chipGroups: [{ candidates: ['alpha', 'beta'], field: 'kind', kind: 'inSet', ruleId: 'kind' }],
		};

		expect(safeApplyBundleFromCore(core, query)?.chipGroups).toHaveLength(1);
	});

	it('returns null instead of throwing when the query is malformed', () => {
		// The "safe" in the name. Predictive disable is an ENHANCEMENT — if computing it fails, the
		// panel must fall back to all-enabled and keep filtering, not take the route down with it.
		const core = createFilterEngine<Row>({ sourceData: rows });
		const bogus = { chipGroups: [{ candidates: null, field: 42, kind: 'nope' }]} as unknown as FilterBundleQuery;

		expect(safeApplyBundleFromCore(core, bogus)).toBeNull();
	});
});

describe('safeApplyBundle', () => {
	it('reads through the reactive surface to the same core', () => {
		// The two entry points must not diverge: the reactive verticals call this one, the framework-less
		// vertical calls `safeApplyBundleFromCore` on the bare engine, and both render the same panel.
		// Asserting them against each other is what keeps that true.
		const core = createFilterEngine<Row>({ sourceData: rows });
		const engine = createSignalsEngine(core);
		const query: FilterBundleQuery = {
			chipGroups: [{ candidates: ['alpha', 'beta'], field: 'kind', kind: 'inSet', ruleId: 'kind' }],
		};

		expect(safeApplyBundle(engine, query)?.chipGroups).toEqual(safeApplyBundleFromCore(core, query)?.chipGroups);
	});

	it('returns null for a malformed query rather than throwing', () => {
		const engine = createSignalsEngine(createFilterEngine<Row>({ sourceData: rows }));
		const bogus = { chipGroups: [{ candidates: null, field: 42, kind: 'nope' }]} as unknown as FilterBundleQuery;

		expect(safeApplyBundle(engine, bogus)).toBeNull();
	});
});

describe('chipExclusionMap', () => {
	it('maps candidates to their exclusion data', () => {
		const map = chipExclusionMap(makeBundle(), 'kind');

		expect(map.get('alpha')).toEqual({ projectedCount: 2, wouldBeEmpty: false });
		expect(map.get('beta')).toEqual({ projectedCount: 0, wouldBeEmpty: true });
	});

	it('returns an empty map for a null bundle', () => {
		// Matches the React hook exactly: no bundle yet means no information, which the controls read
		// as all-enabled. Anything else flashes every chip disabled before the first bundle lands.
		expect(chipExclusionMap(null, 'kind').size).toBe(0);
	});

	it('returns an empty map for a rule the bundle does not carry', () => {
		expect(chipExclusionMap(makeBundle(), 'not-queried').size).toBe(0);
	});

	it('returns an empty map for a group with no candidates', () => {
		const bundle = makeBundle({ chipGroups: [{ candidates: [], ruleId: 'kind' }]});

		expect(chipExclusionMap(bundle, 'kind').size).toBe(0);
	});
});

describe('fieldBounds', () => {
	it('returns the filtered-except-self bounds', () => {
		expect(fieldBounds(makeBundle(), 'size')).toEqual({ max: 30, min: 10 });
	});

	it('returns null for a null bundle', () => {
		expect(fieldBounds(null, 'size')).toBeNull();
	});

	it('returns null for a field the bundle does not carry', () => {
		expect(fieldBounds(makeBundle(), 'not-queried')).toBeNull();
	});

	it.each([
		['min', { max: 30, min: null }],
		['max', { max: null, min: 10 }],
		['both', { max: null, min: null }],
	])('returns null when %s is null', (_label, bounds) => {
		// Null bounds mean no current result occupies the field. Coercing to zeros would dim the whole
		// track and read as "nothing available anywhere" instead of "fall back to the baseline".
		const bundle = makeBundle({
			fields: [{ bounds, fieldKey: 'size', histogram: { bucketEdges: [], counts: []}, ruleId: 'size' }],
		} as unknown as Partial<FilterBundle>);

		expect(fieldBounds(bundle, 'size')).toBeNull();
	});

	it('preserves a zero bound rather than treating it as absent', () => {
		// `=== null` and not a truthiness check: 0 is a legitimate bound, and a falsy test would drop
		// the whole range for any field whose filtered minimum happens to be zero.
		const bundle = makeBundle({
			fields: [{ bounds: { max: 0, min: 0 }, fieldKey: 'size', histogram: { bucketEdges: [], counts: []}, ruleId: 'size' }],
		} as unknown as Partial<FilterBundle>);

		expect(fieldBounds(bundle, 'size')).toEqual({ max: 0, min: 0 });
	});
});

describe('toggleWouldBeEmpty', () => {
	it('is false while any result passes the candidate rule', () => {
		expect(toggleWouldBeEmpty(rows, inSet<string>('kind', ['alpha']) as unknown as FilterRule)).toBe(false);
	});

	it('is true when no result passes it', () => {
		expect(toggleWouldBeEmpty(rows, inSet<string>('kind', ['nonexistent']) as unknown as FilterRule)).toBe(true);
	});

	it('is true for an empty result set', () => {
		// Nothing left to keep, so every toggle is a dead end. Reporting false here would offer toggles
		// that lead from zero results to zero results.
		expect(toggleWouldBeEmpty([], inSet<string>('kind', ['alpha']) as unknown as FilterRule)).toBe(true);
	});

	it('needs only ONE passing result, not all of them', () => {
		// `some`, not `every`. With `every`, a toggle matching two of three results would report as
		// empty and be disabled — hiding a filter that would have worked.
		const mixed = [rows[0], rows[1]] as Row[];

		expect(toggleWouldBeEmpty(mixed, inSet<string>('kind', ['alpha']) as unknown as FilterRule)).toBe(false);
	});
});
