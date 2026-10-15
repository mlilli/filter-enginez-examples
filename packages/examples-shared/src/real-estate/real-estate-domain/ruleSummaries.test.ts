/**
 * Unit tests for the real-estate active-filter chip summaries.
 *
 * @remarks
 * Mirrors `books-domain/ruleSummaries.test.ts` in approach, and matters more: real estate's summarizer
 * is the widest in the repo (seven rule kinds, including the custom {@link ContainsAllRule}), and
 * all six verticals render their chips from it. A defect here is a defect in six places at once, and
 * no per-vertical e2e would localize it.
 *
 * Real rule instances are constructed rather than stubbed. The module branches on `instanceof`, so a
 * plain object shaped like a rule takes the wrong branch and proves nothing — the test would pass
 * while asserting something that never happens in production.
 *
 * The most valuable cases are the ones returning `null`. A chip that appears for a rule that isn't
 * constraining anything is one the user cannot meaningfully clear; a chip that fails to appear for a
 * rule that IS constraining is worse — the result count then looks wrong for no visible reason.
 *
 * @packageDocumentation
 */

import {
	DateRangeRule,
	type FilterRule,
	GeoProximityRule,
	InSetofSetsRule,
	InSetRule,
	RangeRule,
	TextSearchRule,
} from '@filter-enginez/core';
import { describe, expect, it } from 'vitest';

import { ContainsAllRule } from './ContainsAllRule.js';
import { buildRuleSummaries, type FilterSummary } from './ruleSummaries.js';
import { milesToKm } from './units.js';

/** Field extractor stub — the summarizer never invokes it, but every rule constructor wants one. */
const field = (): undefined => undefined;

/**
 * Summarize a single rule the way the panels do.
 *
 * @param ruleId - The rule's registry id — it selects the label lookup, so it is significant.
 * @param rule - The rule instance.
 * @returns The one summary produced, or `null` when the rule is a no-op.
 */
function summarize(ruleId: string, rule: FilterRule): FilterSummary | null {
	return buildRuleSummaries(new Map([[ruleId, rule]]))[0] ?? null;
}

/** One metro, so the geo suite can prove a named center beats bare coordinates. */
const DENVER = { center: { lat: 39.7392, lng: -104.9903 }, label: 'Greater Denver' };

describe('buildRuleSummaries', () => {
	it('returns an empty array when no rules are active', () => {
		expect(buildRuleSummaries(new Map())).toEqual([]);
	});

	it('emits one summary per constraining rule, dropping the no-ops', () => {
		const summaries = buildRuleSummaries(new Map<string, FilterRule>([
			['property-type', new InSetRule(field, ['condo'])],
			['status', new InSetRule(field, [])],
			['school-district', new InSetRule(field, ['Lakeside'])],
		]));

		expect(summaries.map((summary) => summary.ruleId)).toEqual(['property-type', 'school-district']);
	});

	it('ignores a rule kind it has no branch for', () => {
		// A future rule wired into the panel but not taught to the summarizer should produce no chip
		// rather than a malformed one.
		expect(summarize('mystery', { config: {}} as unknown as FilterRule)).toBeNull();
	});
});

describe('InSet rules', () => {
	it('drops an empty set', () => {
		expect(summarize('property-type', new InSetRule(field, []))).toBeNull();
	});

	it('labels and humanizes a single value', () => {
		expect(summarize('property-type', new InSetRule(field, ['single-family']))).toMatchObject({
			isNumeric: false,
			label: 'Type',
			value: 'single family',
		});
	});

	it('condenses multiple values to "First (+N more)"', () => {
		expect(summarize('status', new InSetRule(field, ['active', 'pending', 'sold']))?.value)
			.toBe('active (+2 more)');
	});

	it('falls back to the rule id when the label is unmapped', () => {
		expect(summarize('unmapped-facet', new InSetRule(field, ['x']))?.label).toBe('unmapped-facet');
	});
});

describe('Range rules', () => {
	it('drops a range sitting at its baseline extent', () => {
		expect(summarize('price', new RangeRule(field, { max: 2_000_000, min: 0 }))).toBeNull();
	});

	it('drops a range whose max is open-ended at a baseline min', () => {
		expect(summarize('bedrooms', new RangeRule(field, { max: Number.POSITIVE_INFINITY, min: 0 }))).toBeNull();
	});

	it('formats price as whole-dollar USD', () => {
		expect(summarize('price', new RangeRule(field, { max: 900_000, min: 250_000 }))).toMatchObject({
			isNumeric: true,
			label: 'Price',
			value: '$250,000 — $900,000',
		});
	});

	it('formats each range rule with its own unit suffix', () => {
		expect(summarize('bedrooms', new RangeRule(field, { max: 4, min: 2 }))?.value).toBe('2 bd — 4 bd');
		expect(summarize('bathrooms', new RangeRule(field, { max: 3, min: 1 }))?.value).toBe('1 ba — 3 ba');
		expect(summarize('lot-size', new RangeRule(field, { max: 2.5, min: 0.5 }))?.value).toBe('0.50 ac — 2.50 ac');
		expect(summarize('year-built', new RangeRule(field, { max: 2020, min: 1990 }))?.value).toBe('1990 — 2020');
	});

	it('renders an open-ended max as ∞ rather than a huge number', () => {
		expect(summarize('square-feet', new RangeRule(field, { max: Number.POSITIVE_INFINITY, min: 2000 }))?.value)
			.toBe('2,000 sqft — ∞');
	});

	it('renders an unbounded min as ∞', () => {
		expect(summarize('year-built', new RangeRule(field, { max: 1990, min: -Number.MAX_VALUE }))?.value)
			.toBe('∞ — 1990');
	});

	it('falls back to a plain localized number for an unmapped range rule', () => {
		expect(summarize('hoa-fee', new RangeRule(field, { max: 5000, min: 100 }))).toMatchObject({
			label: 'hoa-fee',
			value: '100 — 5,000',
		});
	});
});

describe('Location (set-of-sets) rules', () => {
	it('drops an empty selection', () => {
		expect(summarize('location', new InSetofSetsRule<string>('locationId', []))).toBeNull();
	});

	it('counts selected areas, singular', () => {
		expect(summarize('location', new InSetofSetsRule('locationId', [['CO', 'CO/Greater Denver', 'CO/Greater Denver/LoDo']])))
			.toMatchObject({ label: 'Location', value: '1 area' });
	});

	it('counts selected areas, plural — one per committed set, however many ids each holds', () => {
		const rule = new InSetofSetsRule('locationId', [['CO', 'CO/Greater Denver', 'CO/Greater Denver/LoDo'], ['WA/Greater Seattle/Ballard']]);

		expect(summarize('location', rule)?.value).toBe('2 areas');
	});
});

describe('Geo proximity rules', () => {
	it('always produces a chip — an active geo rule is always constraining', () => {
		const rule = new GeoProximityRule(field, { center: { lat: 30, lng: -97 }, radiusKm: milesToKm(15) });

		expect(summarize('geo-proximity', rule)).toMatchObject({
			isNumeric: true,
			label: 'Distance',
		});
	});

	it('converts the engine\'s kilometers back to whole miles for display', () => {
		const rule = new GeoProximityRule(field, { center: { lat: 0, lng: 0 }, radiusKm: 80.4672 });

		expect(summarize('geo-proximity', rule)?.value).toContain('≤ 50 mi');
	});

	it('names the center when it is a known metro', () => {
		// A radius without its center states half a filter — and the center is the half the user chose.
		const rule = new GeoProximityRule(field, { center: DENVER.center, radiusKm: milesToKm(15) });

		expect(buildRuleSummaries(new Map([['geo-proximity', rule]]), { metroCenters: [DENVER]})[0]?.value)
			.toBe('≤ 15 mi of Greater Denver');
	});

	it('falls back to coordinates for a dragged, unnamed center', () => {
		// Four decimals ≈ 11 metres: a real location, short enough for a chip.
		const rule = new GeoProximityRule(field, { center: { lat: 39.5, lng: -105.25 }, radiusKm: milesToKm(5) });

		expect(buildRuleSummaries(new Map([['geo-proximity', rule]]), { metroCenters: [DENVER]})[0]?.value)
			.toBe('≤ 5 mi of 39.5000, -105.2500');
	});

	it('falls back to coordinates when no metro list is supplied at all', () => {
		// The option is optional, so a caller without one still gets a correct — if terser — chip.
		const rule = new GeoProximityRule(field, { center: { lat: 39.5, lng: -105.25 }, radiusKm: milesToKm(5) });

		expect(summarize('geo-proximity', rule)?.value).toBe('≤ 5 mi of 39.5000, -105.2500');
	});
});

describe('Date range rules', () => {
	it('drops a rule with no preset', () => {
		expect(summarize('listed-date', new DateRangeRule(field, {}))).toBeNull();
	});

	it('maps a known preset to its human label', () => {
		expect(summarize('listed-date', new DateRangeRule(field, { preset: 'last-30-days' }))).toMatchObject({
			label: 'Listed',
			value: 'Last 30 days',
		});
	});

	it('falls back to the raw preset key when unmapped', () => {
		// `'all-time'` is a real `DateRangePreset` the panel never offers, so the summarizer has no label
		// for it — exactly the shape of a preset added to core before the label map catches up. The chip
		// should show the raw key rather than render blank.
		expect(summarize('listed-date', new DateRangeRule(field, { preset: 'all-time' }))?.value)
			.toBe('all-time');
	});
});

describe('ContainsAll rules', () => {
	it('drops an empty requirement set', () => {
		expect(summarize('must-have-features', new ContainsAllRule(field, { required: []}))).toBeNull();
	});

	it('counts the required features', () => {
		const rule = new ContainsAllRule(field, { required: ['pool', 'garage', 'fireplace']});

		expect(summarize('must-have-features', rule)).toMatchObject({
			isNumeric: false,
			label: 'Features',
			value: '3 required',
		});
	});
});

describe('Text search rules', () => {
	it('drops an empty query', () => {
		expect(summarize('text-search', new TextSearchRule(field, { mode: 'substring', query: '' }))).toBeNull();
	});

	it('drops a whitespace-only query', () => {
		// Typing then deleting leaves a stray space surprisingly often; a chip reading '" "' is noise.
		expect(summarize('text-search', new TextSearchRule(field, { mode: 'substring', query: '   ' }))).toBeNull();
	});

	it('quotes and trims a real query', () => {
		expect(summarize('text-search', new TextSearchRule(field, { mode: 'substring', query: '  waterfront  ' }))).toMatchObject({
			label: 'Search',
			value: '"waterfront"',
		});
	});
});
