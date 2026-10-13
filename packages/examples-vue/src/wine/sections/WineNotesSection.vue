<script setup lang="ts">
/**
 * `<WineNotesSection>` — a `FuzzySearchRule` over a wine's tasting notes.
 *
 * @remarks
 * Searches `description` with `tastingNotes` as a secondary key, at a loose 0.45 threshold: the text
 * is long free-form prose where people paraphrase and misspell, so a tight threshold reads as "fuzzy
 * search is broken".
 *
 * ## The text variant of the panel's state pattern
 *
 * Same `ref` + one-way `watch` as `<WineChipSection>`, and here the local state is doing double duty:
 * it holds **uncommitted keystrokes** as well as absorbing the worker's round-trip lag. A `computed`
 * would make the field unusable outright — every character typed would be overwritten by the engine's
 * last committed query on the next tick.
 *
 * **The commit path deliberately does NOT write locally.** Every other handler in this panel paints
 * first; this one lets the watch adopt instead, so the input ends up showing the **trimmed** query the
 * engine actually holds rather than the raw keystrokes. Typing `" oak "` and blurring should leave
 * `oak` in the box, because that is what is filtering.
 *
 * An empty query CLEARS the rule rather than committing an empty one — a `FuzzySearchRule` with an
 * empty query is not a neutral rule, and leaving it installed would show an active-filter chip for a
 * search nobody is running. `<WinerySearchSection>` deliberately differs; see its docblock.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { fuzzy, type FuzzySearchRule } from '@filter-enginez/core';
import { clearRule, commitRule } from '@filter-enginez/examples-shared/wine-domain';
import { useEngineRefs } from '@filter-enginez/vue-signals';
import { computed, ref, watch } from 'vue';

import SearchInput from '../../controls/SearchInput.vue';
import SectionHeader from '../../controls/SectionHeader.vue';

const props = defineProps<{
	engine: SignalsEngine<Wine>;
	leaveExpressionMode: () => void;
}>();

const ruleRef = useEngineRefs(props.engine).rule('notes');

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
 * Commit on blur or Enter.
 *
 * @param next - The raw input value; trimmed before it reaches the engine.
 */
function handleCommit(next: string): void {
	props.leaveExpressionMode();

	// No local write here — see the docblock. The watch adopts the trimmed value back.
	if (next.trim().length === 0) {
		clearRule(props.engine, 'notes');

		return;
	}
	commitRule(props.engine, 'notes', fuzzy('description', {
		keys: ['description', 'tastingNotes'],
		query: next.trim(),
		threshold: 0.45,
	}));
}
</script>

<template>
	<section>
		<SectionHeader label="Tasting notes search" />
		<SearchInput
			input-label="Search tasting notes"
			placeholder="cherry, oak, tannin…"
			:value="query"
			@change="handleChange"
			@commit="handleCommit"
		/>
	</section>
</template>
