<script lang="ts">
	/**
	 * `<WineResultGrid>` — the wine result cards, in the shared infinite-scroll grid.
	 *
	 * @remarks
	 * `<WindowedResultGrid>` over `<WineCard>`, with the wine copy (`RESULT_COPY.wine`): the same window,
	 * growth, cap notice, labelled scroller and empty state as the books and real-estate grids and as
	 * every other app's wine grid. On the 150,000-wine tier the window is what keeps the tab alive; see
	 * that component.
	 */

	import type { Wine } from '@filter-enginez/mock-data/wine';

	import WindowedResultGrid from '$lib/controls/WindowedResultGrid.svelte';

	import WineCard from './WineCard.svelte';

	const { results }: { results: readonly Wine[] } = $props();
</script>

<WindowedResultGrid dataset="wine" {results}>
	{#snippet card(wine: Wine)}
		<WineCard {wine} />
	{/snippet}
</WindowedResultGrid>
