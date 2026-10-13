<script setup lang="ts">
/**
 * `/about` — the Vue "How the engine works" page, at parity with the React `<AboutPage>` and the
 * SvelteKit `/about` route.
 *
 * Shares ONE narrative source with the other verticals: the section copy, order, and figure ids come
 * from `@filter-enginez/examples-shared/about-core` (framework-free), and it renders over the same
 * `fe-about__*` + `fe-fig-*` classes from `@filter-enginez/ui-styles` (imported app-wide via
 * `app.css`). The eight algorithm figures are the ported `.vue` illustrations, looked up by
 * `section.id` through the local `figureRegistry`. A sticky mini table-of-contents tracks the section
 * in view via an SSR-guarded `IntersectionObserver` (the Vue counterpart to React's `useActiveSection`
 * / Svelte's scroll-spy `onMount`).
 *
 * The final CTA band deep-links a live demo: here, the single client-side-engine card for `/books`,
 * as in Angular. The other verticals pick their own (React points at `/wine` + `/books-config`,
 * Svelte at `/books` + `/books-server`, vanilla at `/books` + `/books-raw`).
 */
import { ABOUT_SECTIONS } from '@filter-enginez/examples-shared/about-core';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { RouterLink } from 'vue-router';

import BenchmarkWidget from '../about/BenchmarkWidget.vue';
import { ABOUT_FIGURES } from '../about/figureRegistry.js';

/** All scroll-spy targets, in document order (the eight bands + the benchmark payoff). */
const SECTION_IDS: readonly string[] = [...ABOUT_SECTIONS.map((section) => section.id), 'benchmark'];

/** The section currently most in view — drives the sticky TOC highlight. */
const activeId = ref<string>(ABOUT_SECTIONS[0]?.id ?? '');

/** The figure component for a section id, or `undefined` when none is registered. */
function figureFor(id: string) {
	return ABOUT_FIGURES[id];
}

/** True when this section opens the "Beyond filtering" act (first `beyond`-group band). */
function isBeyondStart(index: number): boolean {
	return ABOUT_SECTIONS[index]?.group === 'beyond' && ABOUT_SECTIONS[index - 1]?.group !== 'beyond';
}

// Scroll-spy: mirror the React `useActiveSection` / Svelte scroll-spy — pick the section with the
// highest intersection ratio. SSR/jsdom-guarded (no observer without `IntersectionObserver`); the TOC
// simply rests on the first section there.
let observer: IntersectionObserver | null = null;

onMounted(() => {
	if (typeof IntersectionObserver === 'undefined') {
		return;
	}
	const ratios: Record<string, number> = {};

	observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				ratios[entry.target.id] = entry.isIntersecting ? entry.intersectionRatio : 0;
			}
			let best = '';
			let bestRatio = 0;

			for (const [id, ratio] of Object.entries(ratios)) {
				if (ratio > bestRatio) {
					bestRatio = ratio;
					best = id;
				}
			}
			if (best !== '') {
				activeId.value = best;
			}
		},
		{ rootMargin: '-8% 0px -45% 0px', threshold: [0.2, 0.5, 0.8]},
	);

	for (const id of SECTION_IDS) {
		const element = document.getElementById(id);

		if (element !== null) {
			observer.observe(element);
		}
	}
});

onUnmounted(() => {
	observer?.disconnect();
	observer = null;
});

/** Sections paired with their zero-based index (so the template avoids `v-for` index caveats). */
const indexedSections = computed(() => ABOUT_SECTIONS.map((section, index) => ({ index, section })));
</script>

<template>
	<div class="fe-about">
		<header class="fe-about__topbar">
			<RouterLink to="/" class="fe-about__brand" aria-label="Filter EngineZ — back to the dataset hub">
				<span class="fe-about__brand-mark" aria-hidden="true">
					<img src="/mark.svg" alt="" width="28" height="28" />
				</span>
				<span class="fe-about__brand-word">Filter EngineZ</span>
			</RouterLink>
			<RouterLink to="/" class="fe-about__back">← datasets</RouterLink>
		</header>

		<section class="fe-about__hero">
			<p class="fe-about__eyebrow">the engine</p>
			<h1 class="fe-about__hero-title">How the engine works</h1>
			<p class="fe-about__hero-lead">
				Most filter engines answer your question by checking every record. Filter EngineZ answers it by doing as little
				as possible — stacking four classic data-structure tricks so the same results come back in a fraction of the
				work.
			</p>
		</section>

		<nav class="fe-about__toc" aria-label="On this page">
			<a
				v-for="section in ABOUT_SECTIONS"
				:key="section.id"
				:href="`#${section.id}`"
				class="fe-about__toc-link"
				:class="{ 'is-active': activeId === section.id }"
			>
				<span class="fe-about__toc-dot" aria-hidden="true"></span>
				{{ section.tocLabel }}
			</a>
			<a href="#benchmark" class="fe-about__toc-link" :class="{ 'is-active': activeId === 'benchmark' }">
				<span class="fe-about__toc-dot" aria-hidden="true"></span>
				<span>Try it live</span>
			</a>
		</nav>

		<main class="fe-about__bands">
			<template v-for="{ index, section } in indexedSections" :key="section.id">
				<div v-if="isBeyondStart(index)" class="fe-about__act">
					<p class="fe-about__eyebrow">act two</p>
					<h2 class="fe-about__act-title">Beyond filtering</h2>
					<p class="fe-about__act-lead">
						The same bitmaps, signatures, and counts power more than intersection — suggestions, similarity,
						probabilistic membership, and text search.
					</p>
				</div>
				<section :id="section.id" class="fe-about__band" :class="{ 'is-reversed': index % 2 === 1 }">
					<div class="fe-about__figure">
						<component :is="figureFor(section.id)" v-if="figureFor(section.id)" />
					</div>
					<div class="fe-about__copy">
						<p class="fe-about__eyebrow">{{ section.eyebrow }}</p>
						<h2 class="fe-about__band-title">{{ section.title }}</h2>
						<p class="fe-about__body">{{ section.body }}</p>
						<pre class="fe-about__code"><code>{{ section.code }}</code></pre>
					</div>
				</section>
			</template>

			<section id="benchmark" class="fe-about__payoff">
				<p class="fe-about__eyebrow">now stack all of it</p>
				<h2 class="fe-about__band-title">Try the optimizations live</h2>
				<p class="fe-about__body fe-about__payoff-lead">
					This runs the real predictive-disable workload — simulating every option across a facet — on 10,000 wines, in
					your browser, right now. Flip the layers off and watch the same answer take longer to compute.
				</p>
				<BenchmarkWidget />
			</section>

			<section class="fe-about__cta">
				<h2 class="fe-about__band-title">See it holding real weight</h2>
				<div class="fe-about__cta-grid">
					<RouterLink to="/books" class="fe-about__cta-card">
						<span class="fe-about__cta-eyebrow">client-side engine</span>
						<span class="fe-about__cta-title">Filter in your browser</span>
						<span class="fe-about__cta-body">
							All four acceleration layers running live over 10,000 books — every filter computed in the browser, not on
							a server.
						</span>
						<span class="fe-about__cta-go">Explore the books demo →</span>
					</RouterLink>
				</div>
			</section>
		</main>
	</div>
</template>
