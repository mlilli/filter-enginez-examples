<script setup lang="ts">
/**
 * `<RealEstateResultGrid>` — the real-estate call site of the generic `<ResultGrid>` control.
 *
 * @remarks
 * The books grid's paging strategy, not wine's: render a page, expand it when the bottom sentinel
 * scrolls into view, cap the total. React's real-estate grid explicitly mirrors its books one for the
 * same reason — a listing grid is browsed by scrolling, and a "Show 60 more" button interrupts that
 * with a click per page. Wine's button exists because its worker tier makes each expansion expensive
 * enough to be worth asking about.
 *
 * All of that machinery lives in `../controls/ResultGrid.vue`, shared with books. What is real-estate's
 * about a grid of listings turns out to be four strings and a card component, which is all this file
 * is. SvelteKit carries a second full copy here; Vue's scoped slot makes that unnecessary.
 */
import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { computed } from 'vue';

import ResultGrid from '../controls/ResultGrid.vue';
import ListingCard from './ListingCard.vue';

const props = defineProps<{
	/** The current filtered result set. */
	results: readonly Listing[];
}>();

const listLabel = computed(() => `${props.results.length.toLocaleString()} matching listings`);
</script>

<template>
	<ResultGrid
		empty-hint="Try widening the price range or the search radius, or clearing a location."
		empty-title="No listings match the current filters."
		:item-key="(listing: Listing) => listing.id"
		:list-label="listLabel"
		:results="results"
		scroll-region-label="Listing results"
	>
		<template #item="{ item }">
			<ListingCard :listing="item" />
		</template>
	</ResultGrid>
</template>
