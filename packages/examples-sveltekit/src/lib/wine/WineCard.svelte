<script lang="ts">
	/**
	 * `<WineCard>` — one wine record, at visual parity with the React `<WineCard>`.
	 *
	 * Presentational only: no engine, no stores, no context. It renders over the shared `fe-wine-card`
	 * classes in `ui-styles`, so the React and Svelte grids are pixel-identical over one corpus — which
	 * is the comparison the six demo apps exist to make.
	 */

	import type { Wine } from '@filter-enginez/mock-data/wine';

	const { wine }: { wine: Wine } = $props();

	/**
	 * Swatch colors per wine color. Inline rather than a class per color: these are DATA values from
	 * the corpus vocabulary, and a stylesheet rule per value would need editing every time the
	 * vocabulary grows.
	 */
	const COLOR_CHIP: Record<Wine['color'], string> = {
		dessert: '#A16207',
		fortified: '#451A03',
		red: '#7F1D1D',
		rosé: '#FCA5A5',
		sparkling: '#FDE68A',
		white: '#FEF3C7',
	};

	const originBreadcrumb = $derived(
		[wine.origin.country, wine.origin.province, wine.origin.region, wine.origin.subregion]
			.filter((part) => part.length > 0)
			.join(' · '),
	);
</script>

<article role="listitem" class="fe-wine-card">
	<div class="fe-wine-card__top">
		<div class="fe-wine-card__meta">
			<span
				role="img"
				aria-label="{wine.color} wine"
				title={wine.color}
				class="fe-wine-card__color"
				style="background: {COLOR_CHIP[wine.color]}"
			></span>
			<span class="fe-wine-card__vintage">{wine.vintage}</span>
		</div>
		<div class="fe-wine-card__points" title="Wine Enthusiast points">{wine.points} pts</div>
	</div>

	<div>
		<h3 class="fe-wine-card__name">{wine.name}</h3>
		<p class="fe-wine-card__winery">{wine.winery}</p>
	</div>

	<p class="fe-wine-card__origin">{originBreadcrumb}</p>

	<div class="fe-wine-card__attrs">
		<span class="fe-wine-card__varietal">{wine.varietal}</span>
		<span class="fe-wine-card__sep">·</span>
		<span>{wine.body}</span>
		<span class="fe-wine-card__sep">·</span>
		<span>{wine.sweetness}</span>
	</div>

	{#if wine.tastingNotes.length > 0}
		<div class="fe-wine-card__notes">
			{#each wine.tastingNotes.slice(0, 4) as note (note)}
				<span class="fe-wine-card__note">{note}</span>
			{/each}
		</div>
	{/if}

	<div class="fe-wine-card__bottom">
		<span class="fe-wine-card__price">${wine.priceUsd.toFixed(2)}</span>
		<span class="fe-wine-card__abv">{wine.abv.toFixed(1)}% abv</span>
	</div>
</article>
