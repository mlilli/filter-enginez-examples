<script lang="ts">
	/**
	 * `<ResultsHeader>` — the books route's results header.
	 *
	 * @remarks
	 * A context adapter over the shared `$lib/controls/ResultsHeader`, and nothing else. It reads the
	 * engine out of Svelte context, summarizes the active rules, and hands the shared view plain props.
	 *
	 * The chip markup, the empty-state sentence and the count-rolling animation (`<ResultCount>`) all
	 * live in the shared view, the same one wine's header uses. What stays here is the wiring that is
	 * genuinely books': the choice to be self-sufficient from context rather than driven by
	 * `<BooksView>`.
	 *
	 * That choice is worth keeping. The books route is the parity reference the other five apps
	 * are measured against, and a header that needs no props is the smallest available demonstration
	 * that the engine's reactive surface carries everything a view needs.
	 */

	import type { Book } from '@filter-enginez/mock-data/books';

	import { buildRuleSummaries } from '@filter-enginez/examples-shared/books-domain';
	import { clearAllFilters } from '@filter-enginez/examples-shared/selection';
	import { createEngineStores, getFilterEngine } from '@filter-enginez/svelte-signals';
	import SharedResultsHeader from '$lib/controls/ResultsHeader.svelte';

	import { isEngineBusy, markUserAction } from './booksBusy.js';

	const engine = getFilterEngine<Book>();
	const { activeRules, lastChange, resultCount, sourceData } = createEngineStores(engine);

	const summaries = $derived(buildRuleSummaries($activeRules));
</script>

<SharedResultsHeader
	activeFilters={summaries}
	dataset="books"
	isBusy={isEngineBusy}
	onClearAll={() => {
		clearAllFilters(engine, markUserAction);
	}}
	onRemove={(ruleId) => {
		markUserAction();
		engine.core.removeRule(ruleId);
	}}
	recentRuleId={$lastChange.ruleId}
	resultCount={$resultCount}
	totalCount={$sourceData.length}
/>
