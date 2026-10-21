<script setup lang="ts">
/**
 * `<WinerySearchSection>` — a typo-tolerant `FuzzySearchRule` over a wine's winery.
 *
 * @remarks
 * The copy and the Fuse settings are `WINE_SEARCHES.winery`, shared by every app: a tighter threshold
 * than the tasting-note search (0.35 against 0.45), because a winery name is a short proper noun and a
 * loose threshold on short strings matches most of the corpus.
 *
 * Timing and adoption are the tasting-note search's (`useTypeaheadSearch`; see `<WineNotesSection>`),
 * and so is the empty query: it REMOVES the rule in every app.
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

const ruleRef = useEngineRefs(props.engine).rule('winery');

const search = useTypeaheadSearch({
	commit: (trimmedQuery) => {
		props.leaveExpressionMode();
		if (trimmedQuery === '') {
			clearRule(props.engine, 'winery');

			return;
		}
		commitRule(props.engine, 'winery', wineSearchRule('winery', trimmedQuery));
	},
	committedQuery: () => (ruleRef.value as FuzzySearchRule | undefined)?.config.query ?? '',
});
const { query } = search;
</script>

<template>
	<section>
		<SectionHeader :label="WINE_SEARCHES.winery.label" />
		<SearchInput
			:input-label="WINE_SEARCHES.winery.ariaLabel"
			:placeholder="WINE_SEARCHES.winery.placeholder"
			:value="query"
			@change="search.input"
			@commit="search.flush"
		/>
	</section>
</template>
