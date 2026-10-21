<script setup lang="ts">
/**
 * `<WineResultGrid>` — the wine call site of the generic `<ResultGrid>` control.
 *
 * @remarks
 * The same infinite-scroll grid as books and real estate, and as every other app's wine page: 60 cards
 * first, 60 more each time the end of the grid scrolls into view, 1,500 at most, with the shared
 * `RESULT_COPY.wine` words. All of that lives in `../controls/ResultGrid.vue`; what is wine's about a
 * grid of wines is the dataset key and a card component.
 *
 * Growing the grid costs paint, not engine work: the result set is already on this thread, so a
 * longer slice crosses no worker boundary.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import ResultGrid from '../controls/ResultGrid.vue';
import WineCard from './WineCard.vue';

defineProps<{
	/** The current filtered result set. */
	results: readonly Wine[];
}>();
</script>

<template>
	<ResultGrid dataset="wine" :item-key="(wine: Wine) => wine.id" :results="results">
		<template #item="{ item }">
			<WineCard :wine="item" />
		</template>
	</ResultGrid>
</template>
