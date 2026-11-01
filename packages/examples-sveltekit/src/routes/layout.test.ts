/**
 * Tests that the root layout renders each page's title, description and canonical URL into the head.
 *
 * @remarks
 * `examples-shared/page-meta` decides the values and has its own suite; this pins that the layout puts
 * them in the head — the SSR'd HTML a crawler reads — and that an error page is `noindex` with no
 * canonical. The page store reads jsdom's location (`test/appStores.ts`), so each test navigates first.
 *
 * It also pins the layout's half of following `?f=`: after a navigation that keeps the page, it tells
 * the page's URL follower to look at the URL (`examples-shared/url-state-follower`), and after one that
 * changes the page it does not.
 *
 * @packageDocumentation
 */

import { verticalPageMeta } from '@filter-enginez/examples-shared/page-meta';
import { URL_NAVIGATION_EVENT } from '@filter-enginez/examples-shared/url-state-follower';
import { cleanup, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { playTestNavigation, resetTestNavigation } from '../../test/appNavigation.js';
import { resetTestPage, showTestPageError } from '../../test/appStores.js';
import Layout from './+layout.svelte';

/** An empty page for the layout to wrap. */
const children = createRawSnippet(() => ({ render: () => '<div></div>' }));

afterEach(() => {
	cleanup();
	resetTestNavigation();
	resetTestPage();
	window.history.replaceState(null, '', '/');
});

describe('the root layout’s head', () => {
	it('names a page, describes it and gives its canonical URL', () => {
		window.history.replaceState(null, '', '/wine');
		render(Layout, { children });

		const meta = verticalPageMeta('sveltekit', '/wine');

		expect(document.title).toBe(meta.title);
		expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(meta.description);
		expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://svelte.filterenginez.com/wine');
		expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
	});

	it('marks an error page noindex, with no canonical', () => {
		window.history.replaceState(null, '', '/wine');
		showTestPageError(404, 'Not found');
		render(Layout, { children });

		expect(document.title).toBe('Page not found — Filter EngineZ · SvelteKit');
		expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
		expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
	});
});

describe('the root layout’s same-page navigations', () => {
	it('tells the URL follower about a navigation that keeps the page, and only about that', () => {
		const heard = vi.fn();

		window.addEventListener(URL_NAVIGATION_EVENT, heard);
		try {
			window.history.replaceState(null, '', '/books');
			render(Layout, { children });

			playTestNavigation('/books?f=one', '/books?f=two');
			expect(heard).toHaveBeenCalledTimes(1);

			playTestNavigation('/books?f=two', '/wine');
			expect(heard).toHaveBeenCalledTimes(1);
		} finally {
			window.removeEventListener(URL_NAVIGATION_EVENT, heard);
		}
	});
});
