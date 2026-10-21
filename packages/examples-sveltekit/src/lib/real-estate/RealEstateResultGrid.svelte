<script lang="ts">
	/**
	 * `<RealEstateResultGrid>` — the listing cards, in the shared infinite-scroll grid.
	 *
	 * @remarks
	 * `<WindowedResultGrid>` over `<ListingCard>`, with the real-estate copy
	 * (`RESULT_COPY['real-estate']`): the window, growth, cap notice, labelled scroller and empty state
	 * every app's listing grid shares. A listing grid is browsed by scrolling, so it grows as the end of
	 * the grid scrolls into view rather than behind a button.
	 */

	import type { Listing } from '@filter-enginez/mock-data/real-estate';

	import WindowedResultGrid from '$lib/controls/WindowedResultGrid.svelte';

	import ListingCard from './ListingCard.svelte';

	interface Props {
		/** The current filtered result set. */
		readonly results: readonly Listing[];
	}

	const { results }: Props = $props();
</script>

<WindowedResultGrid dataset="real-estate" {results}>
	{#snippet card(listing: Listing)}
		<ListingCard {listing} />
	{/snippet}
</WindowedResultGrid>
