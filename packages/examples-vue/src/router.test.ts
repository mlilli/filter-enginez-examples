/**
 * Tests that the router keeps the document head on the route it shows.
 *
 * @remarks
 * One static shell serves every route, so each navigation has to write the route's own title,
 * description and canonical URL; the not-found route has to drop the canonical and say `noindex`.
 * `examples-shared/page-meta` decides the values and has its own suite; this pins that the router
 * applies them.
 *
 * It also pins the router's half of following `?f=`: a navigation that keeps the path tells the page's
 * URL follower to look at the URL (`examples-shared/url-state-follower`), and one that changes the
 * path does not, since the page it leaves is going away.
 *
 * @packageDocumentation
 */

import { verticalPageMeta } from '@filter-enginez/examples-shared/page-meta';
import { URL_NAVIGATION_EVENT } from '@filter-enginez/examples-shared/url-state-follower';
import { describe, expect, it, vi } from 'vitest';

import { router } from './router.js';

describe('the router’s page metadata', () => {
	it('writes the hub’s title and canonical URL, then a not-found page’s noindex', async () => {
		await router.push('/');
		expect(document.title).toBe(verticalPageMeta('vue', '/').title);
		expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://vue.filterenginez.com/');

		await router.push('/no-such-page');
		expect(document.title).toBe(verticalPageMeta('vue', '/no-such-page').title);
		expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
		expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
	});
});

describe('the router’s same-route navigations', () => {
	it('tells the URL follower about a navigation that keeps the path, and only about that', async () => {
		const heard = vi.fn();

		window.addEventListener(URL_NAVIGATION_EVENT, heard);
		try {
			await router.push('/no-such-page?f=one');
			heard.mockClear();

			await router.push('/no-such-page?f=two');
			expect(heard).toHaveBeenCalledTimes(1);

			await router.push('/');
			expect(heard).toHaveBeenCalledTimes(1);
		} finally {
			window.removeEventListener(URL_NAVIGATION_EVENT, heard);
		}
	});
});
