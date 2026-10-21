/**
 * `<RealEstateResultsHeader />` — the strip between the filter sidebar and the real-estate grid.
 *
 * @remarks
 * Container half of the container/view split, mirroring the books/wine headers: it holds the
 * engine-coupled bits (subscriptions + the two writes) and hands a plain `FilterSummary[]` + two
 * callbacks to the framework-agnostic `<ResultsHeaderView />`. Result count, active-rule count and the
 * last-changed rule id read from the Redux mirror (the redux-bridge demonstration); the chips need live
 * rule instances the mirror omits, so they come from `useActiveRules` through the shared
 * `real-estate-domain` `buildRuleSummaries` — the widest summarizer, covering hierarchical, geo,
 * date-range and the custom `ContainsAllRule` on top of the InSet / range / text ones books uses.
 *
 * Both writes travel through Redux as forwarded intents, as on wine and books: a pill's × is
 * `forwardToEngine('removeRule')` and "Clear all" is `forwardToEngine('clearRules')`, the seam the
 * shared `clearAllFilters` accepts. The middleware calls the engine and swallows the action, so the
 * Redux DevTools see the intent; the mirror reflects every engine action through
 * `attachEngineToStore`.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { buildRuleSummaries, commitFilterMutation, deriveMetroCenters, type FilterSummary, getIsEngineBusy, markUserAction, subscribeEngineBusy } from '@filter-enginez/examples-shared/real-estate';
import { clearAllFilters } from '@filter-enginez/examples-shared/selection';
import { RESULT_COPY } from '@filter-enginez/examples-shared/verticals';
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
		// A forwarded `removeRule` intent, as on wine — see the module docblock.
		commitFilterMutation({
			callEngine: () => {
				dispatch(forwardToEngine('removeRule', { ruleId }));
			},
			markBusy: markUserAction,
		});
	}, [dispatch]);

	const handleClearAll = useCallback((): void => {
		// Every rule and group as ONE engine action (`RULES_CLEARED`, one Undo), reaching the engine as a
		// forwarded `clearRules` intent. The shared helper marks the real-estate tracker busy again right
		// before its write; the tracker's version only climbs, so that second mark extends the busy span
		// the first one opened rather than starting another.
		commitFilterMutation({
			callEngine: () => {
				clearAllFilters(engine, markUserAction, () => {
					dispatch(forwardToEngine('clearRules', {}));
				});
			},
			markBusy: markUserAction,
		});
	}, [dispatch, engine]);

	return (
		<ResultsHeaderView
			summaries={summaries}
			noun={RESULT_COPY['real-estate'].noun}
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
// genuinely app-specific: the subscriptions and the two forwarded write paths.
