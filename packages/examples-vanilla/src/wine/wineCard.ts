/**
 * One wine card.
 *
 * @remarks
 * The wine twin of `books/bookCard.ts` and `real-estate/listingCard.ts`, and it holds the same
 * contract all three do: purely presentational, no engine, one record in and one element out, over
 * the shared `fe-wine-card*` classes in `@filter-enginez/ui-styles`.
 *
 * `role="listitem"` is NOT set here — `results/resultsView.ts` sets it on whatever this returns, so
 * a new dataset's card cannot forget it and silently empty the list for a screen reader.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { el } from '../dom.js';

/**
 * Swatch fills, matching every other vertical's card.
 *
 * @remarks
 * Hex rather than a brand token because these are the WINES' colors, not the UI's — a rosé swatch
 * that drifted with the theme would stop describing the bottle. The same six values are inlined in
 * the other four wine cards; they belong to the dataset, not the design system.
 */
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

/**
 * Country · province · region · subregion, with empty levels dropped.
 *
 * @remarks
 * Filtering empties is what keeps a wine with no subregion from rendering a trailing separator. The
 * origin is a nested object rather than flat fields, which is the shape `buildOriginTree` walks.
 *
 * @param origin - The wine's origin.
 * @returns The breadcrumb, or an empty string when every level is blank.
 */
function originBreadcrumb(origin: Wine['origin']): string {
	const { country, province, region, subregion } = origin;

	return [country, province, region, subregion].filter((part) => part.length > 0).join(' · ');
}

/**
 * Build one wine card.
 *
 * @param wine - The record to render.
 * @returns The card element.
 */
export function wineCard(wine: Wine): HTMLElement {
	return el('article', {
		children: [
			el('div', {
				children: [
					el('div', {
						children: [
							// `role="img"` + an accessible name, because the swatch carries the color and a
							// bare colored span states it to sighted users only. The dual-accent contract
							// forbids color as the sole carrier of meaning; here the meaning IS a color, so
							// the name is what makes it perceivable.
							el('span', {
								attrs: { 'aria-label': `${wine.color} wine`, role: 'img', title: wine.color },
								className: 'fe-wine-card__color',
								style: { background: COLOR_CHIP[wine.color] },
							}),
							el('span', { className: 'fe-wine-card__vintage', text: String(wine.vintage) }),
						],
						className: 'fe-wine-card__meta',
					}),
					el('div', {
						attrs: { title: 'Wine Enthusiast points' },
						className: 'fe-wine-card__points',
						text: `${String(wine.points)} pts`,
					}),
				],
				className: 'fe-wine-card__top',
			}),
			el('div', {
				children: [
					el('h3', { className: 'fe-wine-card__name', text: wine.name }),
					el('p', { className: 'fe-wine-card__winery', text: wine.winery }),
				],
			}),
			el('p', { className: 'fe-wine-card__origin', text: originBreadcrumb(wine.origin) }),
			el('div', {
				children: [
					el('span', { className: 'fe-wine-card__varietal', text: wine.varietal }),
					el('span', { className: 'fe-wine-card__sep', text: '·' }),
					el('span', { text: wine.body }),
					el('span', { className: 'fe-wine-card__sep', text: '·' }),
					el('span', { text: wine.sweetness }),
				],
				className: 'fe-wine-card__attrs',
			}),
			// Each note is its own element rather than a joined string — they render as separate chips,
			// and concatenating them is how the books card once ran two genres together with no gap.
			...(wine.tastingNotes.length > 0
				? [
					el('div', {
						children: wine.tastingNotes
							.slice(0, VISIBLE_NOTE_CAP)
							.map((note) => el('span', { className: 'fe-wine-card__note', text: note })),
						className: 'fe-wine-card__notes',
					}),
				]
				: []),
			el('div', {
				children: [
					el('span', {
						className: 'fe-wine-card__price',
						text: `$${wine.priceUsd.toFixed(2)}`,
					}),
					el('span', { className: 'fe-wine-card__abv', text: `${wine.abv.toFixed(1)}% abv` }),
				],
				className: 'fe-wine-card__bottom',
			}),
		],
		className: 'fe-wine-card',
	});
}
