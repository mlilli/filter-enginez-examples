/**
 * The comparison page's browser half: render the view for the page's own query and host.
 *
 * @remarks
 * `compare.html` arrives with a cold visit already rendered into it (`prerenderCompare`), linked to
 * the deployed apps. This replaces that with the view for what the visitor actually asked for — the
 * dataset, a preset, or their own `?f=` from an app's Compare button — linked to the apps where this
 * page is served from: the deployed subdomains, or the local dev servers on a loopback host.
 *
 * The markup is the same string renderer the build uses (`compareView.ts`), with every value escaped,
 * so the two halves cannot drift apart. The toggles are plain links back to this page: each choice is
 * a navigation, and a new render, rather than client-side state.
 *
 * @packageDocumentation
 */

import { readCompareQuery, renderCompareView } from './compareView.js';

/** The parts of `window.location` this module reads. */
export interface ComparePageLocation {
	/** Host without port — the dev check. */
	readonly hostname: string;
	/** Scheme + host + port. */
	readonly origin: string;
	/** The query string. */
	readonly search: string;
}

/**
 * Render the page's view in place.
 *
 * @param page - The document holding the prerendered page.
 * @param location - The page's location.
 * @throws If the page lacks its heading or view element, which would mean `compare.html` changed shape.
 */
export function enhanceComparePage(page: Document, location: ComparePageLocation): void {
	const heading = page.querySelector('[data-compare-heading]');
	const view = page.querySelector('[data-compare-view]');

	if (heading === null || view === null) {
		throw new Error('compare.html must have a [data-compare-heading] heading and a [data-compare-view] element.');
	}

	const rendered = renderCompareView(readCompareQuery(location.search), location);

	heading.textContent = rendered.heading;
	// Every value in this markup is escaped by `renderCompareView`; see `compareView.ts`.
	view.innerHTML = rendered.viewHtml;
}
