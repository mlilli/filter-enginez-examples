<script lang="ts">
	// Landing hub, at visual parity with the React `<LandingPage>`: a brand-forward hero over an
	// ambient glow + drifting grid, then a grid of dataset cards. The `fe-landing__*` rules live in
	// `@filter-enginez/ui-styles` (imported app-wide via `app.css`); they're global rather than a
	// component `<style>` block because the ambient pseudo-element gradients + `mask-image` trip
	// Svelte's stricter component-CSS parser. One card per dataset route this app serves.
	//
	// "How the engine works" leads to the one page on the landing site, another origin, resolved from
	// `$page.url` like every cross-app link — so it is right in the server-rendered HTML too, the
	// deployed page from a deployed host and the local site server from a loopback one.

	import { howItWorksUrl } from '@filter-enginez/examples-shared/compare-core';
	import { page } from '$app/stores';
	import { landingDatasets } from '$lib/landing.js';

	const howItWorksHref = $derived(howItWorksUrl($page.url));
</script>

<div class="fe-landing">
	<div class="fe-landing__inner">
		<header class="fe-landing__hero">
			<img class="fe-landing__mark" src="/mark.svg" width="72" height="72" alt="Filter EngineZ" />
			<span class="fe-landing__wordmark">Filter EngineZ</span>
			<p class="fe-landing__tagline">
				A generic, isomorphic, framework-agnostic TypeScript filter engine: arbitrarily complex
				filters over arbitrarily shaped data, computed client-side. This is the Svelte vertical.
			</p>
			<a href={howItWorksHref} class="fe-landing__about">How the engine works →</a>
			<!-- Second in the stack, matching both React landings: what the engine does, then that it
			     does it everywhere. Cyan (`.fe-landing__compare`, in ui-styles) because the page is
			     about WHICH state and WHICH stack — data and identity — never about the engine
			     computing, which is what the phosphor server-demo pill means on the verticals that
			     carry one. -->
			<a href="/compare" class="fe-landing__compare">See one filter state in all six stacks →</a>
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
</div>
