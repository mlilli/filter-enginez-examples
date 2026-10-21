<script lang="ts">
	/**
	 * `<ResultGrid>` — the book result cards, in the shared infinite-scroll grid.
	 *
	 * @remarks
	 * `<WindowedResultGrid>` over `<BookCard>`, with the books copy (`RESULT_COPY.books`): the window,
	 * growth, cap notice, labelled scroller and empty state every app's books grid shares.
	 */

	import type { Book } from '@filter-enginez/mock-data/books';

	import WindowedResultGrid from '$lib/controls/WindowedResultGrid.svelte';

	import BookCard from './BookCard.svelte';

	interface Props {
		/** The current filtered result set. */
		readonly results: readonly Book[];
	}

	const { results }: Props = $props();
</script>

<WindowedResultGrid dataset="books" {results}>
	{#snippet card(book: Book)}
		<BookCard {book} />
	{/snippet}
</WindowedResultGrid>
