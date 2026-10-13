<script setup lang="ts">
/**
 * `<NotFoundPage>` — the Vue "filtered to zero" 404, at parity with the React `<NotFoundPage>` and the
 * SvelteKit `+error.svelte`. Wire it as the router catch-all (`/:pathMatch(.*)*`).
 *
 * Shares ONE source with the other verticals: the copy, chip vocabulary, and toggle logic come from
 * `@filter-enginez/examples-shared/notfound-core` (framework-free), and it renders over the same
 * `fe-notfound__*` classes from `@filter-enginez/ui-styles` (imported app-wide via `app.css`). The gag
 * matches too: a cyan `0` result count that never moves, the phosphor `NeuralCluster` "thinking" loader
 * churning away (the engine perpetually searching, never matching), and a dead-end filter row where
 * every toggle still yields the empty set.
 */
import {
	NOT_FOUND_CHIPS,
	NOT_FOUND_COPY,
	notFoundBody,
	toggleNotFoundChip,
} from '@filter-enginez/examples-shared/notfound-core';
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import NeuralCluster from '../brand/NeuralCluster.vue';

const route = useRoute();
const selected = ref<readonly string[]>([]);

/** The dead-end body copy, keyed off the path the user actually tried to reach. */
const body = computed(() => notFoundBody(route.path));

/** Toggle a chip — the count never budges off zero, so there's nothing to recompute. */
function handleToggle(id: string): void {
	selected.value = toggleNotFoundChip(selected.value, id);
}
</script>

<template>
	<main class="fe-notfound">
		<p class="fe-notfound__eyebrow">{{ NOT_FOUND_COPY.eyebrow }}</p>
		<p class="fe-notfound__count" aria-hidden="true">{{ NOT_FOUND_COPY.count }}</p>
		<div class="fe-notfound__loader">
			<NeuralCluster :size="168" />
		</div>
		<h1 class="fe-notfound__heading">{{ NOT_FOUND_COPY.heading }}</h1>
		<p class="fe-notfound__body">{{ body }}</p>
		<div class="fe-notfound__chips" role="group" aria-label="Dead-end filters — every option yields zero">
			<button
				v-for="chip in NOT_FOUND_CHIPS"
				:key="chip.id"
				type="button"
				class="fe-notfound__chip"
				:class="{ 'fe-notfound__chip--selected': selected.includes(chip.id) }"
				:aria-pressed="selected.includes(chip.id)"
				@click="handleToggle(chip.id)"
			>
				{{ chip.label }}
				<span class="fe-notfound__chip-badge">0</span>
			</button>
		</div>
		<RouterLink class="fe-notfound__cta" :to="NOT_FOUND_COPY.ctaHref">{{ NOT_FOUND_COPY.ctaLabel }}</RouterLink>
	</main>
</template>
