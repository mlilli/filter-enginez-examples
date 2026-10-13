/**
 * `<BooksResultsHeader />` — the strip between the filter sidebar and the books result grid (plain /
 * signals-only).
 *
 * @remarks
 * The signals-surface sibling of the RTK `<BooksResultsHeader />` — same container/view split and
 * the same `instanceof`-based rule→chip summarizer, but every datum reads from the signals adapter
 * (`useResultCount`, `useActiveRules`) instead of a Redux mirror, and clear-all calls
 * `engine.core.clearRules()` directly (there's no forwarding middleware). The summarizer helpers are
 * identical to the RTK app's.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { BloomMembershipRule, BooleanRule, ExistsRule, type FilterRule, FuzzySearchRule, InSetofSetsRule, InSetRule, RangeRule, RegexRule, type RuleId, TextSearchRule } from '@filter-enginez/core';
import { commitFilterMutation, getIsEngineBusy, markUserAction, subscribeEngineBusy } from '@filter-enginez/examples-shared/books';
import { useActiveRules, useFilterEngine, useResultCount } from '@filter-enginez/react-signals';
import { type FilterSummary, ResultsHeaderView } from '@filter-enginez/react-ui';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Top-level books results header container.
 */
export const BooksResultsHeader = (): React.ReactElement => {
	const engine = useFilterEngine<Book>();
	const activeRules = useActiveRules();
	const resultCount = useResultCount();
	const totalCount = engine.core.getSourceData().length;

	const isFetching = useSyncExternalStore(subscribeEngineBusy, getIsEngineBusy, getIsEngineBusy);

	const summaries = useMemo<readonly FilterSummary[]>(
		() => buildRuleSummaries(activeRules),
		[activeRules],
	);

	const handleRemoveRule = useCallback((ruleId: string): void => {
		commitFilterMutation({
			callEngine: () => engine.core.removeRule(ruleId),
			markBusy: markUserAction,
		});
	}, [engine]);

	const handleClearAll = useCallback((): void => {
		// `clearRules()` records a single `RULES_CLEARED` devtools entry instead of N `removeRule`s.
		commitFilterMutation({
			callEngine: () => engine.core.clearRules(),
			markBusy: markUserAction,
		});
	}, [engine]);

	return (
		<ResultsHeaderView
			summaries={summaries}
			resultCount={resultCount}
			totalCount={totalCount}
			isFetching={isFetching}
			onRemoveRule={handleRemoveRule}
			onClearAll={handleClearAll}
		/>
	);
};

// ─── Rule summary helpers (engine-coupled — must stay in the app container) ───

/**
 * Per-rule chip summary as the engine sees it.
 *
 * @internal
 */
interface RuleSummary {
	readonly isNumeric: boolean;
	readonly label: string;
	readonly ruleId: RuleId;
	readonly value: string;
}

/** Human labels for the InSet chip rules. */
const IN_SET_LABELS: Record<string, string> = { format: 'Format', genre: 'Genre', language: 'Language' };

/** Human labels for the boolean rules (chip shown only when the flag is required true). */
const BOOLEAN_LABELS: Record<string, string> = { 'has-audiobook': 'Audiobook', 'in-print': 'In print' };

/** Human labels for the exists rules (chip shown whenever the rule is registered). */
const EXISTS_LABELS: Record<string, string> = { 'has-rating': 'Has rating' };

/**
 * Per-rule "natural no-op bounds" for the books range rules — a rule spanning at-or-beyond these
 * doesn't constrain the corpus, so it produces no chip. Hardcoded against the canonical config
 * extents (the panel's derived baselines live in a sibling component).
 *
 * @internal
 */
const RANGE_NO_OP_BOUNDS: Record<string, { readonly maxGE: number; readonly minLE: number }> = {
	'page-count': { maxGE: 1500, minLE: 0 },
	'publication-year': { maxGE: 2025, minLE: 1900 },
	rating: { maxGE: 5, minLE: 0 },
};

/**
 * Walk the active-rules map, producing a chip summary for every rule currently constraining the
 * result set (permissive/no-op rules are dropped).
 *
 * @internal
 */
function buildRuleSummaries(rules: ReadonlyMap<RuleId, FilterRule>): readonly RuleSummary[] {
	const summaries: RuleSummary[] = [];

	for (const [ruleId, rule] of rules) {
		const summary = summarizeRule(ruleId, rule);

		if (summary !== null) {
			summaries.push(summary);
		}
	}

	return summaries;
}

/**
 * Single-rule summarizer. Returns `null` when the rule is a no-op (no constraint). Discriminates on
 * `instanceof` (live rule instances don't carry a `type` field — that's a serialization artifact).
 *
 * @internal
 */
function summarizeRule(ruleId: RuleId, rule: FilterRule): RuleSummary | null {
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
	if (rule instanceof TextSearchRule) {
		const q = rule.config.query.trim();

		return q === '' ? null : { isNumeric: false, label: 'Description', ruleId, value: `"${q}"` };
	}
	if (rule instanceof FuzzySearchRule) {
		const q = rule.config.query.trim();

		return q === '' ? null : { isNumeric: false, label: 'Author', ruleId, value: `"${q}"` };
	}

	return summarizeCuratedRule(ruleId, rule);
}

/**
 * Summarizer for the demo rules folded in after the original five (Exists / Regex / InSetofSets /
 * Bloom membership). Split out to keep `summarizeRule` under the cyclomatic-complexity cap.
 *
 * @internal
 */
function summarizeCuratedRule(ruleId: RuleId, rule: FilterRule): RuleSummary | null {
	if (rule instanceof ExistsRule) {
		return { isNumeric: false, label: EXISTS_LABELS[ruleId] ?? ruleId, ruleId, value: 'Yes' };
	}
	if (rule instanceof RegexRule) {
		const source = rule.config.pattern.source;

		return source === '' || source === '(?:)' ? null : { isNumeric: false, label: 'ISBN', ruleId, value: `/${source}/` };
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
 * Summarize a `RangeRule` into a chip (or `null` when the range is a baseline no-op). Split out to
 * keep `summarizeRule` under the cyclomatic-complexity cap.
 *
 * @internal
 */
function summarizeRangeRule(ruleId: RuleId, rule: RangeRule): RuleSummary | null {
	const { max, min } = rule.config;
	const isMaxOpen = !Number.isFinite(max);
	const labels: Record<string, { fmt: (n: number) => string; label: string }> = {
		'page-count': { fmt: (n) => `${n.toFixed(0)} pp`, label: 'Pages' },
		'publication-year': { fmt: (n) => n.toFixed(0), label: 'Year' },
		rating: { fmt: (n) => `${n.toFixed(1)}★`, label: 'Rating' },
	};
	const known = labels[ruleId];
	const noOp = RANGE_NO_OP_BOUNDS[ruleId];

	if (noOp !== undefined && min <= noOp.minLE && (max >= noOp.maxGE || isMaxOpen)) {
		return null;
	}
	const fmt = known?.fmt ?? ((n: number) => n.toLocaleString());
	const lo = min <= -Number.MAX_VALUE ? '∞' : fmt(min);
	const hi = isMaxOpen ? '∞' : fmt(max);

	return { isNumeric: true, label: known?.label ?? ruleId, ruleId, value: `${lo} — ${hi}` };
}

/**
 * Format a set of selected values for a chip: single value as-is; 2+ condensed to
 * "First (+N more)" so the chip stays compact.
 *
 * @internal
 */
function formatSetValue(set: readonly unknown[]): string {
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
