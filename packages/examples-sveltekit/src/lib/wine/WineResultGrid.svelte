<script lang="ts">
	/**
	 * `<WineResultGrid>` — the wine result cards, windowed.
	 *
	 * @remarks
	 * **Windowed on purpose.** The wine corpus is 150,000 rows and an unfiltered result set is most of
	 * them. Rendering every match would build hundreds of thousands of DOM nodes and lock the tab —
	 * which would look like the ENGINE being slow, when the engine answered in milliseconds and the
	 * cost is entirely in the paint. So the grid renders a page at a time and grows on demand.
	 *
	 * That window resets whenever the result set changes: after a filter narrows the corpus, showing
	 * page 4 of a list that now has two entries would render an empty grid over a non-zero count.
	 */

	import type { Wine } from '@filter-enginez/mock-data/wine';

	import WineCard from './WineCard.svelte';

	const { results }: { results: readonly Wine[] } = $props();

	/** How many cards to add per "show more". Matches the React grid's page size. */
	const PAGE_SIZE = 24;

	let visibleCount = $state(PAGE_SIZE);

	// Reset the window whenever the underlying result set changes identity. Reading `results` is what
	// registers the dependency; the engine hands us a fresh array per recompute.
	$effect(() => {
		void results;
		visibleCount = PAGE_SIZE;
	});

	const visible = $derived(results.slice(0, visibleCount));
	const hasMore = $derived(results.length > visibleCount);
</script>

{#if results.length === 0}
	<div class="fe-result-grid__empty">
		<p class="fe-result-grid__empty-title">No wines match these filters</p>
		<p class="fe-result-grid__empty-hint">
			Predictive disable should have prevented this — if you reached it, a filter combination slipped
			through. Clear a filter to continue.
		</p>
	</div>
{:else}
	<div class="fe-result-grid" role="list" aria-label="Wine results">
		{#each visible as wine (wine.id)}
			<WineCard {wine} />
		{/each}
	</div>

	{#if hasMore}
		<div class="fe-result-grid__more">
			<button
				type="button"
				class="fe-result-grid__more-btn"
				onclick={() => {
					visibleCount += PAGE_SIZE;
				}}
			>
				Show {Math.min(PAGE_SIZE, results.length - visibleCount).toLocaleString()} more
				<span class="fe-result-grid__more-rest">
					({(results.length - visibleCount).toLocaleString()} remaining)
				</span>
			</button>
		</div>
	{/if}
{/if}
