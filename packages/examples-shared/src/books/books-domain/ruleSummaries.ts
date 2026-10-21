/**
 * `books-domain/ruleSummaries` — the engine-coupled `instanceof`-based rule → active-filter-chip
 * summarizer for the books results header (framework-neutral).
 *
 * @remarks
 * Walks the active-rule map and emits one plain {@link FilterSummary} per constraining rule (no-op /
 * permissive rules are dropped), discriminating on `instanceof` against the concrete rule classes
 * exported from `@filter-enginez/core` — live rule instances don't carry a `type` field (that's a
 * serialization artifact), so `instanceof` is the honest discriminator. Covers every rule kind the
 * books panel can wire: Range / InSet / Boolean / Text / Fuzzy / Exists plus the curated Regex /
 * InSetofSets / Bloom rules. Every app's books results header renders its chips from this one
 * summarizer, the React apps included, so a chip reads the same in all six.
 *
 * @packageDocumentation
 */

import {
	BloomMembershipRule,
	BooleanRule,
	ExistsRule,
	type FilterRule,
	FuzzySearchRule,
	InSetofSetsRule,
	InSetRule,
	RangeRule,
	RegexRule,
	type RuleId,
	TextSearchRule,
} from '@filter-enginez/core';

import { type FilterSummary } from '../../summaries/ruleSummary.js';

// Re-exported so `books-domain` import sites can take it from here; the declaration lives in the
// shared summaries module because real estate uses the identical type. See that module.
export { type FilterSummary } from '../../summaries/ruleSummary.js';


// The lookup maps are typed with an explicit `| undefined` value so index access yields
// `T | undefined` even when the app's tsconfig leaves `noUncheckedIndexedAccess` off — the `?? ruleId`
// fallbacks + `!== undefined` guards below are then load-bearing (not "unnecessary conditions").

/** Human labels for the InSet chip rules. */
const IN_SET_LABELS: Record<string, string | undefined> = { format: 'Format', genre: 'Genre', language: 'Language' };

/** Human labels for the boolean rules (chip shown only when the flag is required true). */
const BOOLEAN_LABELS: Record<string, string | undefined> = { 'has-audiobook': 'Audiobook', 'in-print': 'In print' };

/** Human labels for the exists rules (chip shown whenever the rule is registered). */
const EXISTS_LABELS: Record<string, string | undefined> = { 'has-rating': 'Has rating' };

/**
 * Per-rule "natural no-op bounds" for the books range rules — a rule spanning at-or-beyond these doesn't
 * constrain the corpus, so it produces no chip. Matches the canonical config extents used by the React
 * header.
 */
const RANGE_NO_OP_BOUNDS: Record<string, { readonly maxGE: number; readonly minLE: number } | undefined> = {
	'page-count': { maxGE: 1500, minLE: 0 },
	'publication-year': { maxGE: 2025, minLE: 1900 },
	rating: { maxGE: 5, minLE: 0 },
};

/** Per-range formatting + label metadata. */
const RANGE_META: Record<string, { readonly fmt: (n: number) => string; readonly label: string } | undefined> = {
	'page-count': { fmt: (n) => `${n.toFixed(0)} pp`, label: 'Pages' },
	'publication-year': { fmt: (n) => n.toFixed(0), label: 'Year' },
	rating: { fmt: (n) => `${n.toFixed(1)}★`, label: 'Rating' },
};

/**
 * Walk the active-rules map, producing a chip summary for every rule currently constraining the result
 * set (permissive / no-op rules are dropped).
 *
 * @param rules - The engine's active-rule map.
 * @returns One {@link FilterSummary} per constraining rule.
 */
export function buildRuleSummaries(rules: ReadonlyMap<RuleId, FilterRule>): readonly FilterSummary[] {
	const summaries: FilterSummary[] = [];

	for (const [ruleId, rule] of rules) {
		const summary = summarizeRule(ruleId, rule);

		if (summary !== null) {
			summaries.push(summary);
		}
	}

	return summaries;
}

/**
 * Single-rule summarizer. Returns `null` when the rule is a no-op (no constraint).
 *
 * @internal
 */
function summarizeRule(ruleId: RuleId, rule: FilterRule): FilterSummary | null {
	if (rule instanceof RangeRule) {
		return summarizeRangeRule(ruleId, rule);
	}
	if (rule instanceof InSetRule) {
		const set = rule.config.set;

		return set.length === 0
			? null
			: { isNumeric: false, label: IN_SET_LABELS[ruleId] ?? ruleId, ruleId, value: formatSetValue(set) };
	}
	if (rule instanceof BooleanRule) {
		return rule.config === true
			? { isNumeric: false, label: BOOLEAN_LABELS[ruleId] ?? ruleId, ruleId, value: 'Yes' }
			: null;
	}
	if (rule instanceof ExistsRule) {
		return { isNumeric: false, label: EXISTS_LABELS[ruleId] ?? ruleId, ruleId, value: 'Yes' };
	}
	if (rule instanceof TextSearchRule) {
		const query = rule.config.query.trim();

		return query === '' ? null : { isNumeric: false, label: 'Description', ruleId, value: `"${query}"` };
	}
	if (rule instanceof FuzzySearchRule) {
		const query = rule.config.query.trim();

		return query === '' ? null : { isNumeric: false, label: 'Author', ruleId, value: `"${query}"` };
	}

	return summarizeCuratedRule(ruleId, rule);
}

/**
 * Summarizer for the curated demo rules (ISBN regex / genre super-groups / Editor's-picks Bloom).
 * Split out to keep {@link summarizeRule} under the cyclomatic-complexity cap; the labels + values are
 * the ones every app's books header shows.
 *
 * @internal
 */
function summarizeCuratedRule(ruleId: RuleId, rule: FilterRule): FilterSummary | null {
	if (rule instanceof RegexRule) {
		const source = rule.config.pattern.source;

		return source === '' || source === '(?:)'
			? null
			: { isNumeric: false, label: 'ISBN', ruleId, value: `/${source}/` };
	}
	if (rule instanceof InSetofSetsRule) {
		const groupCount = rule.config.set.length;

		return groupCount === 0
			? null
			: { isNumeric: false, label: 'Genre groups', ruleId, value: `${groupCount} group${groupCount === 1 ? '' : 's'}` };
	}
	if (rule instanceof BloomMembershipRule) {
		return { isNumeric: false, label: "Editor's picks", ruleId, value: 'Yes' };
	}

	return null;
}

/**
 * Summarize a `RangeRule` into a chip (or `null` when the range is a baseline no-op).
 *
 * @internal
 */
function summarizeRangeRule(ruleId: RuleId, rule: RangeRule): FilterSummary | null {
	const { max, min } = rule.config;
	const isMaxOpen = !Number.isFinite(max);
	const noOp = RANGE_NO_OP_BOUNDS[ruleId];

	if (noOp !== undefined && min <= noOp.minLE && (max >= noOp.maxGE || isMaxOpen)) {
		return null;
	}
	const known = RANGE_META[ruleId];
	const fmt = known?.fmt ?? ((n: number) => n.toLocaleString());
	const lo = min <= -Number.MAX_VALUE ? '∞' : fmt(min);
	const hi = isMaxOpen ? '∞' : fmt(max);

	return { isNumeric: true, label: known?.label ?? ruleId, ruleId, value: `${lo} — ${hi}` };
}

/**
 * Format a set of selected values for a chip: single value as-is; 2+ condensed to "First (+N more)" so
 * the chip stays compact.
 *
 * @internal
 */
function formatSetValue(set: readonly unknown[]): string {
	/* v8 ignore next 3 -- unreachable via the only caller: `summarizeRule` returns null for an empty
	   set before it ever formats one, so this arm exists purely so the helper is safe if it is reused
	   from a caller without that guard. Kept rather than deleted because returning `''` here is a
	   correct answer, and removing it would make any unguarded caller crash on `set[0]`. */
	if (set.length === 0) {
		return '';
	}
	const first = String(set[0]);

	if (set.length === 1) {
		return first;
	}
	if (set.length === 2) {
		return `${first}, ${String(set[1])}`;
	}

	return `${first} (+${set.length - 1} more)`;
}
