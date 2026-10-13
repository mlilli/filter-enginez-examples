<script setup lang="ts">
/**
 * `<ResultGrid>` (books) — the books call site of the generic `<ResultGrid>` control.
 *
 * @remarks
 * All the paging machinery — render limit, hard cap, the bottom-sentinel `IntersectionObserver`, the
 * reset on result identity — lives in `../controls/ResultGrid.vue`, shared by every dataset. What is
 * books' about a grid of books turns out to be three strings and a card component, so that is all this
 * file is.
 */
import type { Book } from '@filter-enginez/mock-data/books';

import { computed } from 'vue';

import ResultGrid from '../controls/ResultGrid.vue';
import BookCard from './BookCard.vue';

const props = defineProps<{
	/** The current filtered result set. */
	results: readonly Book[];
}>();

const listLabel = computed(() => `${props.results.length.toLocaleString()} matching books`);
</script>

<template>
	<ResultGrid
		:list-label="listLabel"
		empty-hint="Try widening the publication-year range or clearing a genre."
		empty-title="No books match the current filters."
		:item-key="(book: Book) => book.id"
		:results="results"
		scroll-region-label="Book results"
	>
		<template #item="{ item }">
			<BookCard :book="item" />
		</template>
	</ResultGrid>
</template>
