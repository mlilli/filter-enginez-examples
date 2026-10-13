/**
 * `<RealEstateCard />` — renders one `Listing` record as a compact card. Real-estate-domain
 * presentational, shared across the example apps (the mirror of `BooksCard` / `WineCard`).
 *
 * @remarks
 * Card anatomy:
 *
 *   ┌─────────────────────────────────┐
 *   │ [single-family]        active    │
 *   │ $1,250,000                       │
 *   │ 123 Main St (h3)                 │
 *   │ Marina · San Francisco, CA       │
 *   │ 3 bd · 2 ba · 1,800 sqft         │
 *   │ [pool] [garage] [view water]     │
 *   │ 0.25 acres          Built 1998   │
 *   └─────────────────────────────────┘
 *
 * Cyan accents apply to data affordances (the property-type chip, the price). Styling is the
 * `fe-listing-card*` classes in `@filter-enginez/ui-styles`. Memoized — `listing` refs are stable
 * across renders, so a card only re-renders when its own listing changes.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { memo } from 'react';

import { formatListingPrice, humanizeVocabularyValue } from './real-estate-domain/formatters.js';

/** Max feature chips shown before truncating (keeps card height bounded). */
const MAX_FEATURE_CHIPS = 4;

/** Price formatter — whole-dollar USD (`$1,250,000`). */
/**
 * Props for `<RealEstateCard />`.
 */
export interface RealEstateCardProps {
	readonly listing: Listing;
}

/**
 * One listing card.
 */
const RealEstateCardInner = ({ listing }: RealEstateCardProps): React.ReactElement => {
	const location = `${listing.neighborhood} · ${listing.city}, ${listing.state}`;
	const meta = `${listing.bedrooms} bd · ${listing.bathrooms} ba · ${listing.squareFeet.toLocaleString()} sqft`;

	return (
		<article role="listitem" className="fe-listing-card">
			{/* Top row: property type + listing status */}
			<div className="fe-listing-card__top">
				<span className="fe-listing-card__type">{humanizeVocabularyValue(listing.propertyType)}</span>
				<span className="fe-listing-card__status" title="Listing status">{humanizeVocabularyValue(listing.status)}</span>
			</div>

			{/* Price — the headline data affordance */}
			<p className="fe-listing-card__price">{formatListingPrice(listing.priceUsd)}</p>

			{/* Address + location */}
			<div>
				<h3 className="fe-listing-card__title">{listing.addressLine1}</h3>
				<p className="fe-listing-card__location" title={location}>{location}</p>
			</div>

			{/* Beds · baths · square feet */}
			<p className="fe-listing-card__meta">{meta}</p>

			{/* Features — first few max */}
			{listing.features.length > 0 && (
				<div className="fe-listing-card__features">
					{listing.features.slice(0, MAX_FEATURE_CHIPS).map((feature) => (
						<span key={feature} className="fe-listing-card__feature">{humanizeVocabularyValue(feature)}</span>
					))}
				</div>
			)}

			{/* Bottom: lot size + year built */}
			<div className="fe-listing-card__bottom">
				<span className="fe-listing-card__lot">{listing.lotSizeAcres.toLocaleString()} acres</span>
				<span className="fe-listing-card__built">Built {listing.yearBuilt}</span>
			</div>
		</article>
	);
};


/**
 * Memoized public export — `listing` refs are stable across renders, so a card only re-renders when
 * its own listing changes, not when a sibling filter churns the result set.
 */
export const RealEstateCard = memo(RealEstateCardInner);
