<script lang="ts">
	/**
	 * `<WineServerFallback>` — the server-rendered, JavaScript-free half of `/wine-server`.
	 *
	 * The wine twin of `<BooksServerFallback>`: the very first paint (matching the server `load`), and
	 * the *entire* experience when JS is disabled — a plain `<form method="GET">` whose submission
	 * reloads the route so the SvelteKit server filters the corpus in-process and re-renders these
	 * results. Genuine progressive enhancement. When the client engine boots, the parent route swaps
	 * this out for the live `<WineView>`.
	 *
	 * A deliberate SUBSET of the 14 interactive facets (color, minimum score, tasting-notes search) —
	 * the no-JS floor, not a second full panel. All data (match count, sample grid, color vocabulary,
	 * current selections) comes from the server `load`; this component holds no engine and no reactivity
	 * beyond the `booting` status hint. All chrome is the shared `fe-server-fallback__*` classes from
	 * `@filter-enginez/ui-styles`, identical to the books fallback.
	 */

	import type { AppliedParams } from '$lib/server/wineServerParams.js';

	import { formatVintage } from '@filter-enginez/examples-shared/wine-domain';
	import AppHeaderBrand from '$lib/shell/AppHeaderBrand.svelte';

	import type { SsrWineCard } from '../../routes/wine-server/+page.server.js';

	interface Props {
		/** The current parsed selections (drives the form's checked/selected state). */
		readonly applied: AppliedParams;
		/** Whether the client engine is mid-boot (JS-on): shows a "connecting" hint. */
		readonly booting: boolean;
		/** A boot failure message, if the live engine could not start. */
		readonly bootError: string | null;
		/** Distinct color vocabulary for the checkbox list. */
		readonly colors: readonly string[];
		/** Total match count for the current filters. */
		readonly matched: number;
		/** The SSR sample of matching wines. */
		readonly sample: readonly SsrWineCard[];
		/** Total corpus size. */
		readonly total: number;
	}

	const { applied, bootError, booting, colors, matched, sample, total }: Props = $props();

	/** The min-points options offered by the no-JS select (Wine Enthusiast 80-100 scale). */
	const POINTS_OPTIONS = [85, 88, 90, 92, 95] as const;
</script>

<!-- The app header, as on every page: with JavaScript off this IS the route, so it carries the way home
     to the landing site and back to the hub like the live view that replaces it. -->
<header class="fe-books-app__header">
	<AppHeaderBrand page="Wine" tier="server" />
</header>

<div class="fe-server-fallback">
	<header class="fe-server-fallback__banner">
		<span class="fe-server-fallback__dot" aria-hidden="true"></span>
		<p class="fe-server-fallback__banner-text">
			Filtering on the <strong>SvelteKit server</strong> — the isomorphic engine runs in-process; this
			page works with JavaScript disabled.
		</p>
	</header>

	{#if bootError !== null}
		<p class="fe-server-fallback__error" role="alert">
			The live engine could not start ({bootError}). The server-rendered filters below still work.
		</p>
	{:else if booting}
		<p class="fe-server-fallback__status" aria-live="polite">Connecting to the live engine…</p>
	{/if}

	<form class="fe-server-fallback__form" method="GET" action="/wine-server">
		<fieldset class="fe-server-fallback__fieldset">
			<legend class="fe-server-fallback__legend">Color</legend>
			<div class="fe-server-fallback__chips">
				{#each colors as color (color)}
					<label class="fe-server-fallback__chip">
						<input type="checkbox" name="color" value={color} checked={applied.colors.includes(color)} />
						<span>{color}</span>
					</label>
				{/each}
			</div>
		</fieldset>

		<div class="fe-server-fallback__row">
			<label class="fe-server-fallback__field">
				<span class="fe-server-fallback__label">Minimum score</span>
				<select name="minPoints" class="fe-server-fallback__select">
					<option value="" selected={applied.minPoints === null}>Any</option>
					{#each POINTS_OPTIONS as value (value)}
						<option value={String(value)} selected={applied.minPoints === value}>{value}+ pts</option>
					{/each}
				</select>
			</label>

			<label class="fe-server-fallback__field fe-server-fallback__field--grow">
				<span class="fe-server-fallback__label">Search tasting notes</span>
				<input
					type="search"
					name="q"
					class="fe-server-fallback__input"
					placeholder="e.g. blackberry"
					value={applied.search}
				/>
			</label>
		</div>

		<div class="fe-server-fallback__actions">
			<button type="submit" class="fe-server-fallback__submit">Filter on the server</button>
			<a href="/wine-server" class="fe-server-fallback__clear">Clear</a>
		</div>
	</form>

	<p class="fe-server-fallback__count">
		<strong>{matched.toLocaleString()}</strong> of {total.toLocaleString()} wines match
		{#if sample.length > 0}<span class="fe-server-fallback__count-hint"> · showing first {sample.length}</span>{/if}
	</p>

	{#if sample.length > 0}
		<ul class="fe-server-fallback__grid">
			{#each sample as wine (wine.id)}
				<li class="fe-server-fallback__card">
					<div class="fe-server-fallback__card-top">
						<span class="fe-server-fallback__card-genre">{wine.color || 'Wine'}</span>
						{#if wine.vintage !== null}<span class="fe-server-fallback__card-year">{formatVintage(wine.vintage)}</span>{/if}
					</div>
					<h3 class="fe-server-fallback__card-title">{wine.name}</h3>
					<p class="fe-server-fallback__card-authors">
						{wine.winery || 'Unknown winery'}{#if wine.varietal} · {wine.varietal}{/if}
					</p>
					<p class="fe-server-fallback__card-rating">
						{wine.points === null ? 'Unrated' : `${wine.points} pts`}{#if wine.priceUsd !== null} · ${wine.priceUsd.toFixed(0)}{/if}
					</p>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="fe-server-fallback__empty">No wines match these filters. Try relaxing them.</p>
	{/if}
</div>
