/**
 * `<RealEstateResultsHeader />` — the strip between the filter sidebar and the real-estate grid
 * (plain / signals-only).
 *
 * @remarks
 * The signals-surface sibling of the RTK `<RealEstateResultsHeader />` — same container/view split and
 * the same rule→chip summarizer, but every datum reads from the signals adapter
 * (`useResultCount`, `useActiveRules`, and `useLastChange` for the "recently changed" pill) instead
 * of a Redux mirror, and both writes go straight to the engine (there's no forwarding middleware): a
 * pill's × is `removeRule`, and "Clear all" is the shared `clearAllFilters`, one engine action. Both
 * apps render from the SAME `buildRuleSummaries` in `@filter-enginez/examples-shared/real-estate-domain`.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { buildRuleSummaries, commitFilterMutation, deriveMetroCenters, type FilterSummary, getIsEngineBusy, markUserAction, subscribeEngineBusy } from '@filter-enginez/examples-shared/real-estate';
import { clearAllFilters } from '@filter-enginez/examples-shared/selection';
import { RESULT_COPY } from '@filter-enginez/examples-shared/verticals';
import { useActiveRules, useFilterEngine, useLastChange, useResultCount } from '@filter-enginez/react-signals';
import { ResultsHeaderView } from '@filter-enginez/react-ui';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Top-level real-estate results header container.
 */
export const RealEstateResultsHeader = (): React.ReactElement => {
	const engine = useFilterEngine<Listing>();
	const activeRules = useActiveRules();
	const resultCount = useResultCount();
	// The engine's own last-changed rule id; the RTK app reads the same id off its mirror.
	const { ruleId: recentlyChangedRuleId } = useLastChange();
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
		// One `RULES_CLEARED`, one Undo. The shared helper marks the real-estate tracker busy again right
		// before its write; the tracker's version only climbs, so that second mark extends the busy span
		// the first one opened rather than starting another.
		commitFilterMutation({
			callEngine: () => {
				clearAllFilters(engine, markUserAction);
			},
			markBusy: markUserAction,
		});
	}, [engine]);

	return (
		<ResultsHeaderView
			summaries={summaries}
			noun={RESULT_COPY['real-estate'].noun}
			resultCount={resultCount}
			totalCount={totalCount}
			isFetching={isFetching}
			onRemoveRule={handleRemoveRule}
			onClearAll={handleClearAll}
			recentlyChangedRuleId={recentlyChangedRuleId}
		/>
	);
};

// The chip summarizer is `buildRuleSummaries` in `@filter-enginez/examples-shared/real-estate-domain`,
// shared by all six verticals so the chip labels match everywhere.
