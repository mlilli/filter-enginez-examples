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
 *   2. The rule→chip mapping, which is the shared `buildWineFilterSummaries` every wine vertical
 *      renders, so a pill reads the same in all six apps.
 *   3. The two writes, both through the shared wine commit helpers every vertical calls:
 *      `removeWineFilterChip` for a chip's × and `clearAllWineFilters` for "Clear all".
 *
 * **Both writes travel through Redux as forwarded intents.** A facet's × dispatches
 * `forwardToEngine('removeRule')` and "Clear all" (and the smart-filter chip's ×) dispatches
 * `forwardToEngine('clearRules')`, the seam the shared helpers accept. `createFilterEngineMiddleware`
 * intercepts each one, calls the engine's own `removeRule()` / `clearRules()` and swallows the
 * action, so redux-logger and the Redux DevTools see the user's intent while the engine records the
 * same single `RULE_REMOVED` / `RULES_CLEARED` the plain app's direct call does. The mirror itself is
 * never written by these handlers: `attachEngineToStore` reflects every engine action into it (these
 * and every panel write alike), which is what the "redux mirror · N active" badge and the count read.
 *
 * The container builds a plain `FilterSummary[]` + two callbacks and hands them to the view. The
 * view knows nothing of `FilterRule`, `RuleId`, or signals — the same boundary the plain app's wine
 * container uses.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { RESULT_COPY } from '@filter-enginez/examples-shared/verticals';
import { commitFilterMutation, getIsEngineBusy, markUserAction, subscribeEngineBusy } from '@filter-enginez/examples-shared/wine';
import { buildWineFilterSummaries, clearAllWineFilters, removeWineFilterChip } from '@filter-enginez/examples-shared/wine-domain';
import { useActiveRules, useFilterEngine, useMode } from '@filter-enginez/react-signals';
import { ResultsHeaderView } from '@filter-enginez/react-ui';
import { forwardToEngine } from '@filter-enginez/redux-bridge';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { useWineDispatch, useWineSelector } from '../store.js';

/**
 * Top-level results header container.
 */
export const ResultsHeader = (): React.ReactElement => {
	const engine = useFilterEngine<Wine>();
	const dispatch = useWineDispatch();
	const activeRules = useActiveRules();
	// In expression mode a smart-filter preset drives the results; the flat-map rules are dormant, so
	// the shared summarizer shows a single "Smart filter" chip instead of the inert flat-map chips.
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

	// The shared wine summarizer, the one every wine vertical renders: same labels, same value
	// formats, the same synthetic "Smart filter" chip in expression mode.
	const summaries = useMemo(() => buildWineFilterSummaries(activeRules, isExpression), [isExpression, activeRules]);

	// The Redux seam for every clear: "Clear all" and the smart-filter chip's × both reach the engine as
	// a forwarded `clearRules` intent (see the module docblock).
	const forwardClearRules = useCallback((): void => {
		dispatch(forwardToEngine('clearRules', {}));
	}, [dispatch]);

	const handleRemoveRule = useCallback((ruleId: string): void => {
		// No optimistic paint — the chip vanishes when the engine confirms the change. Flip the loader,
		// then write a frame later. A facet's × is a forwarded `removeRule`; the synthetic smart-filter
		// chip leaves expression mode and drops the flat facets with it, through the `clearRules` seam,
		// as in every other vertical.
		commitFilterMutation({
			callEngine: () => {
				removeWineFilterChip(
					engine,
					ruleId,
					(facetRuleId) => {
						dispatch(forwardToEngine('removeRule', { ruleId: facetRuleId }));
					},
					forwardClearRules,
				);
			},
			markBusy: markUserAction,
		});
	}, [dispatch, engine, forwardClearRules]);

	const handleClearAll = useCallback((): void => {
		// Every rule, group and expression mode, as ONE engine action (`RULES_CLEARED`, one Undo). The
		// shared helper marks the wine tracker busy again right before its write; the tracker's version
		// only climbs, so that second mark extends the busy span the first one opened rather than
		// starting another.
		commitFilterMutation({
			callEngine: () => {
				clearAllWineFilters(engine, forwardClearRules);
			},
			markBusy: markUserAction,
		});
	}, [engine, forwardClearRules]);

	return (
		<ResultsHeaderView
			summaries={summaries}
			noun={RESULT_COPY.wine.noun}
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
