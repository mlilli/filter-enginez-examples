<script setup lang="ts">
/**
 * `<WinerySearchSection>` — a typo-tolerant `FuzzySearchRule` over a wine's winery.
 *
 * @remarks
 * Tighter threshold than the tasting-note search (0.35 against 0.45), matching React and SvelteKit. A
 * winery name is a short proper noun, and a loose threshold on short strings matches most of the
 * corpus — which reads as "fuzzy search is broken" rather than as a tuning choice.
 *
 * State is the text variant of the panel's pattern; see `<WineNotesSection>` for the full reasoning,
 * including why the commit path does not write locally.
 *
 * **Unlike the tasting-note search, an empty query still commits a rule here**, exactly as the
 * SvelteKit, Angular and vanilla winery sections do. What the active-filter chips show follows from
 * it, and the e2e specs assert those chips, so change every app together or none — otherwise the
 * verticals disagree about what an empty winery search means.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { fuzzy, type FuzzySearchRule } from '@filter-enginez/core';
import { commitRule } from '@filter-enginez/examples-shared/wine-domain';
import { useEngineRefs } from '@filter-enginez/vue-signals';
import { computed, ref, watch } from 'vue';

import SearchInput from '../../controls/SearchInput.vue';
import SectionHeader from '../../controls/SectionHeader.vue';

const props = defineProps<{
	engine: SignalsEngine<Wine>;
	leaveExpressionMode: () => void;
}>();

const ruleRef = useEngineRefs(props.engine).rule('winery');

/** The query the engine is actually filtering on. */
const committed = computed<string>(
	() => (ruleRef.value as FuzzySearchRule | undefined)?.config.query ?? '',
);

/** What the input displays — keystrokes while typing, the engine's trimmed query after a commit. */
const query = ref<string>(committed.value);

watch(committed, (next) => {
	query.value = next;
});

/**
 * Mirror a keystroke. No engine write — that waits for blur or Enter.
 *
 * @param next - The raw input value.
 */
function handleChange(next: string): void {
	query.value = next;
}

/**
 * Commit on blur or Enter. An empty query still writes a rule — see the docblock.
 *
 * @param next - The raw input value; trimmed before it reaches the engine.
 */
function handleCommit(next: string): void {
	props.leaveExpressionMode();
	commitRule(props.engine, 'winery', fuzzy('winery', { query: next.trim(), threshold: 0.35 }));
}
</script>

<template>
	<section>
		<SectionHeader label="Winery (typo-tolerant)" />
		<SearchInput
			input-label="Search wineries with typo tolerance"
			placeholder="Vandermark, Caruso, Hartmann..."
			:value="query"
			@change="handleChange"
			@commit="handleCommit"
		/>
	</section>
</template>
