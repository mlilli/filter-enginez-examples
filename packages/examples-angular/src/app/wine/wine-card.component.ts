/**
 * `<fe-wine-card>` — one result card.
 *
 * @remarks
 * Presentational only: no engine, no DI, one input, rendering over the shared `fe-wine-card*` classes
 * in `ui-styles`. The same contract `<fe-listing-card>` and `<fe-book-card>` hold.
 *
 * The color swatch is an inline `background`, and that is the one deliberate exception to "styling
 * lives in `ui-styles`". Six wine colors would otherwise be six modifier classes whose only content
 * is a hex value, and the swatch is DATA — it names the wine's color rather than styling the card.
 * `role="img"` with the color's name is what keeps it from being a decorative square to a screen
 * reader.
 *
 * The vintage goes through the shared `formatVintage`, so a non-vintage bottle reads `NV` rather than
 * the placeholder year the corpus stores for it, exactly as on every other app's card.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatVintage } from '@filter-enginez/examples-shared/wine-domain';

/** Swatch fills, matching every other vertical's card. */
const COLOR_CHIP: Record<Wine['color'], string> = {
	dessert: '#A16207',
	fortified: '#451A03',
	red: '#7F1D1D',
	rosé: '#FCA5A5',
	sparkling: '#FDE68A',
	white: '#FEF3C7',
};

/** At most this many notes — the card is a summary, and the full list runs to a dozen. */
const VISIBLE_NOTE_CAP = 4;

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-wine-card',
	template: `
		<article class="fe-wine-card" role="listitem">
			<div class="fe-wine-card__top">
				<div class="fe-wine-card__meta">
					<span
						class="fe-wine-card__color"
						role="img"
						[attr.aria-label]="wine().color + ' wine'"
						[style.background]="swatch()"
						[attr.title]="wine().color"
					></span>
					<span class="fe-wine-card__vintage">{{ vintageLabel() }}</span>
				</div>
				<div class="fe-wine-card__points" title="Wine Enthusiast points">
					{{ wine().points }} pts
				</div>
			</div>

			<div>
				<h3 class="fe-wine-card__name">{{ wine().name }}</h3>
				<p class="fe-wine-card__winery">{{ wine().winery }}</p>
			</div>

			<p class="fe-wine-card__origin">{{ originBreadcrumb() }}</p>

			<div class="fe-wine-card__attrs">
				<span class="fe-wine-card__varietal">{{ wine().varietal }}</span>
				<span class="fe-wine-card__sep">·</span>
				<span>{{ wine().body }}</span>
				<span class="fe-wine-card__sep">·</span>
				<span>{{ wine().sweetness }}</span>
			</div>

			@if (visibleNotes().length > 0) {
				<div class="fe-wine-card__notes">
					@for (note of visibleNotes(); track note) {
						<span class="fe-wine-card__note">{{ note }}</span>
					}
				</div>
			}

			<div class="fe-wine-card__bottom">
				<span class="fe-wine-card__price">\${{ wine().priceUsd.toFixed(2) }}</span>
				<span class="fe-wine-card__abv">{{ wine().abv.toFixed(1) }}% abv</span>
			</div>
		</article>
	`,
})
export class WineCardComponent {
	public readonly wine = input.required<Wine>();

	/** The vintage as printed: the year, or `NV` for a non-vintage bottle. */
	protected readonly vintageLabel = computed(() => formatVintage(this.wine().vintage));

	/** The swatch fill for this wine's color. */
	protected readonly swatch = computed(() => COLOR_CHIP[this.wine().color]);

	/** Country · province · region · subregion, with empty levels dropped. */
	protected readonly originBreadcrumb = computed(() => {
		const { country, province, region, subregion } = this.wine().origin;

		return [country, province, region, subregion].filter((part) => part.length > 0).join(' · ');
	});

	/** At most {@link VISIBLE_NOTE_CAP} notes. */
	protected readonly visibleNotes = computed(() =>
		this.wine().tastingNotes.slice(0, VISIBLE_NOTE_CAP),
	);
}
