<script lang="ts">
	// Landing hub, at visual parity with the React `<LandingPage>`: the app's compact header, then a
	// brand-forward hero over an ambient glow + drifting grid, then a grid of dataset cards. The
	// `fe-landing__*` rules live in `@filter-enginez/ui-styles` (imported app-wide via `app.css`);
	// they're global rather than a component `<style>` block because the ambient pseudo-element
	// gradients + `mask-image` trip Svelte's stricter component-CSS parser. One card per dataset route
	// this app serves.
	//
	// The header is the one every page of the app carries (`<AppHeaderBrand>`), naming this page
	// `Datasets`. Its links to the landing site resolve from `$page.url`, so they are right in the
	// server-rendered HTML too.

	import { HEADER_PAGE_LABELS } from '@filter-enginez/examples-shared/app-header-core';
	import { landingDatasets } from '$lib/landing.js';
	import AppHeaderBrand from '$lib/shell/AppHeaderBrand.svelte';
</script>

<header class="fe-books-app__header">
	<AppHeaderBrand page={HEADER_PAGE_LABELS.hub} />
</header>

<main class="fe-landing">
	<div class="fe-landing__inner">
		<header class="fe-landing__hero">
			<span class="fe-landing__glow">
				<img class="fe-landing__mark" src="/mark.svg" width="72" height="72" alt="Filter EngineZ" />
			</span>
			<span class="fe-landing__wordmark">Filter EngineZ</span>
			<p class="fe-landing__tagline">
				A generic, isomorphic, framework-agnostic TypeScript filter engine: arbitrarily complex
				filters over arbitrarily shaped data, computed client-side. This is the Svelte vertical.
			</p>
			<p class="fe-landing__prompt">Select a dataset to explore</p>
		</header>

		<div class="fe-landing__grid">
			{#each landingDatasets as dataset (dataset.id)}
				<a href={dataset.href} class="fe-landing__card fe-landing__card--live" aria-label={dataset.label}>
					<div class="fe-landing__card-top">
						<span class="fe-landing__card-title">{dataset.label}</span>
						<span class="fe-landing__badge fe-landing__badge--live">Live</span>
					</div>
					<p class="fe-landing__card-blurb">{dataset.blurb}</p>
					<span class="fe-landing__card-cta">Explore {dataset.recordNoun}</span>
				</a>
			{/each}
		</div>

		<p class="fe-landing__foot">Same engine, bound to Svelte. Filtering happens in your browser.</p>
	</div>
</main>
