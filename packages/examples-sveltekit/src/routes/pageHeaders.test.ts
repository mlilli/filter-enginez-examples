/**
 * Tests that the two pages with nothing else in a header — the hub (`+page.svelte`) and the error
 * page (`+error.svelte`) — carry the app's compact header.
 *
 * @remarks
 * `<AppHeaderBrand>`'s own suite owns the brand's markup and links; this one checks that each page
 * renders it inside `<header class="fe-books-app__header">` and names itself on the subtitle. Both
 * routes read the page from `$app/stores`, which `vitest.config.ts` maps to a store over jsdom's
 * location (`test/appStores.ts`), so each test navigates jsdom to the page's address before it
 * renders, and sets the error page's status there too.
 *
 * @packageDocumentation
 */

import { BRAND_NAV_LABEL, HEADER_PAGE_LABELS } from '@filter-enginez/examples-shared/app-header-core';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import { resetTestPage, showTestPageError } from '../../test/appStores.js';
import ErrorPage from './+error.svelte';
import HubPage from './+page.svelte';

afterEach(() => {
	cleanup();
	resetTestPage();
	window.history.replaceState(null, '', '/');
});

/**
 * The page's compact header, which must be the brand's `<header>`.
 *
 * @param container - The rendered page.
 * @returns The `<header>` holding the brand.
 */
function pageHeader(container: HTMLElement): HTMLElement {
	const header = container.querySelector<HTMLElement>(`nav[aria-label="${BRAND_NAV_LABEL}"]`)?.parentElement;

	expect(header?.tagName).toBe('HEADER');
	expect(header?.className).toBe('fe-books-app__header');

	return header as HTMLElement;
}

describe('the hub', () => {
	it('carries the compact header, naming the page and marking the hub link current', () => {
		const { container } = render(HubPage);
		const header = pageHeader(container);

		expect(header.querySelector('.fe-books-app__subtitle')?.textContent).toBe(`${HEADER_PAGE_LABELS.hub} · SvelteKit`);
		expect(header.querySelector('.fe-books-app__hub')?.getAttribute('aria-current')).toBe('page');
	});

	it('offers the datasets and nothing that leaves for the comparison or how-it-works pages', () => {
		const { container } = render(HubPage);

		expect(container.querySelectorAll('.fe-landing__card').length).toBeGreaterThan(0);
		expect(container.querySelector('.fe-landing__about')).toBeNull();
		expect(container.querySelector('.fe-landing__compare')).toBeNull();
	});
});

describe('the error page', () => {
	it('carries the compact header on a 404, naming the page "Not found"', () => {
		window.history.replaceState(null, '', '/no-such-dataset');
		showTestPageError(404, 'Not Found');

		const header = pageHeader(render(ErrorPage).container);
		const subtitle = header.querySelector('.fe-books-app__subtitle');

		expect(subtitle?.textContent).toBe(`${HEADER_PAGE_LABELS.notFound} · SvelteKit`);
		expect(header.querySelector('.fe-books-app__hub')?.hasAttribute('aria-current')).toBe(false);
	});

	it('names the status, not "Not found", when a load failed', () => {
		window.history.replaceState(null, '', '/books-server');
		showTestPageError(500, 'Internal Error');

		const header = pageHeader(render(ErrorPage).container);

		expect(header.querySelector('.fe-books-app__subtitle')?.textContent).toBe('Error 500 · SvelteKit');
	});
});
