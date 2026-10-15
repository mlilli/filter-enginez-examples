/**
 * Tests for each demo page's title, description and canonical URL.
 *
 * @remarks
 * The claim worth pinning is the one a search engine acts on: every page a vertical serves has a
 * canonical URL of its own on that vertical's host (so no route is folded into the hub), and every other
 * path is `noindex` with no canonical (so an SPA's status-200 not-found page is never indexed).
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { DATASET_ROUTES } from '../landing/landingCards.js';
import { LAB_ROUTE_PATH, vertical, VERTICALS } from '../verticals/verticals.js';
import {
	docsCanonicalUrl,
	isDocsPath,
	notFoundPageMeta,
	verticalIndexablePaths,
	verticalPageMeta,
} from './pageMeta.js';

describe('verticalIndexablePaths', () => {
	it('lists the hub and every dataset route, without the documentation', () => {
		expect(verticalIndexablePaths('react-rtk')).toEqual(['/', '/books', '/books-server', '/books-config', '/wine', '/real-estate']);
		expect(verticalIndexablePaths('vanilla')).toEqual(['/', '/books', '/books-raw', '/wine', '/wine-server', '/real-estate']);
	});

	it('adds the lab only where it is served', () => {
		expect(verticalIndexablePaths('react-plain')).toContain(LAB_ROUTE_PATH);
		expect(VERTICALS.filter(({ id }) => verticalIndexablePaths(id).includes(LAB_ROUTE_PATH)).map(({ id }) => id)).toEqual(['react-plain']);
	});
});

describe('verticalPageMeta', () => {
	it('gives the hub the title and description its HTML shell carries, canonical on its host', () => {
		const { pageDescription, pageTitle, productionOrigin } = vertical('vue');

		expect(verticalPageMeta('vue', '/')).toEqual({ canonicalUrl: `${productionOrigin}/`, description: pageDescription, title: pageTitle });
	});

	it('names a dataset page by its landing card, describes it by the card’s blurb, and makes it canonical on its own path', () => {
		const wine = DATASET_ROUTES.find((card) => card.href === '/wine');

		expect(verticalPageMeta('sveltekit', '/wine')).toEqual({
			canonicalUrl: 'https://svelte.filterenginez.com/wine',
			description: wine?.blurb,
			title: `${wine?.label ?? ''} — Filter EngineZ · SvelteKit`,
		});
	});

	it('names the lab with its own copy', () => {
		const meta = verticalPageMeta('react-plain', LAB_ROUTE_PATH);

		expect(meta.canonicalUrl).toBe('https://react.filterenginez.com/lab');
		expect(meta.title).toBe('The lab — Filter EngineZ · React');
		expect(meta.description).toContain('projection, similarity search and co-occurrence suggestions');
	});

	it('ignores a trailing slash, and never puts one in the canonical URL', () => {
		expect(verticalPageMeta('angular', '/books/').canonicalUrl).toBe('https://angular.filterenginez.com/books');
	});

	it.each([
		['an unknown path', 'vue', '/does-not-exist'],
		['a dataset the vertical does not serve', 'vue', '/books-server'],
		['the lab on a vertical without it', 'react-rtk', LAB_ROUTE_PATH],
	] as const)('treats %s as not found: noindex, no canonical', (_label, id, path) => {
		expect(verticalPageMeta(id, path)).toEqual(notFoundPageMeta(vertical(id).pageTitle));
	});

	it('gives every indexable path of every vertical a distinct title and a description', () => {
		for (const { id } of VERTICALS) {
			const described = verticalIndexablePaths(id).map((path) => verticalPageMeta(id, path));

			expect(described.every((meta) => meta.canonicalUrl !== null && meta.description !== '')).toBe(true);
			expect(new Set(described.map((meta) => meta.title)).size).toBe(described.length);
		}
	});
});

describe('the documentation', () => {
	it.each([
		['/docs', true],
		['/docs/rules/value', true],
		['/documents', false],
		['/books', false],
	])('isDocsPath(%s) is %s', (path, expected) => {
		expect(isDocsPath(path)).toBe(expected);
	});

	it('is canonical on the documentation site', () => {
		expect(docsCanonicalUrl('/docs/api')).toBe('https://docs.filterenginez.com/docs/api');
	});

	it('names a not-found page after its site, with no canonical and no description', () => {
		expect(notFoundPageMeta('Filter EngineZ · Vue')).toEqual({
			canonicalUrl: null,
			description: '',
			title: 'Page not found — Filter EngineZ · Vue',
		});
	});
});
