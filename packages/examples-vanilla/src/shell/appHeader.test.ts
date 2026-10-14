/**
 * Tests for `appHeader.ts` — the header brand every page of this app carries.
 *
 * @remarks
 * jsdom serves from a loopback host, so the two links to the landing site resolve to the local site
 * server; the expected URLs come from the shared resolver, whose own suite pins the literals.
 *
 * @packageDocumentation
 */

import {
	ALL_DEMOS_LABEL,
	appHeaderLinks,
	appHeaderSubtitle,
	HEADER_PAGE_LABELS,
	SITE_HOME_LABEL,
} from '@filter-enginez/examples-shared/app-header-core';
import { afterEach, describe, expect, it } from 'vitest';

import { createAppHeaderBrand, createPageHeader } from './appHeader.js';

/** The landing-site links for the test page's location. */
const LINKS = appHeaderLinks(window.location);

afterEach(() => {
	window.history.replaceState(null, '', '/');
});

describe('createAppHeaderBrand', () => {
	it('links the logomark home by name, and the wordmark home for the pointer only', () => {
		const brand = createAppHeaderBrand(appHeaderSubtitle('Wine', 'vanilla', 'worker'));
		const home = brand.querySelector(`a[aria-label="${SITE_HOME_LABEL}"]`);
		const wordmark = brand.querySelector('.fe-books-app__name');

		expect(brand.tagName).toBe('NAV');
		expect(home?.getAttribute('href')).toBe(LINKS.homeHref);
		expect(home?.querySelector('img')?.getAttribute('src')).toBe('/mark.svg');
		expect(wordmark?.getAttribute('href')).toBe(LINKS.homeHref);
		expect(wordmark?.getAttribute('tabindex')).toBe('-1');
		expect(wordmark?.getAttribute('aria-hidden')).toBe('true');
	});

	it('links the app name in the subtitle to the hub, keeping the subtitle text whole', () => {
		window.history.replaceState(null, '', '/wine');

		const brand = createAppHeaderBrand(appHeaderSubtitle('Wine', 'vanilla', 'worker'));
		const hub = brand.querySelector('.fe-books-app__hub');

		expect(hub?.getAttribute('href')).toBe('/');
		expect(hub?.getAttribute('aria-label')).toBe('Vanilla dataset hub');
		expect(hub?.hasAttribute('aria-current')).toBe(false);
		expect(brand.querySelector('.fe-books-app__subtitle')?.textContent).toBe('Wine · Vanilla (worker)');
	});

	it('marks the hub link as the current page on the hub', () => {
		const brand = createAppHeaderBrand(appHeaderSubtitle(HEADER_PAGE_LABELS.hub, 'vanilla'));

		expect(brand.querySelector('.fe-books-app__hub')?.getAttribute('aria-current')).toBe('page');
	});

	it('names the page alone, with no hub link, outside an app', () => {
		const brand = createAppHeaderBrand(appHeaderSubtitle('Docs'));

		expect(brand.querySelector('.fe-books-app__hub')).toBeNull();
		expect(brand.querySelector('.fe-books-app__subtitle')?.textContent).toBe('Docs');
	});

	it('offers "All demos" on the landing page’s demo list', () => {
		const link = createAppHeaderBrand(appHeaderSubtitle('Books', 'vanilla')).querySelector('.fe-books-app__all-demos');

		expect(link?.textContent).toBe(ALL_DEMOS_LABEL);
		expect(link?.getAttribute('href')).toBe(LINKS.allDemosHref);
	});
});

describe('createPageHeader', () => {
	it('wraps the brand in the app header', () => {
		const header = createPageHeader(appHeaderSubtitle(HEADER_PAGE_LABELS.hub, 'vanilla'));

		expect(header.tagName).toBe('HEADER');
		expect(header.className).toBe('fe-books-app__header');
		expect(header.querySelector('.fe-books-app__brand')).not.toBeNull();
	});
});
