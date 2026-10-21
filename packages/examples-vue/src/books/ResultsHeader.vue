<script setup lang="ts">
/**
 * `<ResultsHeader>` (books) — the context adapter over the generic `<ResultsHeader>` control.
 *
 * @remarks
 * Everything visual lives in `../controls/ResultsHeader.vue`, shared by every dataset; this is the
 * books-shaped half: the engine comes from provide/inject, the chips come from books'
 * `buildRuleSummaries`, and the busy state comes from books' tracker. Those three imports are the
 * entirety of what is books-specific, and they are exactly what a prop-driven control cannot own.
 *
 * The count-rolling animation lives in `../brand/ResultCount.vue`, which the generic header renders.
 *
 * The write side calls `markUserAction()` before each engine call, so the busy tracker sees the intent
 * rather than inferring it from the result.
 */
import type { Book } from '@filter-enginez/mock-data/books';

import { buildRuleSummaries } from '@filter-enginez/examples-shared/books-domain';
import { clearAllFilters } from '@filter-enginez/examples-shared/selection';
import { useBusy, useEngineRefs, useFilterEngine } from '@filter-enginez/vue-signals';
import { computed } from 'vue';

import ComputingIndicator from '../brand/ComputingIndicator.vue';
import ResultsHeader from '../controls/ResultsHeader.vue';
import { booksBusyTracker, markUserAction } from './booksBusy.js';

const engine = useFilterEngine<Book>();
const { activeRules, lastChange, resultCount, sourceData } = useEngineRefs(engine);
const isEngineBusy = useBusy(booksBusyTracker);

const summaries = computed(() => buildRuleSummaries(activeRules.value));
const totalCount = computed(() => sourceData.value.length);

/** Remove a single rule (a chip ×). */
function handleRemoveRule(ruleId: string): void {
	markUserAction();
	engine.core.removeRule(ruleId);
}

/** Clear every active rule (the "Clear all" link) — the shared gesture every dataset's header calls. */
function handleClearAll(): void {
	clearAllFilters(engine, markUserAction);
}
</script>

<template>
	<ResultsHeader
		:active-filters="summaries"
		dataset="books"
		:is-busy="isEngineBusy"
		:recent-rule-id="lastChange.ruleId"
		:result-count="resultCount"
		:total-count="totalCount"
		@clear-all="handleClearAll"
		@remove="handleRemoveRule"
	>
		<template #status="{ isComputing }">
			<ComputingIndicator :is-computing="isComputing" />
		</template>
	</ResultsHeader>
</template>
