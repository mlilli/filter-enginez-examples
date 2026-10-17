/**
 * Tests for `comparePage.ts` — the comparison page rendering itself for the visitor's query and host.
 *
 * @remarks
 * Runs against a page shaped like `compare.html` — its two hooks, filled by the same build-time render
 * the Vite build applies — so what is asserted is the swap from the prerendered cold visit to the view
 * the visitor asked for. The real file's slots are checked by the build itself, which throws on a
 * missing one.
 *
 * @packageDocumentation
 */

import { URL_STATE_PARAM } from '@filter-enginez/examples-shared/compare-core';
import { afterEach, describe, expect, it } from 'vitest';

import { enhanceComparePage } from './comparePage.js';
import { COMPARE_HEADING_SLOT, COMPARE_VIEW_SLOT, prerenderCompare } from './compareView.js';

/** The page's `<main>` after the build's render, as the browser receives it. */
const PAGE_HTML = prerenderCompare(
	`<main class="fe-compare"><h1 data-compare-heading>${COMPARE_HEADING_SLOT}</h1>`
		+ `<div data-compare-view>${COMPARE_VIEW_SLOT}</div></main>`,
);

/** A loopback host, the developer's machine. */
const DEV = { hostname: '127.0.0.1', origin: 'http://127.0.0.1:24617' };

/**
 * Load the page into the test document.
 *
 * @returns The document.
 */
function loadPage(): Document {
	document.body.innerHTML = PAGE_HTML;

	return document;
}

afterEach(() => {
	document.body.replaceChildren();
});

describe('enhanceComparePage', () => {
	it('renders a visitor’s own state from the query, verbatim', () => {
		const page = loadPage();
		const inbound = 'h~{"version":1,"rules":[]}';

		enhanceComparePage(page, { ...DEV, search: `?dataset=wine&f=${encodeURIComponent(inbound)}` });

		expect(page.querySelector('.fe-compare__state-value')?.textContent).toBe(inbound);

		const rows = [...page.querySelectorAll<HTMLAnchorElement>('.fe-compare__row-name')];

		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			const url = new URL(row.href);

			expect(url.pathname).toBe('/wine');
			expect(url.searchParams.get(URL_STATE_PARAM)).toBe(inbound);
		}
	});

	it('re-links the prerendered production rows to the local dev servers on a loopback host', () => {
		const page = loadPage();
		const before = page.querySelector<HTMLAnchorElement>('.fe-compare__row-name')?.href ?? '';

		enhanceComparePage(page, { ...DEV, search: '' });

		expect(before.startsWith('https://')).toBe(true);
		expect(page.querySelector<HTMLAnchorElement>('.fe-compare__row-name')?.href.startsWith('http://127.0.0.1:')).toBe(true);
	});

	it('updates the heading with the dataset', () => {
		const page = loadPage();

		enhanceComparePage(page, { ...DEV, search: '?dataset=wine-server' });

		expect(page.querySelector('[data-compare-heading]')?.textContent).toContain('both');
	});

	it('refuses a page without its hooks', () => {
		document.body.innerHTML = '<main></main>';

		expect(() => {
			enhanceComparePage(document, { ...DEV, search: '' });
		}).toThrow('data-compare-view');
	});
});
