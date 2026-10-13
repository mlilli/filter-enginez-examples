<script lang="ts">
	/**
	 * `<RealEstateResultGrid>` — incremental "load more" grid of `<ListingCard>` for the current result
	 * set.
	 *
	 * @remarks
	 * The books grid's strategy, not wine's: render `results.slice(0, renderLimit)`, expand the limit
	 * when an `IntersectionObserver` reports the bottom sentinel entering the scroller, and cap at
	 * `HARD_CAP_RENDER`. React's real-estate grid explicitly mirrors its books one for the same reason —
	 * a listing grid is browsed by scrolling, and a "Show 60 more" button interrupts that with a click
	 * per page. Wine's button exists because its worker tier makes each expansion expensive enough to be
	 * worth asking about.
	 *
	 * The render limit resets whenever the result set's IDENTITY changes, so a filter change puts the
	 * user back at the first page rather than 900 cards into a set that no longer exists.
	 */

	import type { Listing } from '@filter-enginez/mock-data/real-estate';

	import ListingCard from './ListingCard.svelte';

	interface Props {
		/** The current filtered result set. */
		readonly results: readonly Listing[];
	}

	const { results }: Props = $props();

	/** First page of cards shown before the user scrolls. */
	const INITIAL_BATCH = 60;
	/** Page size for each subsequent sentinel trigger. */
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
		<p class="fe-result-grid__empty-title">No listings match the current filters.</p>
		<p class="fe-result-grid__empty-hint">
			Try widening the price range or the search radius, or clearing a location.
		</p>
	</div>
{:else}
	<!--
		`role="group"` + `tabindex="0"` on the scroller: a scrollable region holding no focusable
		element is unreachable by keyboard, so a keyboard user cannot page through the results at all.
		The cards are articles, not links or buttons — there is deliberately nothing tabbable inside —
		so the container itself has to be the stop. This is what react-ui's `<ScrollRegion>` wraps.

		The compiler rule reads a nonnegative tabindex on a non-widget role as a mistake, and usually it
		is: making decorative content focusable adds a stop that announces nothing. It is not a mistake
		when the element SCROLLS, which is why WCAG 2.1.1 requires exactly this, and why the React
		preset carries a standing jsx-a11y allowance for `role="group"`. `aria-label` gives the stop
		something to announce, so it is not a silent tab stop either.
	-->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="fe-result-grid__scroller"
		role="group"
		aria-label="Listing results"
		tabindex="0"
		bind:this={scrollerEl}
	>
		<div role="list" aria-label="{results.length.toLocaleString()} matching listings" class="fe-result-grid">
			{#each visible as listing (listing.id)}
				<ListingCard {listing} />
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
