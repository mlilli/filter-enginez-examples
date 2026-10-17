/**
 * The how-it-works page's browser half: bring the statically rendered page to life.
 *
 * @remarks
 * `how-it-works.html` already holds every word of the page when it arrives — the eight bands, the
 * act-two divider, the mini table of contents and the benchmark section's frame are rendered into it
 * at build time by `prerender.ts`, so a search engine or a reader without JavaScript gets the whole
 * narrative. This module only adds what needs a browser, and finds everything it touches by the
 * `data-*` hooks that markup leaves for it:
 *
 * - **Figures.** Each band's `[data-figure]` placeholder receives its hand-built SVG figure from the
 *   registry, gated by {@link observeInView} so an off-screen figure rests on its completed static
 *   frame. The figure CSS animates only under `prefers-reduced-motion: no-preference`, so a visitor
 *   who asked for less motion sees that frame too.
 * - **The live benchmark.** `[data-benchmark]` holds the committed reference numbers as text; the
 *   widget replaces them, starts on those same reference numbers, and upgrades to a live measurement
 *   once the engine and the wine corpus have loaded — fetched only when the widget nears the viewport
 *   or is used — and the timing is stable enough to trust.
 * - **Cross-app links.** A demo link names its vertical and path (`data-vertical`, `data-path`) and
 *   ships with the deployed URL; here it is re-resolved from the page's own location, so a developer
 *   running everything locally lands on the local dev server — the same rule `/compare` follows.
 * - **The scroll-spy.** The table of contents marks the band with the highest visible ratio.
 *
 * Every step tolerates a missing piece (no `IntersectionObserver`, a placeholder naming no figure),
 * because a page that is already readable must not be broken by its enhancement.
 *
 * @packageDocumentation
 */

import { type CompareLocation, resolveVerticalOrigin } from '@filter-enginez/examples-shared/compare-core';
import { type VerticalId, VERTICALS } from '@filter-enginez/examples-shared/verticals';

import { type BenchmarkWidget, createBenchmarkWidget } from './benchmarkWidget.js';
import { HOW_IT_WORKS_FIGURES } from './figureRegistry.js';
import { observeInView } from './figures/index.js';

/** The class the scroll-spy toggles on the table-of-contents link of the band most in view. */
const ACTIVE_CLASS = 'is-active';

/**
 * Every vertical id, keyed by itself, for turning a `data-vertical` string read from markup into a
 * `VerticalId` only when it names a real vertical.
 */
const VERTICAL_IDS: ReadonlyMap<string, VerticalId> = new Map(VERTICALS.map((descriptor) => [descriptor.id, descriptor.id]));

/**
 * Mount each band's figure into its `[data-figure]` placeholder.
 *
 * @param root - Where to look for placeholders.
 * @returns One in-view teardown per mounted figure.
 */
function mountFigures(root: ParentNode): (() => void)[] {
	const teardowns: (() => void)[] = [];

	for (const placeholder of root.querySelectorAll<HTMLElement>('[data-figure]')) {
		// `String()` rather than `?? ''`: the selector guarantees the attribute, so a fallback would be a
		// branch nothing can reach.
		const buildFigure = HOW_IT_WORKS_FIGURES.get(String(placeholder.dataset['figure']));

		if (buildFigure !== undefined) {
			const figure = buildFigure();

			placeholder.replaceChildren(figure);
			teardowns.push(observeInView(figure));
		}
	}

	return teardowns;
}

/**
 * Point every demo link at its vertical's origin for the current deployment layout.
 *
 * @param root - Where to look for links.
 * @param location - The page's location, which decides between the dev and the deployed origins.
 */
function resolveDemoLinks(root: ParentNode, location: CompareLocation): void {
	for (const link of root.querySelectorAll<HTMLAnchorElement>('a[data-vertical][data-path]')) {
		// Both attributes are guaranteed by the selector; `String()` keeps that without a dead fallback.
		const verticalId = VERTICAL_IDS.get(String(link.dataset['vertical']));
		const path = String(link.dataset['path']);

		if (verticalId !== undefined && path.startsWith('/')) {
			link.href = `${resolveVerticalOrigin(verticalId, location)}${path}`;
		}
	}
}

/**
 * Mount the live benchmark widget in place of the reference numbers its slot holds.
 *
 * @param slot - The `[data-benchmark]` element.
 * @returns The mounted widget, whose `dispose` the page's teardown calls.
 */
function mountBenchmark(slot: HTMLElement): BenchmarkWidget {
	const widget = createBenchmarkWidget();

	slot.replaceChildren(widget.element);

	return widget;
}

/**
 * Highlight the table-of-contents link of the band with the highest intersection ratio.
 *
 * @param root - Where to find the table of contents and the bands its links point at.
 * @returns A teardown disconnecting the observer, or a no-op where `IntersectionObserver` is absent.
 */
function startScrollSpy(root: ParentNode): () => void {
	const linksById = new Map<string, HTMLAnchorElement>();

	for (const link of root.querySelectorAll<HTMLAnchorElement>('.fe-about__toc a[href^="#"]')) {
		linksById.set(link.hash.slice(1), link);
	}

	if (typeof IntersectionObserver === 'undefined' || linksById.size === 0) {
		return () => {
			// Nothing was observed, so there is nothing to disconnect.
		};
	}

	const ratios = new Map<string, number>();
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
			}

			let bestId = '';
			let bestRatio = 0;

			for (const [id, ratio] of ratios) {
				if (ratio > bestRatio) {
					bestRatio = ratio;
					bestId = id;
				}
			}
			if (bestId !== '') {
				for (const [id, link] of linksById) {
					link.classList.toggle(ACTIVE_CLASS, id === bestId);
				}
			}
		},
		{ rootMargin: '-8% 0px -45% 0px', threshold: [0.2, 0.5, 0.8]},
	);

	// Matched by id rather than through a `#id` selector, which would need escaping for an arbitrary id.
	for (const target of root.querySelectorAll('[id]')) {
		if (linksById.has(target.id)) {
			observer.observe(target);
		}
	}

	return () => {
		observer.disconnect();
	};
}

/**
 * Enhance the statically rendered how-it-works page: mount the figures and the live benchmark, resolve
 * the cross-app links and start the scroll-spy.
 *
 * @param root - The document (or, in tests, any subtree) holding the page's markup.
 * @param location - The page's location; decides between the local and the deployed origins.
 * @returns A teardown that disconnects every observer and cancels any in-flight measurement. Safe to
 *   call more than once.
 *
 * @example
 * ```ts
 * enhanceHowItWorksPage(document, window.location);
 * ```
 */
export function enhanceHowItWorksPage(root: ParentNode, location: CompareLocation): () => void {
	const figureTeardowns = mountFigures(root);
	const benchmarkSlot = root.querySelector<HTMLElement>('[data-benchmark]');
	const benchmark = benchmarkSlot === null ? null : mountBenchmark(benchmarkSlot);

	resolveDemoLinks(root, location);

	const stopScrollSpy = startScrollSpy(root);

	return () => {
		stopScrollSpy();
		for (const teardown of figureTeardowns) {
			teardown();
		}
		benchmark?.dispose();
	};
}
