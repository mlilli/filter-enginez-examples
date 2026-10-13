<script lang="ts">
	/**
	 * `<BooksServerFallback>` — the server-rendered, JavaScript-free half of `/books-server`.
	 *
	 * This is the very first paint (matching the server `load`), and the *entire* experience when JS is
	 * disabled: a plain `<form method="GET">` whose submission reloads the route so the SvelteKit server
	 * filters the corpus in-process and re-renders these results — genuine progressive enhancement. When
	 * the client engine boots, the parent route swaps this out for the live `<BooksView>`.
	 *
	 * All data (match count, sample grid, genre vocabulary, current selections) comes from the server
	 * `load`; this component holds no engine and no reactivity beyond the `booting` status hint.
	 */

	import type { AppliedParams } from '$lib/server/booksServerParams.js';

	import type { SsrBookCard } from '../../routes/books-server/+page.server.js';

	interface Props {
		/** The current parsed selections (drives the form's checked/selected state). */
		readonly applied: AppliedParams;
		/** Whether the client engine is mid-boot (JS-on): shows a "connecting" hint. */
		readonly booting: boolean;
		/** A boot failure message, if the live engine could not start. */
		readonly bootError: string | null;
		/** Distinct genre vocabulary for the checkbox list. */
		readonly genres: readonly string[];
		/** Total match count for the current filters. */
		readonly matched: number;
		/** The SSR sample of matching books. */
		readonly sample: readonly SsrBookCard[];
		/** Total corpus size. */
		readonly total: number;
	}

	const { applied, bootError, booting, genres, matched, sample, total }: Props = $props();

	/** The min-rating options offered by the no-JS select. */
	const RATING_OPTIONS = [3, 3.5, 4, 4.5] as const;

	/** Pretty genre label (the corpus stores kebab-case genres). */
	function genreLabel(genre: string): string {
		return genre.replace(/-/gu, ' ');
	}
</script>

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

	<form class="fe-server-fallback__form" method="GET" action="/books-server">
		<fieldset class="fe-server-fallback__fieldset">
			<legend class="fe-server-fallback__legend">Genre</legend>
			<div class="fe-server-fallback__chips">
				{#each genres as genre (genre)}
					<label class="fe-server-fallback__chip">
						<input type="checkbox" name="genre" value={genre} checked={applied.genres.includes(genre)} />
						<span>{genreLabel(genre)}</span>
					</label>
				{/each}
			</div>
		</fieldset>

		<div class="fe-server-fallback__row">
			<label class="fe-server-fallback__field">
				<span class="fe-server-fallback__label">Minimum rating</span>
				<select name="minRating" class="fe-server-fallback__select">
					<option value="" selected={applied.minRating === null}>Any</option>
					{#each RATING_OPTIONS as value (value)}
						<option value={String(value)} selected={applied.minRating === value}>★ {value.toFixed(1)}+</option>
					{/each}
				</select>
			</label>

			<label class="fe-server-fallback__field fe-server-fallback__field--grow">
				<span class="fe-server-fallback__label">Search descriptions</span>
				<input
					type="search"
					name="q"
					class="fe-server-fallback__input"
					placeholder="e.g. dragons"
					value={applied.search}
				/>
			</label>
		</div>

		<div class="fe-server-fallback__actions">
			<button type="submit" class="fe-server-fallback__submit">Filter on the server</button>
			<a href="/books-server" class="fe-server-fallback__clear">Clear</a>
		</div>
	</form>

	<p class="fe-server-fallback__count">
		<strong>{matched.toLocaleString()}</strong> of {total.toLocaleString()} books match
		{#if sample.length > 0}<span class="fe-server-fallback__count-hint"> · showing first {sample.length}</span>{/if}
	</p>

	{#if sample.length > 0}
		<ul class="fe-server-fallback__grid">
			{#each sample as book (book.id)}
				<li class="fe-server-fallback__card">
					<div class="fe-server-fallback__card-top">
						<span class="fe-server-fallback__card-genre">{genreLabel(book.genre)}</span>
						{#if book.year !== null}<span class="fe-server-fallback__card-year">{book.year}</span>{/if}
					</div>
					<h3 class="fe-server-fallback__card-title">{book.title}</h3>
					<p class="fe-server-fallback__card-authors">{book.authors || 'Unknown author'}</p>
					<p class="fe-server-fallback__card-rating">
						{book.averageRating === null ? 'Unrated' : `★ ${book.averageRating.toFixed(1)}`}
					</p>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="fe-server-fallback__empty">No books match these filters. Try relaxing them.</p>
	{/if}
</div>
