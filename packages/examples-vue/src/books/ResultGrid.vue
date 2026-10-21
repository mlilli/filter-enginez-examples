<script setup lang="ts">
/**
 * `<ResultGrid>` (books) — the books call site of the generic `<ResultGrid>` control.
 *
 * @remarks
 * All the paging machinery — the shared render window, the bottom-sentinel `IntersectionObserver`,
 * the reset on result identity — and the shared `RESULT_COPY.books` words live in
 * `../controls/ResultGrid.vue`, shared by every dataset. What is books' about a grid of books is the
 * dataset key and a card component, so that is all this file is.
 */
import type { Book } from '@filter-enginez/mock-data/books';

import ResultGrid from '../controls/ResultGrid.vue';
import BookCard from './BookCard.vue';

defineProps<{
	/** The current filtered result set. */
	results: readonly Book[];
}>();
</script>

<template>
	<ResultGrid dataset="books" :item-key="(book: Book) => book.id" :results="results">
		<template #item="{ item }">
			<BookCard :book="item" />
		</template>
	</ResultGrid>
</template>
