<script setup lang="ts">
/**
 * `<WineNotesSection>` — a `FuzzySearchRule` over a wine's tasting notes.
 *
 * @remarks
 * The copy and the Fuse settings are `WINE_SEARCHES.notes`, shared by every app: `description` with
 * `tastingNotes` as a secondary key, at a loose 0.45 threshold, because the text is long free-form
 * prose where people paraphrase and misspell. The rule is built by the shared `wineSearchRule`.
 *
 * The timing is `useTypeaheadSearch`: the query commits once typing pauses, and at once on blur,
 * Enter or the clear button; an unchanged query is never written, so blurring an untouched or
 * already-committed field writes nothing and marks nothing busy. An external change to the rule (Clear
 * all, a pill's ×, Undo, a `?f` link) is adopted; the echo of the field's own commit is not, so a
 * worker round trip landing mid-word never yanks the text.
 *
 * An empty query REMOVES the rule, as the winery search does: a `FuzzySearchRule` with an empty query
 * would leave an active-filter pill for a search nobody is running.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { type FuzzySearchRule } from '@filter-enginez/core';
import { clearRule, commitRule, WINE_SEARCHES, wineSearchRule } from '@filter-enginez/examples-shared/wine-domain';
import { useEngineRefs } from '@filter-enginez/vue-signals';

import SearchInput from '../../controls/SearchInput.vue';
import SectionHeader from '../../controls/SectionHeader.vue';
import { useTypeaheadSearch } from '../../search/useTypeaheadSearch.js';

const props = defineProps<{
	engine: SignalsEngine<Wine>;
	leaveExpressionMode: () => void;
}>();

const ruleRef = useEngineRefs(props.engine).rule('notes');

const search = useTypeaheadSearch({
	commit: (trimmedQuery) => {
		props.leaveExpressionMode();
		if (trimmedQuery === '') {
			clearRule(props.engine, 'notes');

			return;
		}
		commitRule(props.engine, 'notes', wineSearchRule('notes', trimmedQuery));
	},
	committedQuery: () => (ruleRef.value as FuzzySearchRule | undefined)?.config.query ?? '',
});
const { query } = search;
</script>

<template>
	<section>
		<SectionHeader :label="WINE_SEARCHES.notes.label" />
		<SearchInput
			:input-label="WINE_SEARCHES.notes.ariaLabel"
			:placeholder="WINE_SEARCHES.notes.placeholder"
			:value="query"
			@change="search.input"
			@commit="search.flush"
		/>
	</section>
</template>
