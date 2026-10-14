/**
 * Tests for `<AppHeaderBrand>` — the header brand every page of this app carries.
 *
 * @remarks
 * The component reads the page from `$app/stores`, which `vitest.config.ts` maps to a store over
 * jsdom's location (`test/appStores.ts`), so each test picks the page by navigating jsdom before it
 * renders. jsdom serves from a loopback host, so the two links to the landing site resolve to the
 * local site server; the expected URLs come from the shared resolver, whose own suite pins the
 * literals.
 *
 * @packageDocumentation
 */

import {
	ALL_DEMOS_LABEL,
	appHeaderLinks,
	BRAND_NAV_LABEL,
	HEADER_PAGE_LABELS,
	SITE_HOME_LABEL,
} from '@filter-enginez/examples-shared/app-header-core';
import { cleanup, render, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import AppHeaderBrand from './AppHeaderBrand.svelte';

/** The landing-site links for the test page's location. */
const LINKS = appHeaderLinks(window.location);

afterEach(() => {
	cleanup();
	window.history.replaceState(null, '', '/');
});

/**
 * Render the brand on a page of this app.
 *
 * @param pathname - The address the page is on.
 * @param props - The brand's props.
 * @returns The brand's `<nav>`.
 */
function renderBrandAt(pathname: string, props: { page: string; tier?: 'server' | 'worker' }): HTMLElement {
	window.history.replaceState(null, '', pathname);

	const { getByRole } = render(AppHeaderBrand, props);

	return getByRole('navigation', { name: BRAND_NAV_LABEL });
}

describe('<AppHeaderBrand>', () => {
	it('links the logomark home by name, and the wordmark home for the pointer only', () => {
		const brand = renderBrandAt('/wine', { page: 'Wine', tier: 'worker' });
		const home = within(brand).getByRole('link', { name: SITE_HOME_LABEL });
		const wordmark = brand.querySelector('.fe-books-app__name');

		expect(brand.className).toBe('fe-books-app__brand');
		expect(home.getAttribute('href')).toBe(LINKS.homeHref);
		expect(home.className).toBe('fe-books-app__home');
		expect(home.querySelector('img')?.getAttribute('src')).toBe('/mark.svg');
		expect(home.querySelector('img')?.getAttribute('alt')).toBe('');
		expect(wordmark?.getAttribute('href')).toBe(LINKS.homeHref);
		expect(wordmark?.getAttribute('tabindex')).toBe('-1');
		expect(wordmark?.getAttribute('aria-hidden')).toBe('true');
	});

	it('links the app name in the subtitle to the hub, keeping the subtitle text whole', () => {
		const brand = renderBrandAt('/wine-server', { page: 'Wine', tier: 'server' });
		const hub = within(brand).getByRole('link', { name: 'SvelteKit dataset hub' });

		expect(hub.getAttribute('href')).toBe('/');
		expect(hub.className).toBe('fe-books-app__hub');
		expect(hub.textContent).toBe('SvelteKit');
		expect(hub.hasAttribute('aria-current')).toBe(false);
		expect(brand.querySelector('.fe-books-app__subtitle')?.textContent).toBe('Wine · SvelteKit (server)');
	});

	it('names no tier when the route runs none', () => {
		const brand = renderBrandAt('/books', { page: 'Books' });

		expect(brand.querySelector('.fe-books-app__subtitle')?.textContent).toBe('Books · SvelteKit');
	});

	it('marks the hub link as the current page on the hub', () => {
		const brand = renderBrandAt('/', { page: HEADER_PAGE_LABELS.hub });

		expect(within(brand).getByRole('link', { name: 'SvelteKit dataset hub' }).getAttribute('aria-current')).toBe('page');
	});

	it('offers "All demos" on the landing page’s demo list', () => {
		const brand = renderBrandAt('/books', { page: 'Books' });
		const link = within(brand).getByRole('link', { name: ALL_DEMOS_LABEL });

		expect(link.getAttribute('href')).toBe(LINKS.allDemosHref);
		expect(link.className).toBe('fe-books-app__nav-link fe-books-app__all-demos');
	});
});
