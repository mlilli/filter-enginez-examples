<script lang="ts">
	/**
	 * `<ResultGrid>` — incremental "load more" grid of `<BookCard>` for the current result set. The
	 * Svelte port of `examples-shared`'s `BooksResultGrid`: render `results.slice(0, renderLimit)`,
	 * expand the limit when an `IntersectionObserver` reports the bottom sentinel entering the scroller,
	 * and cap at `HARD_CAP_RENDER`. Reset to the first page whenever the result set's identity changes.
	 */

	import type { Book } from '@filter-enginez/mock-data/books';

	import BookCard from './BookCard.svelte';

	interface Props {
		/** The current filtered result set. */
		readonly results: readonly Book[];
	}

	const { results }: Props = $props();

	/** First page of cards shown before the user scrolls. */
	const INITIAL_BATCH = 60;
	/** Page size for each subsequent "load more" trigger. */
	const BATCH_INCREMENT = 60;
	/** Hard cap on cards ever rendered at once — bounds worst-case DOM cost. */
	const HARD_CAP_RENDER = 1500;

	let renderLimit = $state(INITIAL_BATCH);
	let scrollerEl = $state<HTMLDivElement | null>(null);
	let sentinelEl = $state<HTMLDivElement | null>(null);

	const renderedCount = $derived(Math.min(renderLimit, results.length, HARD_CAP_RENDER));
	const visible = $derived(results.slice(0, renderedCount));
	const isCappedShort = $derived(renderedCount >= HARD_CAP_RENDER && results.length > HARD_CAP_RENDER);

	// Reset the render limit + scroll to top whenever the result set's identity changes (a filter change
	// flips `results` to a fresh array); the user should see the new first page.
	$effect(() => {
		// Establish the dependency on the array identity.
		void results;
		renderLimit = INITIAL_BATCH;
		if (scrollerEl !== null) {
			scrollerEl.scrollTop = 0;
		}
	});

	// Bottom-sentinel intersection — expands `renderLimit` when the user scrolls near the rendered tail.
	// Guarded for non-DOM environments (jsdom / SSR) where `IntersectionObserver` is absent.
	$effect(() => {
		// Re-establish the observer when the result set changes so its callback closes over a fresh
		// length, not a stale one.
		const total = results.length;

		if (sentinelEl === null || scrollerEl === null || typeof IntersectionObserver === 'undefined') {
			return undefined;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0];

				if (entry === undefined || !entry.isIntersecting) {
					return;
				}
				renderLimit = Math.min(renderLimit + BATCH_INCREMENT, total, HARD_CAP_RENDER);
			},
			{ root: scrollerEl, rootMargin: '200px', threshold: 0 },
		);

		observer.observe(sentinelEl);

		return () => {
			observer.disconnect();
		};
	});
</script>

{#if results.length === 0}
	<div class="fe-result-grid__empty">
		<p class="fe-result-grid__empty-title">No books match the current filters.</p>
		<p class="fe-result-grid__empty-hint">Try widening the publication-year range or clearing a genre.</p>
	</div>
{:else}
	<!--
		A scrollable region holding no focusable element is unreachable by keyboard — the cards are
		articles, so there is deliberately nothing tabbable inside and the container has to be the stop
		(WCAG 2.1.1). React gets this from react-ui's `<ScrollRegion>`; the books grid here simply never
		had it, which the real-estate port surfaced by doing it correctly next door.

		The compiler rule reads a nonnegative tabindex on a non-widget role as a mistake, and usually it
		is — just not when the element scrolls. `aria-label` keeps it from being a silent tab stop.
	-->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="fe-result-grid__scroller"
		role="group"
		aria-label="Book results"
		tabindex="0"
		bind:this={scrollerEl}
	>
		<div
			role="list"
			aria-label="{results.length.toLocaleString()} matching books"
			class="fe-result-grid"
		>
			{#each visible as book (book.id)}
				<BookCard {book} />
			{/each}
		</div>
		<div bind:this={sentinelEl} aria-hidden="true" style="height: 1px;"></div>
		{#if isCappedShort}
			<p class="fe-result-grid__cap-notice">
				Showing <span class="fe-result-grid__cap-shown">{renderedCount.toLocaleString()}</span> of
				<span class="fe-result-grid__cap-total">{results.length.toLocaleString()}</span> matches ·
				narrow your filters to surface the rest
			</p>
		{/if}
	</div>
{/if}
