<script setup lang="ts">
/**
 * `<WineCard>` — one result card.
 *
 * @remarks
 * Presentational and prop-driven: no engine, no store, no context. Styling is entirely `ui-styles`'
 * `fe-wine-card*` family.
 *
 * **The color swatch is an inline `background` and has to be.** It is a per-record value drawn from
 * the wine's own color, which is the one case the house styling rules admit an inline style
 * for — a class per color would be six rules that exist only to encode data.
 *
 * `role="img"` plus an `aria-label` on that swatch rather than a bare `title`: the color is real
 * information, not decoration, and it is the only place on the card where a color carries meaning with
 * no text beside it. An axe run flagged exactly this on the React card.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { formatVintage } from '@filter-enginez/examples-shared/wine-domain';
import { computed } from 'vue';

const props = defineProps<{
	wine: Wine;
}>();

/**
 * Swatch colors — approximations of the wine in the glass, not brand tokens.
 *
 * @remarks
 * Deliberately outside the design system: these represent the DATA, and binding them to brand tokens
 * would make a palette change silently restate what a rosé looks like.
 */
const COLOR_CHIP: Record<Wine['color'], string> = {
	dessert: '#A16207',
	fortified: '#451A03',
	red: '#7F1D1D',
	rosé: '#FCA5A5',
	sparkling: '#FDE68A',
	white: '#FEF3C7',
};

/** Country · province · region · subregion, with empty levels dropped. */
const originBreadcrumb = computed(() =>
	[
		props.wine.origin.country,
		props.wine.origin.province,
		props.wine.origin.region,
		props.wine.origin.subregion,
	]
		.filter((part) => part.length > 0)
		.join(' · '),
);

/**
 * The vintage as the card shows it — the year, or `NV` for a non-vintage bottle.
 *
 * @remarks
 * A non-vintage wine stores `NON_VINTAGE_YEAR` (2025) so the vintage filter can still select it;
 * printing that number would claim a harvest the bottle does not have. `formatVintage` is the same
 * formatter the vintage slider's readout uses, so the card and the panel agree.
 */
const vintageLabel = computed(() => formatVintage(props.wine.vintage));

/** At most four notes — the card is a summary, and the full list runs to a dozen. */
const visibleNotes = computed(() => props.wine.tastingNotes.slice(0, 4));
</script>

<template>
	<article class="fe-wine-card" role="listitem">
		<div class="fe-wine-card__top">
			<div class="fe-wine-card__meta">
				<span
					class="fe-wine-card__color"
					role="img"
					:aria-label="`${wine.color} wine`"
					:style="{ background: COLOR_CHIP[wine.color] }"
					:title="wine.color"
				/>
				<span class="fe-wine-card__vintage">{{ vintageLabel }}</span>
			</div>
			<div class="fe-wine-card__points" title="Wine Enthusiast points">{{ wine.points }} pts</div>
		</div>

		<div>
			<h3 class="fe-wine-card__name">{{ wine.name }}</h3>
			<p class="fe-wine-card__winery">{{ wine.winery }}</p>
		</div>

		<p class="fe-wine-card__origin">{{ originBreadcrumb }}</p>

		<div class="fe-wine-card__attrs">
			<span class="fe-wine-card__varietal">{{ wine.varietal }}</span>
			<span class="fe-wine-card__sep">·</span>
			<span>{{ wine.body }}</span>
			<span class="fe-wine-card__sep">·</span>
			<span>{{ wine.sweetness }}</span>
		</div>

		<div v-if="visibleNotes.length > 0" class="fe-wine-card__notes">
			<span v-for="note in visibleNotes" :key="note" class="fe-wine-card__note">{{ note }}</span>
		</div>

		<div class="fe-wine-card__bottom">
			<span class="fe-wine-card__price">${{ wine.priceUsd.toFixed(2) }}</span>
			<span class="fe-wine-card__abv">{{ wine.abv.toFixed(1) }}% abv</span>
		</div>
	</article>
</template>
