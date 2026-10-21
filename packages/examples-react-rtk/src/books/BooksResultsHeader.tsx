/**
 * `<BooksResultsHeader />` — the strip between the filter sidebar and the books result grid.
 *
 * @remarks
 * Container half of the container/view split, mirroring the wine `<ResultsHeader />`: it holds the
 * engine-coupled bits (subscriptions + the two writes) and hands a plain `FilterSummary[]` + two
 * callbacks to the framework-agnostic `<ResultsHeaderView />`. The chips come from the shared
 * `books-domain` `buildRuleSummaries`, the summarizer every books vertical renders, over live rule
 * instances from `useActiveRules` (the mirror deliberately omits them).
 *
 * Result count, active-rule count and the last-changed rule id read from the Redux mirror (the
 * redux-bridge demonstration). Both writes travel through Redux as forwarded intents: a pill's × is
 * `forwardToEngine('removeRule')` and "Clear all" is `forwardToEngine('clearRules')`, the seam the
 * shared `clearAllFilters` accepts. `createFilterEngineMiddleware` intercepts each, calls the engine and
 * swallows the action, so redux-logger and the Redux DevTools see the intent; the mirror reflects every
 * engine action through `attachEngineToStore`, whoever made it. The same header serves `/books`,
 * `/books-config` and `/books-server`, each with its own store.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { commitFilterMutation, getIsEngineBusy, markUserAction, subscribeEngineBusy } from '@filter-enginez/examples-shared/books';
import { buildRuleSummaries } from '@filter-enginez/examples-shared/books-domain';
import { clearAllFilters } from '@filter-enginez/examples-shared/selection';
import { RESULT_COPY } from '@filter-enginez/examples-shared/verticals';
import { useActiveRules, useFilterEngine } from '@filter-enginez/react-signals';
import { ResultsHeaderView } from '@filter-enginez/react-ui';
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

	const summaries = useMemo(() => buildRuleSummaries(activeRules), [activeRules]);

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
		// forwarded `clearRules` intent. The shared helper marks the books tracker busy again right
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
			noun={RESULT_COPY.books.noun}
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
