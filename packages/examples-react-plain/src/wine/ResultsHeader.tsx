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
 *   1. The engine subscriptions — `useActiveRules`, `useResultCount`, `useLastChange` (the
 *      last-changed rule id behind the "recently changed" pill), the corpus total, and the
 *      `engineBusy` external-store read.
 *   2. The rule→chip mapping, which is the shared `buildWineFilterSummaries` every wine vertical
 *      renders, so a pill reads the same in all six apps.
 *   3. The two writes, both through the shared wine commit helpers every vertical calls:
 *      `removeWineFilterChip` for a chip's × and `clearAllWineFilters` for "Clear all", which drops
 *      every rule, group and expression mode as one engine action.
 *
 * The container builds a plain `FilterSummary[]` + two callbacks and hands them to the view. The
 * view knows nothing of `FilterRule`, `RuleId`, or signals — the same boundary the RTK app's wine
 * container uses.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { RESULT_COPY } from '@filter-enginez/examples-shared/verticals';
import { commitFilterMutation, getIsEngineBusy, markUserAction, subscribeEngineBusy } from '@filter-enginez/examples-shared/wine';
import { buildWineFilterSummaries, clearAllWineFilters, removeWineFilterChip } from '@filter-enginez/examples-shared/wine-domain';
import { useActiveRules, useFilterEngine, useLastChange, useMode, useResultCount } from '@filter-enginez/react-signals';
import { ResultsHeaderView } from '@filter-enginez/react-ui';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Top-level results header container.
 */
export const ResultsHeader = (): React.ReactElement => {
	const engine = useFilterEngine<Wine>();
	const activeRules = useActiveRules();
	// In expression mode a smart-filter preset drives the results; the flat-map rules are dormant, so
	// the shared summarizer shows a single "Smart filter" chip instead of the inert flat-map chips.
	const isExpression = useMode() === 'expression';
	const resultCount = useResultCount();
	// The id of the most-recently-mutated rule, from the engine's own `lastChangeRuleId` signal (the
	// RTK app reads the same id off its Redux mirror). Drives the "recently changed" chip emphasis.
	const { ruleId: recentlyChangedRuleId } = useLastChange();
	const totalCount = engine.core.getSourceData().length;

	// Engine-busy state via the version-comparison external store — flips on the same frame the
	// user clicks (see `engineBusy.ts`). The view folds this together with its own mid-tick state
	// to drive the computing indicator.
	const isFetching = useSyncExternalStore(subscribeEngineBusy, getIsEngineBusy, getIsEngineBusy);

	// The shared wine summarizer, the one every wine vertical renders: same labels, same value
	// formats, the same synthetic "Smart filter" chip in expression mode.
	const summaries = useMemo(() => buildWineFilterSummaries(activeRules, isExpression), [isExpression, activeRules]);

	const handleRemoveRule = useCallback((ruleId: string): void => {
		// No optimistic paint — the chip vanishes when the engine confirms the change. Flip the loader,
		// then mutate a frame later. The synthetic smart-filter chip leaves expression mode and drops
		// the flat facets with it, as in every other vertical.
		commitFilterMutation({
			callEngine: () => {
				removeWineFilterChip(engine, ruleId);
			},
			markBusy: markUserAction,
		});
	}, [engine]);

	const handleClearAll = useCallback((): void => {
		// Every rule, group and expression mode, as ONE engine action (`RULES_CLEARED`, one Undo) — the
		// shared helper every vertical's header calls. It marks the wine tracker busy again right before
		// its write; the tracker's version only climbs, so that second mark extends the busy span the
		// first one opened rather than starting another.
		commitFilterMutation({
			callEngine: () => {
				clearAllWineFilters(engine);
			},
			markBusy: markUserAction,
		});
	}, [engine]);

	return (
		<ResultsHeaderView
			summaries={summaries}
			noun={RESULT_COPY.wine.noun}
			resultCount={resultCount}
			totalCount={totalCount}
			isFetching={isFetching}
			onRemoveRule={handleRemoveRule}
			onClearAll={handleClearAll}
			recentlyChangedRuleId={recentlyChangedRuleId}
		/>
	);
};
