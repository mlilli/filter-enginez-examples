/**
 * `<BooksResultsHeader />` — the strip between the filter sidebar and the books result grid (plain /
 * signals-only).
 *
 * @remarks
 * The signals-surface sibling of the RTK `<BooksResultsHeader />` — the same container/view split and
 * the same shared `books-domain` `buildRuleSummaries` every books vertical renders, but every datum
 * reads from the signals adapter (`useResultCount`, `useActiveRules`, and `useLastChange` for the
 * "recently changed" pill) instead of a Redux mirror. Both writes go straight to the engine (there is
 * no forwarding middleware): a pill's × is `removeRule`, and "Clear all" is the shared
 * `clearAllFilters`, which drops every rule and group as one engine action. The same header serves
 * `/books`, `/books-config` and `/books-server`.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { commitFilterMutation, getIsEngineBusy, markUserAction, subscribeEngineBusy } from '@filter-enginez/examples-shared/books';
import { buildRuleSummaries } from '@filter-enginez/examples-shared/books-domain';
import { clearAllFilters } from '@filter-enginez/examples-shared/selection';
import { RESULT_COPY } from '@filter-enginez/examples-shared/verticals';
import { useActiveRules, useFilterEngine, useLastChange, useResultCount } from '@filter-enginez/react-signals';
import { ResultsHeaderView } from '@filter-enginez/react-ui';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

/**
 * Top-level books results header container.
 */
export const BooksResultsHeader = (): React.ReactElement => {
	const engine = useFilterEngine<Book>();
	const activeRules = useActiveRules();
	const resultCount = useResultCount();
	// The engine's own last-changed rule id; the RTK app reads the same id off its mirror.
	const { ruleId: recentlyChangedRuleId } = useLastChange();
	const totalCount = engine.core.getSourceData().length;

	const isFetching = useSyncExternalStore(subscribeEngineBusy, getIsEngineBusy, getIsEngineBusy);

	const summaries = useMemo(() => buildRuleSummaries(activeRules), [activeRules]);

	const handleRemoveRule = useCallback((ruleId: string): void => {
		commitFilterMutation({
			callEngine: () => engine.core.removeRule(ruleId),
			markBusy: markUserAction,
		});
	}, [engine]);

	const handleClearAll = useCallback((): void => {
		// One `RULES_CLEARED`, one Undo. The shared helper marks the books tracker busy again right
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
			noun={RESULT_COPY.books.noun}
			resultCount={resultCount}
			totalCount={totalCount}
			isFetching={isFetching}
			onRemoveRule={handleRemoveRule}
			onClearAll={handleClearAll}
			recentlyChangedRuleId={recentlyChangedRuleId}
		/>
	);
};
