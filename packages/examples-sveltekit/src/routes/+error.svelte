<script lang="ts">
	/**
	 * `+error.svelte` — the SvelteKit "filtered to zero" 404 (and generic error) page, at parity with
	 * the React `<NotFoundPage>`. SvelteKit renders this automatically for a 404 (no matching route) or a
	 * thrown load error.
	 *
	 * Shares ONE source with React: the copy, chip vocabulary, and toggle logic come from
	 * `@filter-enginez/examples-shared/notfound-core` (React-free), and it renders over the same
	 * `fe-notfound__*` classes from `@filter-enginez/ui-styles` (already imported app-wide via
	 * `app.css`). The gag matches too: a cyan `0` result count that never moves, the phosphor
	 * `NeuralCluster` "thinking" loader churning away (the engine perpetually searching, never matching),
	 * and a dead-end filter row where every toggle still yields the empty set.
	 */

	import {
		NOT_FOUND_CHIPS,
		NOT_FOUND_COPY,
		notFoundBody,
		toggleNotFoundChip,
	} from '@filter-enginez/examples-shared/notfound-core';
	import { page } from '$app/stores';
	import NeuralCluster from '$lib/brand/NeuralCluster.svelte';

	let selected = $state<string[]>([]);

	/** Toggle a chip — the count never budges off zero, so there's nothing to recompute. */
	function handleToggle(id: string): void {
		selected = toggleNotFoundChip(selected, id);
	}
</script>

<svelte:head>
	<title>Filter EngineZ · 404 — no matches</title>
</svelte:head>

<main class="fe-notfound">
	<p class="fe-notfound__eyebrow">{NOT_FOUND_COPY.eyebrow}</p>
	<p class="fe-notfound__count" aria-hidden="true">{NOT_FOUND_COPY.count}</p>
	<div class="fe-notfound__loader">
		<NeuralCluster size={168} />
	</div>
	<h1 class="fe-notfound__heading">{NOT_FOUND_COPY.heading}</h1>
	<p class="fe-notfound__body">{notFoundBody($page.url.pathname)}</p>
	<div class="fe-notfound__chips" role="group" aria-label="Dead-end filters — every option yields zero">
		{#each NOT_FOUND_CHIPS as chip (chip.id)}
			<button
				type="button"
				class="fe-notfound__chip"
				class:fe-notfound__chip--selected={selected.includes(chip.id)}
				aria-pressed={selected.includes(chip.id)}
				onclick={() => handleToggle(chip.id)}
			>
				{chip.label}
				<span class="fe-notfound__chip-badge">0</span>
			</button>
		{/each}
	</div>
	<a class="fe-notfound__cta" href={NOT_FOUND_COPY.ctaHref}>{NOT_FOUND_COPY.ctaLabel}</a>
</main>
