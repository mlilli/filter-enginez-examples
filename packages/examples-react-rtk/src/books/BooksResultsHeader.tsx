/**
 * `<BooksResultsHeader />` — the strip between the filter sidebar and the books result grid.
 *
 * @remarks
 * Container half of the container/view split, mirroring the wine `<ResultsHeader />`: it holds the
 * engine-coupled bits (subscriptions + the `instanceof`-based rule→chip summarizer + per-chip
 * reset) and hands a plain `FilterSummary[]` + two callbacks to the framework-agnostic
 * `<ResultsHeaderView />`. Result count + active-rule count read from the Redux mirror (the
 * redux-bridge demonstration); the chips need live rule instances the mirror deliberately omits, so
 * they come from `useActiveRules`.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { BloomMembershipRule, BooleanRule, ExistsRule, type FilterRule, FuzzySearchRule, InSetofSetsRule, InSetRule, RangeRule, RegexRule, type RuleId, TextSearchRule } from '@filter-enginez/core';
import { commitFilterMutation, getIsEngineBusy, markUserAction, subscribeEngineBusy } from '@filter-enginez/examples-shared/books';
import { useActiveRules, useFilterEngine } from '@filter-enginez/react-signals';
import { type FilterSummary, ResultsHeaderView } from '@filter-enginez/react-ui';
import { forwardToEngine } from '@filter-enginez/redux-bridge';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { useBooksDispatch, useBooksSelector } from './store.js';

/**
 * Top-level books results header container.
 */
export const BooksResultsHeader = (): React.ReactElement => {
	const engine = useFilterEngine<Book>();
	const dispatch = useBooksDispatch();
	const activeRules = useActiveRules();
	// Result count + active-rule count + last-changed id all read from the Redux mirror (the
	// redux-bridge headline: the same engine events that drive signals keep the mirror live).
	const resultCount = useBooksSelector((state) => state.filters.resultCount);
	const mirrorActiveCount = useBooksSelector((state) => state.filters.activeRuleIds.length);
	const recentlyChangedRuleId = useBooksSelector((state) => state.filters.lastChangeRuleId);
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
		// Clear-all flows through the forwarding middleware (a Redux intent) rather than calling the
		// engine directly, so redux-logger / DevTools observe it — see the wine header for the full
		// rationale on why both write paths coexisting is legal under the bridge contract.
		commitFilterMutation({
			callEngine: () => {
				dispatch(forwardToEngine('clearRules', {}));
			},
			markBusy: markUserAction,
		});
	}, [dispatch]);

	return (
		<ResultsHeaderView
			summaries={summaries}
			resultCount={resultCount}
			totalCount={totalCount}
			isFetching={isFetching}
			onRemoveRule={handleRemoveRule}
			onClearAll={handleClearAll}
			mirrorActiveCount={mirrorActiveCount}
			recentlyChangedRuleId={recentlyChangedRuleId}
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
 * doesn't constrain the corpus, so it produces no chip. Hardcoded (rather than read from the panel's
 * derived baselines, which live in a sibling component) against the canonical config extents.
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
