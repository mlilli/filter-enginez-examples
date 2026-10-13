<script setup lang="ts">
/**
 * `<WineResultGrid>` — wine's result grid, with an explicit "show more" button.
 *
 * @remarks
 * **Why not the shared `<ResultGrid>`.** That component pages on an `IntersectionObserver` sentinel:
 * scroll to the bottom and the next batch appears. Right for books and real estate, wrong here. Wine
 * is the worker tier, so each expansion crosses a Comlink boundary against 130k records, and an
 * expansion the user did not ask for is an expansion they cannot decline. The button makes the cost
 * theirs to spend.
 *
 * It also makes the count legible — "Show 24 more (1,203 remaining)" says something about the result
 * set that an infinite scroll never does.
 *
 * The `fe-result-grid__more*` classes already exist in `ui-styles` for exactly this; nothing new is
 * authored here.
 *
 * **The window resets whenever the result set changes identity.** The engine hands back a fresh array
 * per recompute, so watching `results` is the whole mechanism: apply a filter after paging deep into
 * the previous set and the grid returns to the first page, which is what "these are different results"
 * should look like.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { computed, ref, watch } from 'vue';

import WineCard from './WineCard.vue';

const props = defineProps<{
	results: readonly Wine[];
}>();

/** How many cards to add per "show more". Matches the React grid's page size. */
const PAGE_SIZE = 24;

const visibleCount = ref<number>(PAGE_SIZE);

// Identity, not length: two different filters can yield the same count, and the user is still looking
// at a different set of wines.
watch(
	() => props.results,
	() => {
		visibleCount.value = PAGE_SIZE;
	},
);

const visible = computed(() => props.results.slice(0, visibleCount.value));
const hasMore = computed(() => props.results.length > visibleCount.value);

/** How many the next click reveals — the last page is usually short. */
const nextBatch = computed(() => Math.min(PAGE_SIZE, props.results.length - visibleCount.value));

/** How many stay hidden after that. */
const remaining = computed(() => props.results.length - visibleCount.value);

/** Reveal the next page. */
function showMore(): void {
	visibleCount.value += PAGE_SIZE;
}
</script>

<template>
	<div v-if="results.length === 0" class="fe-result-grid__empty">
		<p class="fe-result-grid__empty-title">No wines match these filters</p>
		<p class="fe-result-grid__empty-hint">
			Predictive disable should have prevented this — if you reached it, a filter combination slipped
			through. Clear a filter to continue.
		</p>
	</div>

	<template v-else>
		<div aria-label="Wine results" class="fe-result-grid" role="list">
			<WineCard v-for="wine in visible" :key="wine.id" :wine="wine" />
		</div>

		<div v-if="hasMore" class="fe-result-grid__more">
			<button class="fe-result-grid__more-btn" type="button" @click="showMore">
				Show {{ nextBatch.toLocaleString() }} more
				<span class="fe-result-grid__more-rest">({{ remaining.toLocaleString() }} remaining)</span>
			</button>
		</div>
	</template>
</template>
