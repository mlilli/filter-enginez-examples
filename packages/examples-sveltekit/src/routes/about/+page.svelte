<script lang="ts">
	/**
	 * `/about` — the SvelteKit "How the engine works" page, at parity with the React `<AboutPage>`.
	 *
	 * Shares ONE narrative source with React: the section copy, order, and figure ids come from
	 * `@filter-enginez/examples-shared/about-core` (framework-free), and it renders over the same
	 * `fe-about__*` + `fe-fig-*` classes from `@filter-enginez/ui-styles` (imported app-wide via
	 * `app.css`). The eight algorithm figures are the ported `.svelte` illustrations, looked up by
	 * `section.id` through the local `figureRegistry`. A sticky mini table-of-contents tracks the section
	 * in view via an SSR-guarded `IntersectionObserver` (the Svelte counterpart to React's
	 * `useActiveSection`).
	 *
	 * The `#benchmark` payoff section (`<BenchmarkWidget>`) and its "Try it live" TOC entry follow the
	 * eight bands, as on the React page.
	 */

	import { ABOUT_SECTIONS } from '@filter-enginez/examples-shared/about-core';
	import BenchmarkWidget from '$lib/about/BenchmarkWidget.svelte';
	import { ABOUT_FIGURES } from '$lib/about/figureRegistry.js';
	import { onMount } from 'svelte';

	/** All scroll-spy targets, in document order (the eight bands + the benchmark payoff). */
	const SECTION_IDS: readonly string[] = [...ABOUT_SECTIONS.map((section) => section.id), 'benchmark'];

	/** The section currently most in view — drives the sticky TOC highlight. */
	let activeId = $state<string>(ABOUT_SECTIONS[0]?.id ?? '');

	// Scroll-spy: mirror the React `useActiveSection` — pick the section with the highest intersection
	// ratio. SSR-guarded (no observer on the server); the TOC simply rests on the first section there.
	onMount(() => {
		if (typeof IntersectionObserver === 'undefined') {
			return undefined;
		}
		const ratios: Record<string, number> = {};
		const observer = new IntersectionObserver(
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
					activeId = best;
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

		return () => {
			observer.disconnect();
		};
	});
</script>

<svelte:head>
	<title>Filter EngineZ · How the engine works</title>
</svelte:head>

<div class="fe-about">
	<header class="fe-about__topbar">
		<a href="/" class="fe-about__brand" aria-label="Filter EngineZ — back to the dataset hub">
			<span class="fe-about__brand-mark" aria-hidden="true">
				<img src="/mark.svg" alt="" width="28" height="28" />
			</span>
			<span class="fe-about__brand-word">Filter EngineZ</span>
		</a>
		<a href="/" class="fe-about__back">← datasets</a>
	</header>

	<section class="fe-about__hero">
		<p class="fe-about__eyebrow">the engine</p>
		<h1 class="fe-about__hero-title">How the engine works</h1>
		<p class="fe-about__hero-lead">
			Most filter engines answer your question by checking every record. Filter EngineZ answers it by
			doing as little as possible — stacking four classic data-structure tricks so the same results
			come back in a fraction of the work.
		</p>
	</section>

	<nav class="fe-about__toc" aria-label="On this page">
		{#each ABOUT_SECTIONS as section (section.id)}
			<a href={`#${section.id}`} class="fe-about__toc-link" class:is-active={activeId === section.id}>
				<span class="fe-about__toc-dot" aria-hidden="true"></span>
				{section.tocLabel}
			</a>
		{/each}
		<a href="#benchmark" class="fe-about__toc-link" class:is-active={activeId === 'benchmark'}>
			<span class="fe-about__toc-dot" aria-hidden="true"></span>
			<span>Try it live</span>
		</a>
	</nav>

	<main class="fe-about__bands">
		{#each ABOUT_SECTIONS as section, index (section.id)}
			{@const isBeyondStart = section.group === 'beyond' && ABOUT_SECTIONS[index - 1]?.group !== 'beyond'}
			{@const Figure = ABOUT_FIGURES[section.id]}
			{#if isBeyondStart}
				<div class="fe-about__act">
					<p class="fe-about__eyebrow">act two</p>
					<h2 class="fe-about__act-title">Beyond filtering</h2>
					<p class="fe-about__act-lead">
						The same bitmaps, signatures, and counts power more than intersection — suggestions,
						similarity, probabilistic membership, and text search.
					</p>
				</div>
			{/if}
			<section id={section.id} class="fe-about__band" class:is-reversed={index % 2 === 1}>
				<div class="fe-about__figure">
					{#if Figure}
						<Figure />
					{/if}
				</div>
				<div class="fe-about__copy">
					<p class="fe-about__eyebrow">{section.eyebrow}</p>
					<h2 class="fe-about__band-title">{section.title}</h2>
					<p class="fe-about__body">{section.body}</p>
					<pre class="fe-about__code"><code>{section.code}</code></pre>
				</div>
			</section>
		{/each}

		<section id="benchmark" class="fe-about__payoff">
			<p class="fe-about__eyebrow">now stack all of it</p>
			<h2 class="fe-about__band-title">Try the optimizations live</h2>
			<p class="fe-about__body fe-about__payoff-lead">
				This runs the real predictive-disable workload — simulating every option across a facet — on
				10,000 wines, in your browser, right now. Flip the layers off and watch the same answer take
				longer to compute.
			</p>
			<BenchmarkWidget />
		</section>

		<section class="fe-about__cta">
			<h2 class="fe-about__band-title">See it holding real weight</h2>
			<div class="fe-about__cta-grid">
				<a href="/books" class="fe-about__cta-card">
					<span class="fe-about__cta-eyebrow">client-side engine</span>
					<span class="fe-about__cta-title">Filter in your browser</span>
					<span class="fe-about__cta-body">
						All four acceleration layers running live over 10,000 books — every filter computed in the
						browser, not on a server.
					</span>
					<span class="fe-about__cta-go">Explore the books demo →</span>
				</a>
				<a href="/books-server" class="fe-about__cta-card">
					<span class="fe-about__cta-eyebrow">server-filtered</span>
					<span class="fe-about__cta-title">The same engine, server-side</span>
					<span class="fe-about__cta-body">
						The exact same app, but every mutation round-trips to the SvelteKit server running the
						isomorphic engine in-process. Works with JavaScript disabled.
					</span>
					<span class="fe-about__cta-go">Server-filtered books →</span>
				</a>
			</div>
		</section>
	</main>
</div>
