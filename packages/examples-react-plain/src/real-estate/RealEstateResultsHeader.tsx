/**
 * `<RealEstateResultsHeader />` — the strip between the filter sidebar and the real-estate grid
 * (plain / signals-only).
 *
 * @remarks
 * The signals-surface sibling of the RTK `<RealEstateResultsHeader />` — same container/view split and
 * the same rule→chip summarizer, but every datum reads from the signals adapter
 * (`useResultCount`, `useActiveRules`) instead of a Redux mirror, and clear-all calls
 * `engine.core.clearRules()` directly (there's no forwarding middleware). Both apps render from
 * the SAME `buildRuleSummaries` in `@filter-enginez/examples-shared/real-estate-domain`.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { buildRuleSummaries, commitFilterMutation, deriveMetroCenters, type FilterSummary, getIsEngineBusy, markUserAction, subscribeEngineBusy } from '@filter-enginez/examples-shared/real-estate';
import { useActiveRules, useFilterEngine, useResultCount } from '@filter-enginez/react-signals';
import { ResultsHeaderView } from '@filter-enginez/react-ui';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Top-level real-estate results header container.
 */
export const RealEstateResultsHeader = (): React.ReactElement => {
	const engine = useFilterEngine<Listing>();
	const activeRules = useActiveRules();
	const resultCount = useResultCount();
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

// The chip summarizer is `buildRuleSummaries` in `@filter-enginez/examples-shared/real-estate-domain`,
// shared by all six verticals so the chip labels match everywhere.
