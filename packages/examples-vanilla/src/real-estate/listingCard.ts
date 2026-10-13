/**
 * `real-estate/listingCard` — one property listing, hand-built.
 *
 * @remarks
 * The framework-less port of Vue's `<ListingCard>`, React's `<RealEstateCard />` and the Svelte
 * component of the same name. Purely presentational over the shared `fe-listing-card*` classes, so all
 * six grids are pixel-identical over one corpus — the comparison the six demo apps exist to make.
 * Not one line of CSS lives here; the card was fully styled before any grid rendered it.
 *
 * `role="listitem"` is deliberately NOT set here. `results/resultsView.ts` sets it on whatever a
 * `renderCard` callback returns, so a new dataset's card cannot forget it and silently empty the list
 * for a screen reader.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { el } from '@filter-enginez/examples-shared/dom';
import {
	formatListingPrice,
	humanizeVocabularyValue,
} from '@filter-enginez/examples-shared/real-estate-domain';

/**
 * Feature chips shown before the list is cut off.
 *
 * @remarks
 * The card is a fixed-rhythm flex column inside an auto-fill grid track, so an unbounded chip row
 * would push `__bottom` out of alignment with every neighboring card. Four fits one line at the 280px
 * minimum track — the same cap every other vertical applies.
 */
const MAX_FEATURE_CHIPS = 4;

/**
 * Build one listing card.
 *
 * @param listing - The listing to render.
 * @returns The card element, ready for the results grid.
 */
export function listingCard(listing: Listing): HTMLElement {
	const location = `${listing.neighborhood} · ${listing.city}, ${listing.state}`;
	const features = listing.features.slice(0, MAX_FEATURE_CHIPS);

	return el('article', {
		children: [
			el('div', {
				children: [
					el('span', {
						className: 'fe-listing-card__type',
						text: humanizeVocabularyValue(listing.propertyType),
					}),
					el('span', {
						attrs: { title: 'Listing status' },
						className: 'fe-listing-card__status',
						text: humanizeVocabularyValue(listing.status),
					}),
				],
				className: 'fe-listing-card__top',
			}),
			el('p', {
				className: 'fe-listing-card__price',
				text: formatListingPrice(listing.priceUsd),
			}),
			el('div', {
				children: [
					el('h3', { className: 'fe-listing-card__title', text: listing.addressLine1 }),
					// `title` because the location line truncates with an ellipsis: the neighborhood is the
					// part most likely to be cut, and it is the part the user filtered on.
					el('p', {
						attrs: { title: location },
						className: 'fe-listing-card__location',
						text: location,
					}),
				],
			}),
			el('p', {
				className: 'fe-listing-card__meta',
				text: `${listing.bedrooms} bd · ${listing.bathrooms} ba · ${listing.squareFeet.toLocaleString()} sqft`,
			}),
			// Each feature is its OWN element, never a joined string — they render as separate chips, and
			// concatenating them is exactly how two book genres once ran together with no gap.
			features.length > 0
			&& el('div', {
				children: features.map((feature) =>
					el('span', {
						className: 'fe-listing-card__feature',
						text: humanizeVocabularyValue(feature),
					}),
				),
				className: 'fe-listing-card__features',
			}),
			el('div', {
				children: [
					el('span', {
						className: 'fe-listing-card__lot',
						text: `${listing.lotSizeAcres.toLocaleString()} acres`,
					}),
					el('span', {
						className: 'fe-listing-card__built',
						text: `Built ${String(listing.yearBuilt)}`,
					}),
				],
				className: 'fe-listing-card__bottom',
			}),
		],
		className: 'fe-listing-card',
	});
}
