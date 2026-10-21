<script lang="ts" generics="T extends { readonly id: string }">
	/**
	 * `<WindowedResultGrid>` — the infinite-scroll card grid every dataset's results column renders.
	 *
	 * @remarks
	 * Render `results.slice(0, renderLimit)`, grow the limit by one batch each time the sentinel under
	 * the last card scrolls into view (an `IntersectionObserver` rooted on the scroller), stop at the
	 * cap, and go back to the first batch whenever the result set's identity changes. The window
	 * (`RESULT_GRID_WINDOW`), its growth (`nextRenderLimit`), the cap test (`isRenderCapped`) and every
	 * word the column says (`RESULT_COPY[dataset]`, `resultCapNotice`) come from
	 * `@filter-enginez/examples-shared/verticals`, so all three datasets here, and all six apps, page
	 * and read the same.
	 *
	 * **Windowed on purpose.** The wine tier is 150,000 rows and an unfiltered result set is most of
	 * them; one card per match would build hundreds of thousands of DOM nodes and lock the tab, which
	 * reads as a slow engine when the engine answered in milliseconds and the cost is all paint.
	 *
	 * **The reset is the subtle half.** After a filter narrows the results, a window still sitting deep
	 * in the old set would render a page the user never scrolled to, or slice past the end of the new
	 * one.
	 *
	 * Generic over the record, with the card as a snippet, so the paging logic (a render limit, a cap,
	 * an observer whose callback reads the current length, and a reset keyed on identity) has one copy
	 * for books, wine and real estate.
	 */

	import type { Snippet } from 'svelte';

	import {
		isRenderCapped,
		nextRenderLimit,
		RESULT_COPY,
		RESULT_GRID_WINDOW,
		resultCapNotice,
		type ResultDataset,
	} from '@filter-enginez/examples-shared/verticals';

	interface Props {
		/** Renders one result as a card (an element with `role="listitem"`). */
		readonly card: Snippet<[T]>;
		/** Which dataset's copy the column reads. */
		readonly dataset: ResultDataset;
		/** The current filtered result set. */
		readonly results: readonly T[];
	}

	const { card, dataset, results }: Props = $props();

	const copy = $derived(RESULT_COPY[dataset]);

	let renderLimit = $state<number>(RESULT_GRID_WINDOW.initial);
	let scrollerEl = $state<HTMLDivElement | null>(null);
	let sentinelEl = $state<HTMLDivElement | null>(null);

	const renderedCount = $derived(Math.min(renderLimit, results.length, RESULT_GRID_WINDOW.cap));
	const visible = $derived(results.slice(0, renderedCount));
	const isCapped = $derived(isRenderCapped(renderedCount, results.length));
	const capNotice = $derived(resultCapNotice(renderedCount, results.length));

	// Back to the first batch, scrolled to the top, whenever the result set changes identity (every
	// recompute hands over a fresh array). Reading `results` is what registers the dependency.
	$effect(() => {
		void results;
		renderLimit = RESULT_GRID_WINDOW.initial;
		if (scrollerEl !== null) {
			scrollerEl.scrollTop = 0;
		}
	});

	// Grow the window when the sentinel nears the scroller's visible end. Re-created when the result
	// set changes, so the callback reads the current length. Guarded for jsdom and SSR, which have no
	// `IntersectionObserver`.
	$effect(() => {
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
				renderLimit = nextRenderLimit(renderLimit, total);
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
		<p class="fe-result-grid__empty-title">{copy.emptyTitle}</p>
		<p class="fe-result-grid__empty-hint">{copy.emptyHint}</p>
	</div>
{:else}
	<!--
		`role="group"` + `tabindex="0"` on the scroller: a scrollable region holding no focusable element
		is unreachable by keyboard, so a keyboard user could not page through the results at all. The
		cards are articles, not links or buttons, so the container itself is the stop (WCAG 2.1.1), as
		react-ui's `<ScrollRegion>` makes it. `aria-label` gives the stop something to announce.

		The compiler rule reads a nonnegative tabindex on a non-widget role as a mistake, and usually it
		is; not when the element scrolls.
	-->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="fe-result-grid__scroller"
		role="group"
		aria-label={copy.scrollerLabel}
		tabindex="0"
		bind:this={scrollerEl}
	>
		<div role="list" aria-label={copy.listLabel(results.length)} class="fe-result-grid">
			{#each visible as item (item.id)}
				{@render card(item)}
			{/each}
		</div>
		<div bind:this={sentinelEl} aria-hidden="true" style="height: 1px;"></div>
		{#if isCapped}
			<p class="fe-result-grid__cap-notice">
				Showing <span class="fe-result-grid__cap-shown">{capNotice.rendered}</span> of
				<span class="fe-result-grid__cap-total">{capNotice.total}</span>
				{capNotice.suffix}
			</p>
		{/if}
	</div>
{/if}
