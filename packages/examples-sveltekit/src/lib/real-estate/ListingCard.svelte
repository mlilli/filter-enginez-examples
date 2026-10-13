<script lang="ts">
	/**
	 * `<ListingCard>` — one property listing, at visual parity with React's `<RealEstateCard />`.
	 *
	 * @remarks
	 * Presentational only: no engine, no stores, no context. It renders over the shared
	 * `fe-listing-card*` classes in `ui-styles`, so the React and Svelte grids are pixel-identical over
	 * one corpus — which is the comparison the six demo apps exist to make. Not one line of CSS here;
	 * the card's styling lives entirely in `ui-styles`.
	 */

	import type { Listing } from '@filter-enginez/mock-data/real-estate';

	import { formatListingPrice, humanizeVocabularyValue } from '@filter-enginez/examples-shared/real-estate-domain';

	const { listing }: { listing: Listing } = $props();

	/**
	 * Feature chips shown before the list is cut off.
	 *
	 * @remarks
	 * The card is a fixed-rhythm flex column inside an auto-fill grid track, so an unbounded chip row
	 * would push `__bottom` out of alignment with every neighboring card. Four fits one line at the
	 * 280px minimum track.
	 */
	const MAX_FEATURE_CHIPS = 4;

	const location = $derived(`${listing.neighborhood} · ${listing.city}, ${listing.state}`);
	const meta = $derived(
		`${listing.bedrooms} bd · ${listing.bathrooms} ba · ${listing.squareFeet.toLocaleString()} sqft`,
	);
	const features = $derived(listing.features.slice(0, MAX_FEATURE_CHIPS));

</script>

<article role="listitem" class="fe-listing-card">
	<div class="fe-listing-card__top">
		<span class="fe-listing-card__type">{humanizeVocabularyValue(listing.propertyType)}</span>
		<span class="fe-listing-card__status" title="Listing status">{humanizeVocabularyValue(listing.status)}</span>
	</div>

	<p class="fe-listing-card__price">{formatListingPrice(listing.priceUsd)}</p>

	<div>
		<h3 class="fe-listing-card__title">{listing.addressLine1}</h3>
		<!-- `title` because the location line is truncated with an ellipsis: the neighborhood is the
		     part most likely to be cut, and it is the part the user filtered on. -->
		<p class="fe-listing-card__location" title={location}>{location}</p>
	</div>

	<p class="fe-listing-card__meta">{meta}</p>

	{#if features.length > 0}
		<div class="fe-listing-card__features">
			{#each features as feature (feature)}
				<span class="fe-listing-card__feature">{humanizeVocabularyValue(feature)}</span>
			{/each}
		</div>
	{/if}

	<div class="fe-listing-card__bottom">
		<span class="fe-listing-card__lot">{listing.lotSizeAcres.toLocaleString()} acres</span>
		<span class="fe-listing-card__built">Built {listing.yearBuilt}</span>
	</div>
</article>
