/**
 * `<RealEstateResultsHeader />` — the strip between the filter sidebar and the real-estate grid.
 *
 * @remarks
 * Container half of the container/view split, mirroring the books/wine headers: it holds the
 * engine-coupled bits (subscriptions + the `instanceof`-based rule→chip summarizer + per-chip reset)
 * and hands a plain `FilterSummary[]` + two callbacks to the framework-agnostic `<ResultsHeaderView />`.
 * Result count + active-rule count read from the Redux mirror (the redux-bridge demonstration); the
 * chips need live rule instances the mirror omits, so they come from `useActiveRules`. Real-estate's
 * summarizer is the widest — it covers hierarchical, geo, date-range, and the custom `ContainsAllRule`
 * on top of the InSet / range / text ones books uses.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { buildRuleSummaries, commitFilterMutation, deriveMetroCenters, type FilterSummary, getIsEngineBusy, markUserAction, subscribeEngineBusy } from '@filter-enginez/examples-shared/real-estate';
import { useActiveRules, useFilterEngine } from '@filter-enginez/react-signals';
import { ResultsHeaderView } from '@filter-enginez/react-ui';
import { forwardToEngine } from '@filter-enginez/redux-bridge';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { useRealEstateDispatch, useRealEstateSelector } from './store.js';

/**
 * Top-level real-estate results header container.
 */
export const RealEstateResultsHeader = (): React.ReactElement => {
	const engine = useFilterEngine<Listing>();
	const dispatch = useRealEstateDispatch();
	const activeRules = useActiveRules();
	const resultCount = useRealEstateSelector((state) => state.filters.resultCount);
	const mirrorActiveCount = useRealEstateSelector((state) => state.filters.activeRuleIds.length);
	const recentlyChangedRuleId = useRealEstateSelector((state) => state.filters.lastChangeRuleId);
	const sourceData = engine.core.getSourceData();
	const totalCount = sourceData.length;
	// The metro centroids of the corpus the engine booted from — the same derivation the panel's geo
	// section runs, so the chip and the dropdown name the same place.
	const metroCenters = useMemo(() => deriveMetroCenters(sourceData), [sourceData]);

	const isFetching = useSyncExternalStore(subscribeEngineBusy, getIsEngineBusy, getIsEngineBusy);

	const summaries = useMemo<readonly FilterSummary[]>(
		// `metroCenters` is what turns "≤ 15 mi" into "≤ 15 mi of Greater Denver". A radius states half
		// a filter without its center, and the center is the half the user actually chose.
		() => buildRuleSummaries(activeRules, { metroCenters }),
		[activeRules, metroCenters],
	);

	const handleRemoveRule = useCallback((ruleId: string): void => {
		commitFilterMutation({
			callEngine: () => engine.core.removeRule(ruleId),
			markBusy: markUserAction,
		});
	}, [engine]);

	const handleClearAll = useCallback((): void => {
		// Clear-all flows through the forwarding middleware (a Redux intent) so redux-logger / DevTools
		// observe it — see the wine header for why both write paths coexisting is legal.
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

// The chip summarizer is `buildRuleSummaries` in `@filter-enginez/examples-shared/real-estate-domain`,
// shared by all six verticals so the chip labels match everywhere. This container keeps only what is
// genuinely app-specific: the subscriptions and the two write paths.
