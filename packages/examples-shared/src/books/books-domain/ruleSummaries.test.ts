/**
 * Unit tests for the active-filter chip summaries.
 *
 * @remarks
 * The module is framework-neutral by design: React, Vue, Svelte, Angular and vanilla all render their
 * "active filters" strip from `buildRuleSummaries`, so a defect here is a defect in every vertical at
 * once, and none of the per-vertical e2e specs would localize it.
 *
 * Real rule instances are constructed rather than stubbed. The module branches on `instanceof`, so a
 * plain object shaped like a rule would take the wrong path and prove nothing — the test would pass
 * while asserting something that never happens in production.
 *
 * The most valuable cases here are the ones that return `null`. A summary that appears when the rule
 * is not actually constraining anything shows the user a chip they cannot act on; a summary that fails
 * to appear when the rule IS constraining hides an active filter, which is worse — it makes the result
 * count look wrong for no visible reason.
 */

import {
	BloomFilter,
	BloomMembershipRule,
	BooleanRule,
	DateRangeRule,
	ExistsRule,
	type FilterRule,
	FuzzySearchRule,
	InSetofSetsRule,
	InSetRule,
	NumericComparisonRule,
	RangeRule,
	RegexRule,
	type RuleId,
	TextSearchRule,
} from '@filter-enginez/core';
import { describe, expect, it } from 'vitest';

import { buildRuleSummaries, type FilterSummary } from './ruleSummaries.js';

/**
 * Summarize a single rule the way the panels do.
 *
 * @param ruleId - The rule's registry id — it selects the label lookup, so it is significant.
 * @param rule - The rule instance.
 * @returns The one summary produced, or `null` when the rule is a no-op.
 */
function summarize(ruleId: string, rule: FilterRule): FilterSummary | null {
	const summaries = buildRuleSummaries(new Map([[ruleId, rule]]));

	return summaries[0] ?? null;
}

/**
 * A Bloom filter containing the supplied ids.
 *
 * @param ids - Members to add.
 * @returns A populated filter.
 */
function bloomOf(ids: readonly string[]): BloomFilter {
	const filter = BloomFilter.forCapacity(Math.max(1, ids.length), 0.001);

	for (const id of ids) {
		filter.add(id);
	}

	return filter;
}

describe('buildRuleSummaries', () => {
	it('returns an empty list for no rules', () => {
		expect(buildRuleSummaries(new Map())).toEqual([]);
	});

	it('preserves the map\'s iteration order', () => {
		// The chips render in this order, so it is user-visible. Map iteration is insertion-ordered;
		// a refactor through an object literal would silently reorder numeric-looking keys.
		const summaries = buildRuleSummaries(
			new Map<RuleId, FilterRule>([
				['genre', new InSetRule('genre', ['fantasy'])],
				['in-print', new BooleanRule('inPrint', true)],
				['language', new InSetRule('language', ['en'])],
			]),
		);

		expect(summaries.map((entry) => entry.ruleId)).toEqual(['genre', 'in-print', 'language']);
	});

	it('drops no-op rules from a mixed map rather than emitting blank chips', () => {
		const summaries = buildRuleSummaries(
			new Map<RuleId, FilterRule>([
				['genre', new InSetRule('genre', [])],
				['in-print', new BooleanRule('inPrint', true)],
			]),
		);

		expect(summaries.map((entry) => entry.ruleId)).toEqual(['in-print']);
	});
});

describe('InSetRule summaries', () => {
	it('returns null for an empty set — nothing is being constrained', () => {
		expect(summarize('genre', new InSetRule('genre', []))).toBeNull();
	});

	it('shows a single value as-is', () => {
		expect(summarize('genre', new InSetRule('genre', ['fantasy']))).toMatchObject({
			isNumeric: false,
			label: 'Genre',
			value: 'fantasy',
		});
	});

	it('lists exactly two values in full', () => {
		// The 2-value case is its own branch: it reads better than "fantasy (+1 more)" and it is the
		// boundary where the condensing rule starts.
		expect(summarize('genre', new InSetRule('genre', ['fantasy', 'mystery']))?.value).toBe('fantasy, mystery');
	});

	it('condenses three or more values', () => {
		expect(summarize('genre', new InSetRule('genre', ['fantasy', 'mystery', 'romance']))?.value)
			.toBe('fantasy (+2 more)');
	});

	it('falls back to the ruleId when the id has no human label', () => {
		// The `?? ruleId` fallbacks are load-bearing: an unlabelled rule must still render a chip the
		// user can remove, rather than an empty-labelled one.
		expect(summarize('unmapped-facet', new InSetRule('whatever', ['x']))?.label).toBe('unmapped-facet');
	});

	it('stringifies non-string set members', () => {
		expect(summarize('publication-year', new InSetRule('publicationYear', [1999]))?.value).toBe('1999');
	});
});

describe('BooleanRule summaries', () => {
	it('emits a chip only when the flag is required true', () => {
		expect(summarize('in-print', new BooleanRule('inPrint', true))).toMatchObject({ label: 'In print', value: 'Yes' });
	});

	it('falls back to the ruleId when the boolean has no human label', () => {
		// Same `?? ruleId` fallback as the InSet case, on a different lookup table. Both tables are
		// partial by design, so an unmapped id must still produce a removable chip.
		expect(summarize('unmapped-flag', new BooleanRule('whatever', true))?.label).toBe('unmapped-flag');
	});

	it.each([
		['false', false],
		['undefined', undefined],
	])('returns null when the flag is %s', (_label, value) => {
		// `false` matters as much as `undefined`: "in print = false" is a real filter state in the
		// engine, but this panel deliberately shows no chip for it.
		expect(summarize('in-print', new BooleanRule('inPrint', value))).toBeNull();
	});
});

describe('ExistsRule summaries', () => {
	it('falls back to the ruleId when the exists rule has no human label', () => {
		expect(summarize('unmapped-exists', new ExistsRule('whatever'))?.label).toBe('unmapped-exists');
	});

	it('always emits a chip — registration IS the constraint', () => {
		expect(summarize('has-rating', new ExistsRule('averageRating'))).toMatchObject({
			label: 'Has rating',
			value: 'Yes',
		});
	});
});

describe('text + fuzzy search summaries', () => {
	it.each([
		['TextSearchRule', 'Description', (query: string): FilterRule => new TextSearchRule('description', { mode: 'substring', query })],
		['FuzzySearchRule', 'Author', (query: string): FilterRule => new FuzzySearchRule('author', { query })],
	])('%s quotes a non-empty query under the %s label', (_name, label, make) => {
		expect(summarize('search', make('dune'))).toMatchObject({ label, value: '"dune"' });
	});

	it.each([
		['TextSearchRule', (query: string): FilterRule => new TextSearchRule('description', { mode: 'substring', query })],
		['FuzzySearchRule', (query: string): FilterRule => new FuzzySearchRule('author', { query })],
	])('%s returns null for an empty or whitespace-only query', (_name, make) => {
		// Whitespace-only is the case that matters: a user who typed a space and deleted the word has
		// a rule registered but no constraint, and a chip reading `" "` would be nonsense.
		expect(summarize('search', make(''))).toBeNull();
		expect(summarize('search', make('   '))).toBeNull();
	});

	it('trims the query before quoting it', () => {
		expect(summarize('search', new TextSearchRule('description', { mode: 'substring', query: '  dune  ' }))?.value).toBe('"dune"');
	});
});

describe('curated rule summaries', () => {
	it('shows a RegexRule pattern between slashes', () => {
		expect(summarize('isbn', new RegexRule('isbn', { pattern: /^978/ }))).toMatchObject({
			label: 'ISBN',
			value: '/^978/',
		});
	});

	it.each([
		['an empty source', new RegExp('')],
		['the empty-group source (?:)', /(?:)/],
	])('returns null for a RegexRule with %s', (_label, pattern) => {
		// `new RegExp('')` stringifies its source as `(?:)`, so both spellings of "no pattern" have to
		// be recognized — checking only one leaves a chip reading `/(?:)/` on screen.
		expect(summarize('isbn', new RegexRule('isbn', { pattern }))).toBeNull();
	});

	it('counts genre super-groups, pluralizing correctly', () => {
		expect(summarize('genre-groups', new InSetofSetsRule('genre', [['fantasy']]))?.value).toBe('1 group');
		expect(summarize('genre-groups', new InSetofSetsRule('genre', [['fantasy'], ['mystery']]))?.value).toBe('2 groups');
	});

	it('returns null when no super-group is selected', () => {
		expect(summarize('genre-groups', new InSetofSetsRule('genre', []))).toBeNull();
	});

	it('shows the Editor\'s-picks Bloom membership as a plain Yes', () => {
		expect(summarize('editors-picks', new BloomMembershipRule('id', bloomOf(['b1'])))).toMatchObject({
			label: "Editor's picks",
			value: 'Yes',
		});
	});

	it.each([
		['NumericComparisonRule', new NumericComparisonRule('pageCount', { op: '>', value: 100 })],
		['DateRangeRule', new DateRangeRule('publishedAt', { end: new Date(1), start: new Date(0) })],
	])('returns null for %s — a rule type it does not summarize', (_name, rule) => {
		// The final fallthrough in summarizeCuratedRule. These must be rule types the module genuinely
		// does not handle: reaching for an InSetRule with an empty set would exit via the InSetRule
		// branch instead and prove nothing about this path.
		//
		// The behavior is deliberate rather than an omission — the books panel registers only the rule
		// types it has chips for, and an unrecognized rule must produce NO chip rather than a
		// malformed one the user cannot interpret or remove.
		expect(summarize('no-chip-for-this', rule)).toBeNull();
	});
});

describe('RangeRule summaries', () => {
	it.each([
		['page-count', { max: 1500, min: 0 }],
		['publication-year', { max: 2025, min: 1900 }],
		['rating', { max: 5, min: 0 }],
	])('returns null for %s at its full baseline extent', (ruleId, config) => {
		// A slider dragged back to both ends constrains nothing. Emitting a chip there is the bug this
		// guards: the user sees an "active filter" they cannot remove by moving the slider.
		expect(summarize(ruleId, new RangeRule(ruleId, config))).toBeNull();
	});

	it('returns null when the range is WIDER than the baseline', () => {
		expect(summarize('rating', new RangeRule('rating', { max: 99, min: -99 }))).toBeNull();
	});

	it('treats an infinite max as no-op when the min is also at baseline', () => {
		expect(summarize('page-count', new RangeRule('pageCount', { max: Number.POSITIVE_INFINITY, min: 0 }))).toBeNull();
	});

	it('emits a chip as soon as EITHER end moves inward', () => {
		expect(summarize('rating', new RangeRule('rating', { max: 5, min: 4 }))).toMatchObject({
			isNumeric: true,
			label: 'Rating',
			value: '4.0★ — 5.0★',
		});
		expect(summarize('rating', new RangeRule('rating', { max: 4, min: 0 }))?.value).toBe('0.0★ — 4.0★');
	});

	it('formats each known range with its own units', () => {
		expect(summarize('page-count', new RangeRule('pageCount', { max: 500, min: 100 }))?.value).toBe('100 pp — 500 pp');
		expect(summarize('publication-year', new RangeRule('publicationYear', { max: 2010, min: 2000 }))?.value)
			.toBe('2000 — 2010');
	});

	it('renders an open upper bound as ∞', () => {
		expect(summarize('rating', new RangeRule('rating', { max: Number.POSITIVE_INFINITY, min: 4 }))?.value)
			.toBe('4.0★ — ∞');
	});

	it('renders an open lower bound as ∞', () => {
		expect(summarize('rating', new RangeRule('rating', { max: 4, min: -Number.MAX_VALUE }))?.value).toBe('∞ — 4.0★');
	});

	it('falls back to locale formatting and the ruleId for an unknown range', () => {
		// No entry in either lookup: no no-op bounds (so it always emits) and no formatter.
		expect(summarize('word-count', new RangeRule('wordCount', { max: 90_000, min: 1000 }))).toMatchObject({
			isNumeric: true,
			label: 'word-count',
			value: '1,000 — 90,000',
		});
	});
});
