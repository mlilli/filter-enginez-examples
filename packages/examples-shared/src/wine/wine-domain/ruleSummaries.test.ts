/**
 * Tests for the wine active-filter chip summaries.
 *
 * @remarks
 * These chips are the only way OUT of a filter state: without them a user who narrowed to zero results
 * would have to reload. So the `null` returns carry more
 * weight than the formatting: a summary that appears for a rule constraining nothing offers a remove
 * button that does nothing, but a summary that FAILS to appear for a rule that is constraining hides
 * an active filter entirely, and the result count looks wrong for no visible reason.
 *
 * Real rule instances rather than stubs, because the module branches on `instanceof` — a plain object
 * shaped like a rule would fall through to the final `null` and the test would pass while asserting
 * something that never happens in production.
 */

import {
	DateRangeRule,
	type FilterRule,
	FuzzySearchRule,
	inSet,
	InSetofSetsRule,
	InSetRule,
	NumericComparisonRule,
	RangeRule,
	type RuleId,
	ValueRule,
} from '@filter-enginez/core';
import { describe, expect, it } from 'vitest';

import { buildWineRuleSummaries, SMART_FILTER_CHIP_ID, type WineFilterSummary } from './ruleSummaries.js';

/**
 * Summarize a single rule the way the header does.
 *
 * @param ruleId - The rule's id — it selects the label, so it is significant.
 * @param rule - The rule instance.
 * @returns The one summary produced, or `null`.
 */
function summarize(ruleId: string, rule: FilterRule): WineFilterSummary | null {
	return buildWineRuleSummaries(new Map([[ruleId, rule]]))[0] ?? null;
}

describe('buildWineRuleSummaries', () => {
	it('returns nothing for no rules', () => {
		expect(buildWineRuleSummaries(new Map())).toEqual([]);
	});

	it('preserves registration order', () => {
		// The chips render in this order, so it is user-visible. A refactor through an object literal
		// would reorder numeric-looking keys and make the strip reshuffle as facets are toggled.
		const summaries = buildWineRuleSummaries(
			new Map<RuleId, FilterRule>([
				['color', inSet<string>('color', ['red'])],
				['varietal', inSet<string>('varietal', ['Merlot'])],
			]),
		);

		expect(summaries.map((entry) => entry.ruleId)).toEqual(['color', 'varietal']);
	});

	it('drops no-op rules rather than emitting blank chips', () => {
		const summaries = buildWineRuleSummaries(
			new Map<RuleId, FilterRule>([
				['color', new InSetRule('color', [])],
				['varietal', inSet<string>('varietal', ['Merlot'])],
			]),
		);

		expect(summaries.map((entry) => entry.ruleId)).toEqual(['varietal']);
	});
});

describe('set facets', () => {
	it('returns null for an empty set — nothing is constrained', () => {
		expect(summarize('color', new InSetRule('color', []))).toBeNull();
	});

	it.each([
		[['red'], 'red'],
		[['red', 'white'], 'red, white'],
		[['red', 'white', 'rosé'], 'red (+2 more)'],
	])('condenses %j to %s', (values, expected) => {
		expect(summarize('color', new InSetRule('color', values))?.value).toBe(expected);
	});

	it('counts origin regions rather than listing paths', () => {
		// Origin values are full pipe-joined paths; listing two would overflow the chip. The count is
		// what the user can act on, and the × removes all of them together anyway.
		expect(summarize('origin', new InSetofSetsRule('originId', [['a'], ['b']]))?.value).toBe('2 regions');
		expect(summarize('origin', new InSetofSetsRule('originId', [['a']]))?.value).toBe('1 region');
	});

	it('returns null when no region is selected', () => {
		expect(summarize('origin', new InSetofSetsRule('originId', []))).toBeNull();
	});
});

describe('search + comparison facets', () => {
	it('quotes a non-empty fuzzy query', () => {
		expect(summarize('notes', new FuzzySearchRule('description', { query: 'cherry' }))).toMatchObject({
			label: 'Tasting notes',
			value: '"cherry"',
		});
	});

	it.each([[''], ['   ']])('returns null for a blank query (%j)', (query) => {
		// Whitespace-only is the case that matters: a user who typed a space has a rule registered but
		// no constraint, and a chip reading `" "` would be nonsense with a remove button attached.
		expect(summarize('notes', new FuzzySearchRule('description', { query }))).toBeNull();
	});

	it('renders the operator and threshold for a numeric comparison', () => {
		expect(summarize('points-compare', new NumericComparisonRule('points', { op: '>=', value: 90 }))).toMatchObject({
			label: 'Score',
			value: '>= 90',
		});
	});
});

describe('range facets', () => {
	it('formats each field in its own units', () => {
		// No `vintage` case: it is declared an `InSetRule` and every vertical commits one, so a
		// `RangeRule` under that id cannot occur. Its own rendering is asserted under "vintage" below.
		expect(summarize('price', new RangeRule('priceUsd', { max: 80, min: 20 }))?.value).toBe('$20 — $80');
		expect(summarize('abv', new RangeRule('abv', { max: 15, min: 12 }))?.value).toBe('12.0% — 15.0%');
		expect(summarize('points', new RangeRule('points', { max: 96, min: 88 }))?.value).toBe('88 pts — 96 pts');
	});

	it('renders vintage as the RANGE the slider selected, not an abbreviated list', () => {
		// Vintage is the one set whose control is a range: the slider materializes its span into years.
		// The generic set formatter abbreviates at three or more, so this chip read `2015 (+7 more)` —
		// a list nobody picked, for a control that only offers spans.
		const years = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022];

		expect(summarize('vintage', new InSetRule<number>('vintage', years))?.value).toBe('2015 – 2022');
	});

	it('renders a single-year vintage as that year alone', () => {
		expect(summarize('vintage', new InSetRule<number>('vintage', [2019]))?.value).toBe('2019');
	});

	it('drops an empty vintage set — the permissive state is not a constraint', () => {
		// A full-baseline span commits `[]`, so this is what "the user has not narrowed vintage" looks
		// like on the wire. A chip here would claim a filter that excludes nothing.
		expect(summarize('vintage', new InSetRule<number>('vintage', []))).toBeNull();
	});

	it.each([
		['upper', { max: Number.POSITIVE_INFINITY, min: 60 }, '$60 — ∞'],
		['lower', { max: 60, min: Number.NEGATIVE_INFINITY }, '∞ — $60'],
		['both', { max: Number.POSITIVE_INFINITY, min: Number.NEGATIVE_INFINITY }, '∞ — ∞'],
	])('renders an unbounded %s end as ∞', (_label, config, expected) => {
		// BOTH ends need the guard, and asserting only the upper one leaves the lower unprotected — a
		// mutation round removed the `min` check and this test passed. The alternative to ∞ is printing
		// `-Infinity` (or `1.7976931348623157e+308` from a MAX_VALUE sentinel) into a chip.
		expect(summarize('price', new RangeRule('priceUsd', config))?.value).toBe(expected);
	});

	it('falls back to locale formatting for an unknown range', () => {
		expect(summarize('word-count', new RangeRule('wordCount', { max: 90_000, min: 1000 }))).toMatchObject({
			label: 'word-count',
			value: '1,000 — 90,000',
		});
	});
});

describe('labels', () => {
	it('falls back to the rule id when there is no human label', () => {
		// The fallback is load-bearing: an unlabelled rule must still render a REMOVABLE chip rather
		// than an empty-labelled one, or the filter becomes invisible and permanent.
		expect(summarize('unmapped-facet', inSet<string>('whatever', ['x']))?.label).toBe('unmapped-facet');
	});

	it('returns null for a rule type wine does not summarize', () => {
		// The final fallthrough. Deliberately a rule type the wine panel never registers — reaching for
		// an empty InSetRule would exit via that branch instead and prove nothing about this path.
		expect(summarize('published', new DateRangeRule('publishedAt', { end: new Date(1), start: new Date(0) })))
			.toBeNull();
	});
});

describe('expression mode', () => {
	it('returns ONE synthetic chip, whatever rules are registered', () => {
		// In expression mode a preset drives the results and the flat rules are dormant. Listing them
		// would show chips for filters that are not applying; listing nothing would claim no filters are
		// active over a visibly narrowed corpus. Neither is honest.
		const summaries = buildWineRuleSummaries(
			new Map<RuleId, FilterRule>([['color', inSet<string>('color', ['red'])]]),
			true,
		);

		expect(summaries).toEqual([{ label: 'Smart filter', ruleId: SMART_FILTER_CHIP_ID, value: 'active' }]);
	});

	it('returns the synthetic chip even with NO rules registered', () => {
		// Applying a preset clears every flat rule, so the map is empty; without the synthetic chip the
		// header would read "No filters active" while the corpus is plainly filtered.
		expect(buildWineRuleSummaries(new Map(), true)).toHaveLength(1);
	});

	it('uses an id that is not a real rule', () => {
		// The remove handler branches on it to exit expression mode rather than dropping a rule. A
		// collision with a real facet id would make that × silently clear the wrong thing.
		expect(SMART_FILTER_CHIP_ID.startsWith('__')).toBe(true);
	});

	it('lists the real rules when NOT in expression mode', () => {
		const summaries = buildWineRuleSummaries(
			new Map<RuleId, FilterRule>([['color', inSet<string>('color', ['red'])]]),
			false,
		);

		expect(summaries.map((entry) => entry.ruleId)).toEqual(['color']);
	});
});

describe('exact-color ValueRule', () => {
	it('summarizes the selected color', () => {
		// Added with the facet itself. A rule with no summary produces no chip, and the chip strip is the
		// only way to remove a filter — so the color would be invisible AND permanent.
		expect(summarize('color-value', new ValueRule<string>('color', 'red'))).toMatchObject({
			label: 'Exact color',
			value: 'red',
		});
	});

	it('returns null for an empty value', () => {
		expect(summarize('color-value', new ValueRule<string>('color', ''))).toBeNull();
	});
});
