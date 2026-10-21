<script setup lang="ts">
/**
 * `<RealEstateResultGrid>` — the real-estate call site of the generic `<ResultGrid>` control.
 *
 * @remarks
 * The same infinite-scroll grid every dataset uses: render a batch, grow it when the bottom sentinel
 * scrolls into view, stop at the cap. That machinery and the shared `RESULT_COPY['real-estate']` words
 * live in `../controls/ResultGrid.vue`; what is real estate's about a grid of listings is the dataset
 * key and a card component, which is all this file is.
 */
import type { Listing } from '@filter-enginez/mock-data/real-estate';

import ResultGrid from '../controls/ResultGrid.vue';
import ListingCard from './ListingCard.vue';

defineProps<{
	/** The current filtered result set. */
	results: readonly Listing[];
}>();
</script>

<template>
	<ResultGrid dataset="real-estate" :item-key="(listing: Listing) => listing.id" :results="results">
		<template #item="{ item }">
			<ListingCard :listing="item" />
		</template>
	</ResultGrid>
</template>
