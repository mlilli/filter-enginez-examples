<script lang="ts">
	/**
	 * `<BookCard>` — renders one `Book` record as a compact card. The Svelte port of
	 * `examples-shared`'s `BooksCard`, reusing the `fe-book-card*` classes verbatim.
	 *
	 * Card anatomy: genre + pub. year row → title + authors → format · language · in-print →
	 * subject chips (first 4) → rating + page count. Cyan accents apply to data affordances (rating,
	 * page count). Field reads are defensive so a partially-shaped test fixture can't throw.
	 */

	import type { Book } from '@filter-enginez/mock-data/books';

	interface Props {
		/** The book to render. */
		readonly book: Book;
	}

	const { book }: Props = $props();

	const authors = $derived(book.authors ?? []);
	const subjects = $derived(book.subjects ?? []);
	const byline = $derived(authors.length > 0 ? authors.join(', ') : 'Unknown author');
	const meta = $derived(
		[book.format, book.language, book.isInPrint ? 'in print' : null]
			.filter((part): part is string => typeof part === 'string' && part.length > 0)
			.join(' · '),
	);
</script>

<article role="listitem" class="fe-book-card">
	<!-- Top row: genre + publication year -->
	<div class="fe-book-card__top">
		<span class="fe-book-card__genre">{book.genre}</span>
		<span class="fe-book-card__year" title="Publication year">{book.publicationYear}</span>
	</div>

	<!-- Title + authors -->
	<div>
		<h3 class="fe-book-card__title">{book.title}</h3>
		<p class="fe-book-card__authors">{byline}</p>
	</div>

	<!-- Format · language · availability -->
	{#if meta.length > 0}
		<p class="fe-book-card__meta">{meta}</p>
	{/if}

	<!-- Subjects — first 4 max -->
	{#if subjects.length > 0}
		<div class="fe-book-card__subjects">
			{#each subjects.slice(0, 4) as subject (subject)}
				<span class="fe-book-card__subject">{subject}</span>
			{/each}
		</div>
	{/if}

	<!-- Bottom: rating + page count -->
	<div class="fe-book-card__bottom">
		<span class="fe-book-card__rating" title="Average rating">
			{book.averageRating === null || book.averageRating === undefined
				? 'Unrated'
				: `★ ${book.averageRating.toFixed(1)}`}
		</span>
		<span class="fe-book-card__pages">{(book.pageCount ?? 0).toLocaleString()} pp</span>
	</div>
</article>
