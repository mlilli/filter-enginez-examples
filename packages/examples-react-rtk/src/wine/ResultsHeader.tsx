/**
 * `<ResultsHeader />` — thin container for the strip between the filter sidebar and the wine
 * result grid.
 *
 * @remarks
 * **Container/view split.** All presentation — the sticky strip, the
 * active-filter chips, the canonical result-count row, and the dual-loader computing indicator —
 * lives in the state-library-agnostic, engine-free `<ResultsHeaderView />` in
 * `@filter-enginez/react-ui`. This file retains only what is intrinsically engine-coupled and so
 * may NOT cross into the presentational layer:
 *
 *   1. The engine subscriptions — `useActiveRules`, `useMode`, the Redux mirror's selectors, the
 *      corpus total, and the `engineBusy` external-store read.
 *   2. The `instanceof`-based rule→summary mapping (`summarizeRule` / `buildRuleSummaries`), which
 *      necessarily imports the concrete `core` rule classes.
 *   3. `resetRule` — the per-chip removal semantics (removeRule vs the origin special-case).
 *
 * The container builds a plain `FilterSummary[]` + two callbacks and hands them to the view. The
 * view knows nothing of `FilterRule`, `RuleId`, or signals — the same boundary the plain app's wine
 * container uses.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import {
	type FilterRule,
	FuzzySearchRule,
	hierarchical,
	HierarchicalRule,
	InSetRule,
	NumericComparisonRule,
	RangeRule,
	type RuleId,
	TextSearchRule,
	ValueRule,
} from '@filter-enginez/core';
import { commitFilterMutation, formatVintageRange, getIsEngineBusy, markUserAction, subscribeEngineBusy } from '@filter-enginez/examples-shared/wine';
import { useActiveRules, useFilterEngine, useMode } from '@filter-enginez/react-signals';
import { type FilterSummary, ResultsHeaderView } from '@filter-enginez/react-ui';
import { forwardToEngine } from '@filter-enginez/redux-bridge';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { useWineDispatch, useWineSelector } from '../store.js';

/** Synthetic chip id for the expression-mode "smart filter" chip (not a real rule id). */
const SMART_FILTER_CHIP_ID = '__smart-filter__';

/**
 * Top-level results header container.
 */
export const ResultsHeader = (): React.ReactElement => {
	const engine = useFilterEngine<Wine>();
	const dispatch = useWineDispatch();
	const activeRules = useActiveRules();
	// In expression mode a smart-filter preset drives the results; the flat-map rules are dormant, so
	// show a single "Smart filter" chip instead of the inert flat-map chips.
	const isExpression = useMode() === 'expression';
	// **Result count reads from the Redux mirror, not the signals adapter.** This is the
	// headline redux-bridge demonstration: `attachEngineToStore` keeps `state.filters.resultCount`
	// live off the same engine events the signals layer rides, and the count renders via a plain
	// `useSelector`. The signals-only plain app reads the identical value via `useResultCount()`.
	const resultCount = useWineSelector((state) => state.filters.resultCount);
	// Active-rule count straight from the mirror's `activeRuleIds` — a redux-sourced datum distinct
	// from the instance-driven chips below (which need live `FilterRule` instances the mirror, by
	// design, does NOT carry). The view renders it as a small "redux mirror · N active" provenance
	// badge so you can watch the mirror agree with the chips.
	const mirrorActiveCount = useWineSelector((state) => state.filters.activeRuleIds.length);
	// The id of the most-recently-mutated rule, from the mirror's `lastChangeRuleId`. Drives the
	// phosphor "recently changed" emphasis on the matching chip.
	const recentlyChangedRuleId = useWineSelector((state) => state.filters.lastChangeRuleId);
	const totalCount = engine.core.getSourceData().length;

	// Engine-busy state via the version-comparison external store — flips on the same frame the
	// user clicks (see `engineBusy.ts`). The view folds this together with its own mid-tick state
	// to drive the computing indicator.
	const isFetching = useSyncExternalStore(subscribeEngineBusy, getIsEngineBusy, getIsEngineBusy);

	// Map the live rule instances to plain chip data. Engine-coupled (`instanceof`), so it stays
	// here rather than in the presentational layer.
	const summaries = useMemo<readonly FilterSummary[]>(
		() => isExpression
			? [{ isNumeric: false, label: 'Smart filter', ruleId: SMART_FILTER_CHIP_ID, value: 'active' }]
			: buildRuleSummaries(activeRules),
		[isExpression, activeRules],
	);

	const handleRemoveRule = useCallback((ruleId: string): void => {
		// No optimistic paint — the chip vanishes when the engine confirms the change. Flip the loader,
		// then mutate a frame later. The synthetic smart-filter chip exits expression mode.
		commitFilterMutation({
			callEngine: () => {
				if (ruleId === SMART_FILTER_CHIP_ID) {
					engine.core.setExpression(null);
				} else {
					resetRule(engine.core, ruleId);
				}
			},
			markBusy: markUserAction,
		});
	}, [engine]);

	const handleClearAll = useCallback((): void => {
		// **Forwarding-middleware demonstration.** Rather than calling `engine.core.clearRules()`
		// directly (the path remove-rule still uses), Clear-all dispatches a forward INTENT as a
		// Redux action. `createFilterEngineMiddleware` intercepts `FILTER_ENGINE/forward/clearRules`,
		// calls `engine.clearRules()`, and swallows the action — the mirror update still arrives via
		// `engine.subscribe` → `attachEngineToStore`. Net behavior is identical (one `RULES_CLEARED`
		// devtools entry), but the intent flows through Redux, so redux-logger / DevTools see it.
		// Both write paths (direct + forwarded) coexisting is exactly what the bridge contract allows.
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
 * Per-rule chip summary as the engine sees it — identical shape to the view's `FilterSummary`
 * except `ruleId` is the branded `RuleId` (assignable to the view's `string`).
 *
 * @internal
 */
interface RuleSummary {
	readonly isNumeric: boolean;
	readonly label: string;
	readonly ruleId: RuleId;
	readonly value: string;
}

/**
 * Walk the active-rules map and produce a chip summary for every rule that's currently
 * constraining the result set. Rules in their "permissive" / "no-op" state are filtered out
 * — e.g., a price RangeRule of `{min: 0, max: Infinity}` doesn't get a chip because it
 * isn't actually narrowing anything.
 *
 * **Why this hand-rolled per-rule logic instead of a generic serializer.** Each rule type
 * has its own UX meaning. Price's chip says `Price $20 — $50`; varietal's says `Varietal
 * Cabernet (+2)`. A generic JSON dump would be noisy and unreadable; a per-rule formatter
 * gives a clean human-friendly chip for each.
 *
 * @internal
 */
function buildRuleSummaries(
	rules: ReadonlyMap<RuleId, FilterRule>,
): readonly RuleSummary[] {
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
 * Per-rule "natural no-op bounds" for wine's range rules. A rule whose `config.min`
 * is at-or-below the natural-min AND whose `config.max` is at-or-above the natural-max
 * doesn't actually constrain the corpus, so it shouldn't produce a chip.
 *
 * **Why hand-curated thresholds rather than reading the bundle's baseline.** The bundle
 * baselines live inside `<WineFilterPanel />`'s context, which doesn't reach
 * `<ResultsHeader />` (sibling component, not descendant). Computing baselines here too would
 * duplicate the corpus pass. The wine corpus has stable extremes — price is non-negative,
 * points span 80-100, ABV is 0-25 — so hardcoded "open" thresholds match the canonical
 * permissive defaults from `wineFilterConfig`.
 *
 * @internal
 */
const RANGE_NO_OP_BOUNDS: Record<string, { readonly maxGE: number; readonly minLE: number; }> = {
	abv: { maxGE: 25, minLE: 0 },
	points: { maxGE: 100, minLE: 80 },
	price: { maxGE: Number.MAX_VALUE, minLE: 0 },
};

/**
 * Operator glyphs for the `NumericComparisonRule` chip — renders `points-compare` as `Score ≥ 90`
 * rather than the raw ASCII operator.
 *
 * @internal
 */
const OP_SYMBOL: Record<string, string> = { '!=': '≠', '<': '<', '<=': '≤', '==': '=', '>': '>', '>=': '≥' };

/**
 * Single-rule summarizer. Returns `null` when the rule is in a no-op state (no constraint).
 *
 * **Discriminator is `instanceof`, not `rule.type`.** Live FilterRule instances don't carry
 * a `type` field — that's only added by `serialize()` at the JSON-config / postMessage
 * boundary. Switching on `rule.type` would ALWAYS fall through to `default` and produce zero
 * chips — the header would read "No filters active" with filters applied.
 *
 * @internal
 */
function summarizeRule(ruleId: RuleId, rule: FilterRule): RuleSummary | null {
	if (rule instanceof RangeRule) {
		return summarizeRangeRule(ruleId, rule);
	}
	if (rule instanceof InSetRule) {
		const set = rule.config.set;

		if (set.length === 0) {
			return null;
		}
		const labels: Record<string, string> = {
			body: 'Body',
			color: 'Color',
			sweetness: 'Sweetness',
			varietal: 'Varietal',
			vintage: 'Vintage',
		};

		const isVintage = ruleId === 'vintage';

		return {
			isNumeric: isVintage,
			label: labels[ruleId] ?? ruleId,
			ruleId,
			// Vintage is the one set the user picks as a RANGE — its slider materializes a span into
			// years — so the generic abbreviation would render a 2015-2022 selection as `2015 (+7 more)`.
			// Shared with the Svelte panel's summary so both chips read the same over one corpus.
			value: isVintage ? formatVintageRange(set as readonly number[]) : formatSetValue(set),
		};
	}
	if (rule instanceof HierarchicalRule) {
		const selected = rule.config.selected;

		if (selected.length === 0) {
			return null;
		}

		return {
			isNumeric: false,
			label: 'Origin',
			ruleId,
			value: formatSetValue(selected),
		};
	}
	if (rule instanceof TextSearchRule) {
		const q = rule.config.query.trim();

		if (q === '') {
			return null;
		}

		return { isNumeric: false, label: 'Tasting notes', ruleId, value: `"${q}"` };
	}
	if (rule instanceof FuzzySearchRule) {
		const q = rule.config.query.trim();

		if (q === '') {
			return null;
		}
		// Both winery + tasting-notes search are FuzzySearchRule — distinguish by ruleId.
		const label = ruleId === 'notes' ? 'Tasting notes' : 'Winery';

		return { isNumeric: false, label, ruleId, value: `"${q}"` };
	}
	if (rule instanceof ValueRule) {
		// `instanceof` on a generic class narrows to `ValueRule<any>`, so pin `config` to `unknown`.
		// Wine's only ValueRule (`color-value`) holds a string color; non-string / unset → no chip.
		const selectedValue: unknown = rule.config;

		return typeof selectedValue === 'string'
			? { isNumeric: false, label: 'Color (exact)', ruleId, value: selectedValue }
			: null;
	}
	if (rule instanceof NumericComparisonRule) {
		const { op, value: threshold } = rule.config;

		return { isNumeric: true, label: 'Score', ruleId, value: `${OP_SYMBOL[op] ?? op} ${threshold}` };
	}

	return null;
}

/**
 * Summarize a `RangeRule` into a chip (or `null` when the range is a baseline no-op). Split out
 * of `summarizeRule` to keep that dispatcher under the cyclomatic-complexity cap.
 *
 * @internal
 */
function summarizeRangeRule(ruleId: RuleId, rule: RangeRule): RuleSummary | null {
	const { max, min } = rule.config;
	const isMinOpen = min === Number.NEGATIVE_INFINITY || min <= -Number.MAX_VALUE;
	const isMaxOpen = !Number.isFinite(max);
	// Per-rule labels + value formatters. Known rules get pretty names; unknown ones fall
	// back to the ruleId as-is.
	const labels: Record<string, { fmt: (n: number) => string; label: string; }> = {
		abv: { fmt: (n) => `${n.toFixed(1)}%`, label: 'ABV' },
		points: { fmt: (n) => n.toFixed(0), label: 'Points' },
		price: { fmt: (n) => `$${n.toFixed(0)}`, label: 'Price' },
	};
	const known = labels[ruleId];
	// Baseline-no-op detection: if the rule's range covers the corpus, no chip. Falls
	// back to "only no-op if both ends are at infinity" for unknown range rules.
	const noOp = RANGE_NO_OP_BOUNDS[ruleId];

	if (noOp !== undefined) {
		const isMinAtBaseline = min <= noOp.minLE;
		const isMaxAtBaseline = max >= noOp.maxGE || isMaxOpen;

		if (isMinAtBaseline && isMaxAtBaseline) {
			return null;
		}
	} else if (isMinOpen && isMaxOpen) {
		return null;
	}
	const fmt = known?.fmt ?? ((n: number) => n.toLocaleString());
	const lo = isMinOpen ? '∞' : fmt(min);
	const hi = isMaxOpen ? '∞' : fmt(max);

	return {
		isNumeric: true,
		label: known?.label ?? ruleId,
		ruleId,
		value: `${lo} — ${hi}`,
	};
}

/**
 * Format a set of selected values for display in a chip. Single value renders as-is; 2+ get
 * a "First (+N more)" condensation so the chip stays compact.
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

/**
 * Remove a rule from the engine entirely. Used by the per-chip remove ×.
 *
 * @remarks
 * **Why removeRule and not addRule(empty config).** A deliberate choice for the
 * devtools log: wine's interactions should organically produce all three rule-mutation
 * action types (`addRule` / `changeRule` / `removeRule`) so the log shows visual variety.
 * Calling `addRule` with an empty config would record as `RULE_CHANGED`, so every clear would
 * look the same as every modify. By calling
 * `engine.removeRule(id)` instead, the chip × records as `RULE_REMOVED` (red in the devtools
 * panel), and the next user interaction with that filter records as `RULE_ADDED` (cyan)
 * because the rule no longer exists. Subsequent modifications then become `RULE_CHANGED`
 * (gray) as before.
 *
 * **The one exception: `origin`.** The HierarchicalRule carries the tree structure in its
 * config — removing it loses the tree, and the next user click can't reconstruct it (the
 * picker would render an empty tree). For origin we keep the addRule-with-empty-selected
 * approach so the tree persists. This is a `RULE_CHANGED` entry which is fine — origin's
 * "active" state is fully captured by the `selected` array.
 *
 * @internal
 */
function resetRule(core: { addRule: (id: RuleId, r: FilterRule) => void; removeRule: (id: RuleId) => void }, ruleId: RuleId): void {
	if (ruleId === 'origin') {
		// Preserve the tree, reset selection only — see comment above.
		core.addRule(
			'origin',
			hierarchical('originId', {
				selected: [],
				tree: { children: [], id: 'origin' },
			}),
		);

		return;
	}
	core.removeRule(ruleId);
}
