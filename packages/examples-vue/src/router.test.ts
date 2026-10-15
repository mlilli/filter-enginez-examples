/**
 * Tests that the router keeps the document head on the route it shows.
 *
 * @remarks
 * One static shell serves every route, so each navigation has to write the route's own title,
 * description and canonical URL; the not-found route has to drop the canonical and say `noindex`.
 * `examples-shared/page-meta` decides the values and has its own suite; this pins that the router
 * applies them.
 *
 * @packageDocumentation
 */

import { verticalPageMeta } from '@filter-enginez/examples-shared/page-meta';
import { describe, expect, it } from 'vitest';

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
