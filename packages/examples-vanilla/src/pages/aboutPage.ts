/**
 * `/about` — the "How the engine works" narrative, framework-less.
 *
 * @remarks
 * Renders the shared `about-core` content model over the same `fe-about__*` / `fe-fig-*` /
 * `fe-bench__*` classes from `ui-styles` as the React, Vue, SvelteKit, and Angular verticals — with the eight
 * algorithm figures hand-built via the `svg()` helper and the live benchmark widget running the real
 * engine workload.
 *
 * The sticky mini table-of-contents tracks the section in view via an `IntersectionObserver`,
 * mirroring React's `useActiveSection` and the Vue/Svelte scroll-spies. The figures' play/pause
 * gating uses a second observer (`observeInView`) so an off-screen figure rests on its completed
 * static frame — the same behavior the `v-in-view` directive gives Vue.
 *
 * @packageDocumentation
 */

import { ABOUT_SECTIONS } from '@filter-enginez/examples-shared/about-core';

import type { RouteTeardown } from '../router.js';

import { createBenchmarkWidget } from '../about/benchmarkWidget.js';
import { ABOUT_FIGURES } from '../about/figureRegistry.js';
import { observeInView } from '../about/figures/index.js';
import { el } from '../dom.js';

/** All scroll-spy targets, in document order (the eight bands + the benchmark payoff). */
const SECTION_IDS: readonly string[] = [...ABOUT_SECTIONS.map((section) => section.id), 'benchmark'];

/**
 * Render the About page.
 *
 * @param container - The route container.
 * @returns A teardown detaching both observers and the benchmark widget.
 */
export function renderAboutPage(container: HTMLElement): RouteTeardown {
	const benchmark = createBenchmarkWidget();
	/** Teardowns for every figure's in-view observer. */
	const figureTeardowns: (() => void)[] = [];
	/** The TOC links, keyed by section id, so the scroll-spy can toggle `is-active` in place. */
	const tocLinks = new Map<string, HTMLElement>();

	/** One TOC entry. */
	function tocLink(id: string, label: string): HTMLElement {
		const link = el('a', {
			attrs: { href: `#${id}` },
			children: [el('span', { attrs: { 'aria-hidden': 'true' }, className: 'fe-about__toc-dot' }), label],
			className: 'fe-about__toc-link',
		});

		tocLinks.set(id, link);

		return link;
	}

	/** The eight narrative bands, with the act-two divider injected before the first `beyond` band. */
	function bands(): HTMLElement[] {
		const out: HTMLElement[] = [];

		ABOUT_SECTIONS.forEach((section, index) => {
			const isBeyondStart = section.group === 'beyond' && ABOUT_SECTIONS[index - 1]?.group !== 'beyond';

			if (isBeyondStart) {
				out.push(
					el('div', {
						children: [
							el('p', { className: 'fe-about__eyebrow', text: 'act two' }),
							el('h2', { className: 'fe-about__act-title', text: 'Beyond filtering' }),
							el('p', {
								className: 'fe-about__act-lead',
								text:
									'The same bitmaps, signatures, and counts power more than intersection — suggestions, '
									+ 'similarity, probabilistic membership, and text search.',
							}),
						],
						className: 'fe-about__act',
					}),
				);
			}

			const buildFigure = ABOUT_FIGURES[section.id];
			const figureHost = el('div', { className: 'fe-about__figure' });

			if (buildFigure !== undefined) {
				const figure = buildFigure();

				figureHost.append(figure);
				figureTeardowns.push(observeInView(figure));
			}

			out.push(
				el('section', {
					attrs: { id: section.id },
					children: [
						figureHost,
						el('div', {
							children: [
								el('p', { className: 'fe-about__eyebrow', text: section.eyebrow }),
								el('h2', { className: 'fe-about__band-title', text: section.title }),
								el('p', { className: 'fe-about__body', text: section.body }),
								el('pre', {
									children: [el('code', { text: section.code })],
									className: 'fe-about__code',
								}),
							],
							className: 'fe-about__copy',
						}),
					],
					className: index % 2 === 1 ? 'fe-about__band is-reversed' : 'fe-about__band',
				}),
			);
		});

		return out;
	}

	container.append(
		el('div', {
			children: [
				el('header', {
					children: [
						el('a', {
							attrs: { 'aria-label': 'Filter EngineZ — back to the dataset hub', href: '/' },
							children: [
								el('span', {
									attrs: { 'aria-hidden': 'true' },
									children: [el('img', { attrs: { alt: '', height: 28, src: '/mark.svg', width: 28 }})],
									className: 'fe-about__brand-mark',
								}),
								el('span', { className: 'fe-about__brand-word', text: 'Filter EngineZ' }),
							],
							className: 'fe-about__brand',
						}),
						el('a', { attrs: { href: '/' }, className: 'fe-about__back', text: '← datasets' }),
					],
					className: 'fe-about__topbar',
				}),
				el('section', {
					children: [
						el('p', { className: 'fe-about__eyebrow', text: 'the engine' }),
						el('h1', { className: 'fe-about__hero-title', text: 'How the engine works' }),
						el('p', {
							className: 'fe-about__hero-lead',
							text:
								'Most filter engines answer your question by checking every record. Filter EngineZ answers '
								+ 'it by doing as little as possible — stacking four classic data-structure tricks so the '
								+ 'same results come back in a fraction of the work.',
						}),
					],
					className: 'fe-about__hero',
				}),
				el('nav', {
					attrs: { 'aria-label': 'On this page' },
					children: [
						...ABOUT_SECTIONS.map((section) => tocLink(section.id, section.tocLabel)),
						tocLink('benchmark', 'Try it live'),
					],
					className: 'fe-about__toc',
				}),
				el('main', {
					children: [
						...bands(),
						el('section', {
							attrs: { id: 'benchmark' },
							children: [
								el('p', { className: 'fe-about__eyebrow', text: 'now stack all of it' }),
								el('h2', { className: 'fe-about__band-title', text: 'Try the optimizations live' }),
								el('p', {
									className: 'fe-about__body fe-about__payoff-lead',
									text:
										'This runs the real predictive-disable workload — simulating every option across a '
										+ 'facet — on 10,000 wines, in your browser, right now. Flip the layers off and watch '
										+ 'the same answer take longer to compute.',
								}),
								benchmark.element,
							],
							className: 'fe-about__payoff',
						}),
						el('section', {
							children: [
								el('h2', { className: 'fe-about__band-title', text: 'See it holding real weight' }),
								el('div', {
									children: [
										ctaCard(
											'/books',
											'fine-grained signals',
											'Filter in your browser',
											'All four acceleration layers over 10,000 books, with each field bound to its own '
											+ 'engine signal.',
											'Explore the signals demo →',
										),
										ctaCard(
											'/books-raw',
											'no reactive surface',
											'The same app, bare engine',
											'Identical UI driven by @filter-enginez/core alone — one coarse subscribe, no '
											+ 'adapter package at all.',
											'Explore the bare-core demo →',
										),
									],
									className: 'fe-about__cta-grid',
								}),
							],
							className: 'fe-about__cta',
						}),
					],
					className: 'fe-about__bands',
				}),
			],
			className: 'fe-about',
		}),
	);

	// ── Scroll-spy: highlight the TOC entry with the highest intersection ratio ──
	let spy: IntersectionObserver | null = null;

	if (typeof IntersectionObserver !== 'undefined') {
		const ratios: Record<string, number> = {};

		spy = new IntersectionObserver(
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
					for (const [id, link] of tocLinks) {
						link.classList.toggle('is-active', id === best);
					}
				}
			},
			{ rootMargin: '-8% 0px -45% 0px', threshold: [0.2, 0.5, 0.8]},
		);
		for (const id of SECTION_IDS) {
			const element = document.getElementById(id);

			if (element !== null) {
				spy.observe(element);
			}
		}
	}

	return () => {
		spy?.disconnect();
		for (const teardown of figureTeardowns) {
			teardown();
		}
		benchmark.dispose();
	};
}

/**
 * One deep-link card in the closing CTA band.
 *
 * @internal
 */
function ctaCard(href: string, eyebrow: string, title: string, body: string, go: string): HTMLElement {
	return el('a', {
		attrs: { href },
		children: [
			el('span', { className: 'fe-about__cta-eyebrow', text: eyebrow }),
			el('span', { className: 'fe-about__cta-title', text: title }),
			el('span', { className: 'fe-about__cta-body', text: body }),
			el('span', { className: 'fe-about__cta-go', text: go }),
		],
		className: 'fe-about__cta-card',
	});
}
