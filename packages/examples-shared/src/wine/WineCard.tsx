/**
 * `<WineCard />` — renders one `Wine` record as a compact card. Wine-domain presentational,
 * shared across the example apps.
 *
 * @remarks
 * Card anatomy:
 *
 *   ┌─────────────────────────────────┐
 *   │ [color chip]  Vintage · Points  │
 *   │ Wine name (h3)                  │
 *   │ Winery name (subdued)           │
 *   │ Origin breadcrumb (mono)        │
 *   │ Varietal · Body · Sweetness     │
 *   │ Tasting notes (chip row)        │
 *   │ Price · ABV                     │
 *   └─────────────────────────────────┘
 *
 * Cyan accents apply to data-affordances (the points badge, the price). Styling is the
 * `fe-wine-card*` classes in `@filter-enginez/ui-styles`; only the color-chip swatch (which varies
 * per wine color) is inline. The card is memoized — `wine` refs are stable across renders (corpus
 * objects), so a card only re-renders when its own wine changes.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { memo } from 'react';

import { formatVintage } from './wine-domain/vintage.js';

/**
 * Props for `<WineCard />`.
 */
export interface WineCardProps {
	readonly wine: Wine;
}

/**
 * Map wine color enum → CSS color hex for the color-chip swatch. Approximations of real wine
 * color, not colorimetric references — the chip is a UX affordance.
 *
 * @internal
 */
const COLOR_CHIP: Record<Wine['color'], string> = {
	dessert: '#A16207',
	fortified: '#451A03',
	red: '#7F1D1D',
	rosé: '#FCA5A5',
	sparkling: '#FDE68A',
	white: '#FEF3C7',
};

/**
 * One wine card.
 */
const WineCardInner = ({ wine }: WineCardProps): React.ReactElement => {
	const colorChip = COLOR_CHIP[wine.color];
	const originBreadcrumb = [
		wine.origin.country,
		wine.origin.province,
		wine.origin.region,
		wine.origin.subregion,
	].filter((p) => p.length > 0).join(' · ');

	return (
		<article role="listitem" className="fe-wine-card">
			{/* Top row: color chip + vintage + points */}
			<div className="fe-wine-card__top">
				<div className="fe-wine-card__meta">
					<span
						role="img"
						aria-label={`${wine.color} wine`}
						title={wine.color}
						className="fe-wine-card__color"
						style={{ background: colorChip }}
					/>
					<span className="fe-wine-card__vintage">{formatVintage(wine.vintage)}</span>
				</div>
				<div className="fe-wine-card__points" title="Wine Enthusiast points">{wine.points} pts</div>
			</div>

			{/* Name + winery */}
			<div>
				<h3 className="fe-wine-card__name">{wine.name}</h3>
				<p className="fe-wine-card__winery">{wine.winery}</p>
			</div>

			{/* Origin breadcrumb */}
			<p className="fe-wine-card__origin">{originBreadcrumb}</p>

			{/* Varietal · body · sweetness */}
			<div className="fe-wine-card__attrs">
				<span className="fe-wine-card__varietal">{wine.varietal}</span>
				<span className="fe-wine-card__sep">·</span>
				<span>{wine.body}</span>
				<span className="fe-wine-card__sep">·</span>
				<span>{wine.sweetness}</span>
			</div>

			{/* Tasting notes — first 4 max */}
			{wine.tastingNotes.length > 0 && (
				<div className="fe-wine-card__notes">
					{wine.tastingNotes.slice(0, 4).map((note) => (
						<span key={note} className="fe-wine-card__note">{note}</span>
					))}
				</div>
			)}

			{/* Bottom: price + ABV */}
			<div className="fe-wine-card__bottom">
				<span className="fe-wine-card__price">${wine.priceUsd.toFixed(2)}</span>
				<span className="fe-wine-card__abv">{wine.abv.toFixed(1)}% abv</span>
			</div>
		</article>
	);
};

/**
 * Memoized public export — `wine` refs are stable across renders, so a card only re-renders when
 * its own wine changes, not when a sibling filter churns the tree.
 */
export const WineCard = memo(WineCardInner);
