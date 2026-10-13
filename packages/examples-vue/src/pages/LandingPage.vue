<script setup lang="ts">
/**
 * Landing hub for the Vue vertical, at visual parity with the React/Svelte `<LandingPage>`: a
 * brand-forward hero over an ambient glow + drifting grid, then a grid of dataset cards. The
 * `fe-landing__*` rules live in `@filter-enginez/ui-styles` (imported app-wide via `app.css`). One
 * card per dataset route this app serves, each linking to it.
 *
 * "How the engine works" is a plain anchor, not a `<RouterLink>`: the page lives on the landing site,
 * another origin, resolved from this page's location so a local run reaches the local site server.
 */
import { howItWorksUrl } from '@filter-enginez/examples-shared/compare-core';
import { RouterLink } from 'vue-router';

import { landingDatasets } from '../landing.js';

/** The how-it-works page on the landing site, for this deployment layout. */
const howItWorksHref = howItWorksUrl(window.location);
</script>

<template>
	<div class="fe-landing">
		<div class="fe-landing__inner">
			<header class="fe-landing__hero">
				<img class="fe-landing__mark" src="/mark.svg" width="72" height="72" alt="Filter EngineZ" />
				<span class="fe-landing__wordmark">Filter EngineZ</span>
				<p class="fe-landing__tagline">
					A generic, isomorphic, framework-agnostic TypeScript filter engine: arbitrarily complex filters over
					arbitrarily shaped data, computed client-side. This is the Vue vertical.
				</p>
				<a :href="howItWorksHref" class="fe-landing__about">How the engine works →</a>
				<!-- Second in the stack, matching every other vertical: what the engine does, then that it
				     does it everywhere. Cyan because the page is about WHICH state and WHICH stack — data
				     and identity — never about the engine computing. -->
				<RouterLink to="/compare" class="fe-landing__compare">
					See one filter state in all six stacks →
				</RouterLink>
				<p class="fe-landing__prompt">Select a dataset to explore</p>
			</header>

			<div class="fe-landing__grid">
				<RouterLink
					v-for="dataset in landingDatasets"
					:key="dataset.id"
					:to="dataset.href"
					class="fe-landing__card fe-landing__card--live"
					:aria-label="dataset.label"
				>
					<div class="fe-landing__card-top">
						<span class="fe-landing__card-title">{{ dataset.label }}</span>
						<span class="fe-landing__badge fe-landing__badge--live">Live</span>
					</div>
					<p class="fe-landing__card-blurb">
						{{ dataset.blurb }}
					</p>
					<span class="fe-landing__card-cta">Explore {{ dataset.recordNoun }}</span>
				</RouterLink>
			</div>

			<p class="fe-landing__foot">Same engine, bound to Vue. Filtering happens in your browser.</p>
		</div>
	</div>
</template>
