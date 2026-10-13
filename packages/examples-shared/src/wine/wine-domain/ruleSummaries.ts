/**
 * `wine-domain/ruleSummaries` — active wine rules → removable chip summaries.
 *
 * @remarks
 * The wine counterpart to `books-domain/ruleSummaries`, and framework-neutral for the same reason:
 * every vertical, server-backed routes included, renders the same "active filters" strip, so a
 * defect here is a defect in every vertical at once and none of the per-vertical e2e specs would
 * localize it.
 *
 * **The chips are the only way OUT of a filter state.** A rule that produces no summary is a filter
 * the user cannot see and cannot remove — the results are narrowed by something invisible. So the
 * `null` returns matter more than the formatting: a summary that appears when a rule is not
 * constraining anything shows a chip that does nothing, but a summary that fails to appear when the
 * rule IS constraining hides an active filter and makes the count look wrong for no visible reason.
 *
 * @packageDocumentation
 */

import {
	type FilterRule,
	FuzzySearchRule,
	InSetofSetsRule,
	InSetRule,
	NumericComparisonRule,
	RangeRule,
	type RuleId,
	ValueRule,
} from '@filter-enginez/core';

import type { FilterSummary } from '../../summaries/ruleSummary.js';

import { formatVintageRange } from './vintage.js';

/**
 * Synthetic chip id for expression mode. Not a real rule id — no such rule exists — so the remove
 * handler special-cases it and exits expression mode instead of dropping a rule.
 */
export const SMART_FILTER_CHIP_ID = '__smart-filter__';

/** The single chip shown while a smart-filter preset is driving the results. */
export const SMART_FILTER_SUMMARY: WineFilterSummary = {
	label: 'Smart filter',
	ruleId: SMART_FILTER_CHIP_ID,
	value: 'active',
};

/** One removable chip. */
export interface WineFilterSummary {
	/** Human label for the facet. */
	readonly label: string;
	/** The rule id, so a remove handler knows what to drop. */
	readonly ruleId: string;
	/** Human rendering of what the rule is constraining. */
	readonly value: string;
}

/** Facet id → human label. Partial by design; an unmapped id falls back to the id itself. */
const LABELS: Record<string, string> = {
	abv: 'ABV',
	body: 'Body',
	color: 'Color',
	'color-value': 'Exact color',
	notes: 'Tasting notes',
	origin: 'Origin',
	points: 'Points',
	'points-compare': 'Score',
	price: 'Price',
	sweetness: 'Sweetness',
	varietal: 'Varietal',
	vintage: 'Vintage',
	winery: 'Winery',
};

/**
 * Per-field value formatters for the range facets.
 *
 * @remarks
 * No `vintage` entry: it is declared an `InSetRule` and every vertical commits one, so a
 * `RangeRule` under that id cannot occur.
 */
const RANGE_FORMATTERS: Record<string, (value: number) => string> = {
	abv: (value) => `${value.toFixed(1)}%`,
	points: (value) => `${Math.round(value)} pts`,
	price: (value) => `$${Math.round(value)}`,
};

/**
 * Condense a selection for a chip: one value as-is, two in full, three or more abbreviated.
 *
 * @param values - The selected values.
 * @returns The chip text.
 */
function formatSet(values: readonly unknown[]): string {
	const first = String(values[0]);

	if (values.length === 1) {
		return first;
	}
	if (values.length === 2) {
		return `${first}, ${String(values[1])}`;
	}

	return `${first} (+${values.length - 1} more)`;
}

/**
 * Summarize one rule, or `null` when it is not constraining anything.
 *
 * @param ruleId - The rule's registry id — it selects the label, so it is significant.
 * @param rule - The rule instance.
 * @returns A summary, or `null` for a no-op rule.
 */
function summarize(ruleId: RuleId, rule: FilterRule): WineFilterSummary | null {
	const label = LABELS[ruleId] ?? ruleId;

	if (rule instanceof InSetRule) {
		const values = rule.config.set;

		if (values.length === 0) {
			return null;
		}

		// Vintage is the one set the user picks as a RANGE — its control is a dual-handle slider that
		// materializes the span into years. The generic abbreviation would render a 2015-2022 selection
		// as `2015 (+7 more)`, describing a list nobody chose.
		if (ruleId === 'vintage') {
			return { label, ruleId, value: formatVintageRange(values as readonly number[]) };
		}

		return { label, ruleId, value: formatSet(values) };
	}

	if (rule instanceof InSetofSetsRule) {
		const sets = rule.config.set;

		return sets.length === 0 ? null : { label, ruleId, value: `${sets.length} ${sets.length === 1 ? 'region' : 'regions'}` };
	}

	if (rule instanceof FuzzySearchRule) {
		const query = rule.config.query.trim();

		return query.length === 0 ? null : { label, ruleId, value: `"${query}"` };
	}

	if (rule instanceof ValueRule) {
		const single = String(rule.config);

		return single.length === 0 ? null : { label, ruleId, value: single };
	}

	if (rule instanceof NumericComparisonRule) {
		return { label, ruleId, value: `${rule.config.op} ${rule.config.value}` };
	}

	if (rule instanceof RangeRule) {
		const format = RANGE_FORMATTERS[ruleId] ?? ((value: number): string => value.toLocaleString());
		const { max, min } = rule.config;
		// An unbounded end renders as ∞ rather than as `1.7976931348623157e+308`, which is what a
		// `Number.MAX_VALUE` sentinel would otherwise print into the chip.
		const low = Number.isFinite(min) ? format(min) : '∞';
		const high = Number.isFinite(max) ? format(max) : '∞';

		return { label, ruleId, value: `${low} — ${high}` };
	}

	return null;
}

/**
 * Build the active-filter chips from the engine's registered rules.
 *
 * @param rules - The engine's active rule map. Iteration order is preserved, so the chips render in
 *   registration order rather than jumping around as facets are toggled.
 * @returns One summary per constraining rule.
 */
export function buildWineRuleSummaries(
	rules: ReadonlyMap<RuleId, FilterRule>,
	isExpressionMode = false,
): readonly WineFilterSummary[] {
	// In expression mode a preset drives the results and the flat-map rules are DORMANT. Listing them
	// would show chips for filters that are not applying; listing nothing would claim no filters are
	// active over a visibly narrowed corpus. One synthetic chip is the honest answer, and its × is the
	// way back out.
	if (isExpressionMode) {
		return [SMART_FILTER_SUMMARY];
	}

	const out: WineFilterSummary[] = [];

	for (const [ruleId, rule] of rules) {
		const summary = summarize(ruleId, rule);

		if (summary !== null) {
			out.push(summary);
		}
	}

	return out;
}

/**
 * The same summaries, widened to the shared {@link FilterSummary} contract.
 *
 * @remarks
 * **Why a second function rather than changing the first.** `WineFilterSummary` deliberately has no
 * `isNumeric`; the shared `FilterSummary` requires it. Verticals that hand their own header the wine
 * shape directly need neither the field nor this function — but the two whose results header is
 * typed against the shared contract (Angular and vanilla) both do, and this saves each from writing the
 * same `.map()` with the same explanatory comment attached.
 *
 * **`isNumeric: false` for everything.** Wine chips render in the regular (non-tabular) style in all
 * six verticals; giving price / points / ABV / vintage the tabular-numeral style would change how the
 * chips look everywhere at once, and this is the one line that controls it.
 *
 * @param rules - The engine's active rule map.
 * @param isExpressionMode - Whether a preset is driving the results.
 * @returns One shared-shape summary per constraining rule.
 */
export function buildWineFilterSummaries(
	rules: ReadonlyMap<RuleId, FilterRule>,
	isExpressionMode = false,
): readonly FilterSummary[] {
	return buildWineRuleSummaries(rules, isExpressionMode).map((summary) => ({
		...summary,
		isNumeric: false,
	}));
}
