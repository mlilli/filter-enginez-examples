/**
 * `<fe-listing-card>` — one property listing, at visual parity with the other five verticals.
 *
 * @remarks
 * Presentational only: no engine, no DI, one input. It renders over the shared `fe-listing-card*`
 * classes in `ui-styles`, so all six grids are pixel-identical over one corpus — which is the
 * comparison these apps exist to make. Not one line of CSS here; the shared classes style the card
 * completely.
 *
 * `role="listitem"` is on the `<article>` because the grid that renders it is a `role="list"`; an
 * `<article>` is not implicitly a list item, so without this the list announces as empty.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
	formatListingPrice,
	humanizeVocabularyValue,
} from '@filter-enginez/examples-shared/real-estate-domain';

/**
 * Feature chips shown before the list is cut off.
 *
 * @remarks
 * The card is a fixed-rhythm flex column inside an auto-fill grid track, so an unbounded chip row
 * would push `__bottom` out of alignment with every neighboring card. Four fits one line at the
 * 280px minimum track.
 */
const MAX_FEATURE_CHIPS = 4;

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-listing-card',
	template: `
		<article role="listitem" class="fe-listing-card">
			<div class="fe-listing-card__top">
				<span class="fe-listing-card__type">{{ humanize(listing().propertyType) }}</span>
				<span class="fe-listing-card__status" title="Listing status">
					{{ humanize(listing().status) }}
				</span>
			</div>

			<p class="fe-listing-card__price">{{ formatPrice(listing().priceUsd) }}</p>

			<div>
				<h3 class="fe-listing-card__title">{{ listing().addressLine1 }}</h3>
				<!-- title because the location line is truncated with an ellipsis: the neighborhood is the
				     part most likely to be cut, and it is the part the user filtered on. -->
				<p class="fe-listing-card__location" [attr.title]="location()">{{ location() }}</p>
			</div>

			<p class="fe-listing-card__meta">{{ meta() }}</p>

			@if (features().length > 0) {
				<div class="fe-listing-card__features">
					@for (feature of features(); track feature) {
						<span class="fe-listing-card__feature">{{ humanize(feature) }}</span>
					}
				</div>
			}

			<div class="fe-listing-card__bottom">
				<span class="fe-listing-card__lot">{{ listing().lotSizeAcres.toLocaleString() }} acres</span>
				<span class="fe-listing-card__built">Built {{ listing().yearBuilt }}</span>
			</div>
		</article>
	`,
})
export class ListingCardComponent {
	/** The listing to render. */
	public readonly listing = input.required<Listing>();

	/** Shared kebab-to-words display convention. Bound, so the card cannot grow a local variant. */
	protected readonly humanize = humanizeVocabularyValue;

	/** Shared whole-dollar USD formatter. Bound for the same reason as {@link humanize}. */
	protected readonly formatPrice = formatListingPrice;

	/** Neighborhood first — it is the finest-grained thing the location facet filters on. */
	protected readonly location = computed<string>(() => {
		const listing = this.listing();

		return `${listing.neighborhood} · ${listing.city}, ${listing.state}`;
	});

	/** The beds / baths / area line. */
	protected readonly meta = computed<string>(() => {
		const listing = this.listing();

		return `${listing.bedrooms} bd · ${listing.bathrooms} ba · ${listing.squareFeet.toLocaleString()} sqft`;
	});

	/** The feature chips that fit — see {@link MAX_FEATURE_CHIPS}. */
	protected readonly features = computed<readonly string[]>(() =>
		this.listing().features.slice(0, MAX_FEATURE_CHIPS),
	);
}
