/**
 * Tests for the sitemap: exactly the expected pages, each one a real page with that URL as its own
 * canonical, in valid XML with every field.
 *
 * @remarks
 * Runs under jsdom for its XML parser (`DOMParser`): a document that does not parse is the failure no
 * string comparison would notice.
 *
 * @packageDocumentation
 */

import { DOCS_SITE_BASE_PATH, verticalPageMeta } from '@filter-enginez/examples-shared/page-meta';
import { docsPageMeta, docsPagePaths } from '@filter-enginez/examples-shared/page-meta-docs';
import { VERTICALS } from '@filter-enginez/examples-shared/verticals';
import { describe, expect, it } from 'vitest';

import { renderSitemap, sitemapEntries, sitemapLastmod } from './sitemap.js';

/** Every URL the sitemap lists that is not a documentation page, spelled out: the list this test pins. */
const NON_DOCS_URLS = [
	'https://filterenginez.com/',
	'https://filterenginez.com/compare',
	'https://filterenginez.com/how-it-works',
	'https://react-rtk.filterenginez.com/',
	'https://react-rtk.filterenginez.com/books',
	'https://react-rtk.filterenginez.com/books-server',
	'https://react-rtk.filterenginez.com/books-config',
	'https://react-rtk.filterenginez.com/wine',
	'https://react-rtk.filterenginez.com/real-estate',
	'https://react.filterenginez.com/',
	'https://react.filterenginez.com/books',
	'https://react.filterenginez.com/books-server',
	'https://react.filterenginez.com/books-config',
	'https://react.filterenginez.com/wine',
	'https://react.filterenginez.com/real-estate',
	'https://react.filterenginez.com/lab',
	'https://svelte.filterenginez.com/',
	'https://svelte.filterenginez.com/books',
	'https://svelte.filterenginez.com/books-server',
	'https://svelte.filterenginez.com/wine',
	'https://svelte.filterenginez.com/wine-server',
	'https://svelte.filterenginez.com/real-estate',
	'https://vue.filterenginez.com/',
	'https://vue.filterenginez.com/books',
	'https://vue.filterenginez.com/wine',
	'https://vue.filterenginez.com/real-estate',
	'https://angular.filterenginez.com/',
	'https://angular.filterenginez.com/books',
	'https://angular.filterenginez.com/books-server',
	'https://angular.filterenginez.com/wine',
	'https://angular.filterenginez.com/real-estate',
	'https://vanilla.filterenginez.com/',
	'https://vanilla.filterenginez.com/books',
	'https://vanilla.filterenginez.com/books-raw',
	'https://vanilla.filterenginez.com/wine',
	'https://vanilla.filterenginez.com/wine-server',
	'https://vanilla.filterenginez.com/real-estate',
];

/** The documentation site's origin. */
const DOCS = 'https://docs.filterenginez.com';

/** A fixed `lastmod` for rendering. */
const LASTMOD = '2026-10-14T08:03:28Z';

const entries = sitemapEntries();
const urls = entries.map((entry) => entry.loc);

describe('the pages the sitemap lists', () => {
	it('lists exactly the apex pages and the demo apps’ pages, then the documentation’s', () => {
		const docsUrls = urls.filter((url) => url.startsWith(`${DOCS}/`));

		expect(urls.filter((url) => !url.startsWith(`${DOCS}/`))).toEqual(NON_DOCS_URLS);
		expect(docsUrls).toEqual(docsPagePaths(DOCS_SITE_BASE_PATH).map((path) => `${DOCS}${path}`));
		expect(docsUrls[0], 'the documentation home, at the site’s root').toBe(`${DOCS}/`);
		// Non-vacuous: the home, sixteen rules, eight algorithms, the playground and the API reference.
		expect(docsUrls.length).toBeGreaterThan(20);
	});

	it('lists each URL once, on https, on a filterenginez.com host, with no query, fragment or redirecting path', () => {
		expect(new Set(urls).size).toBe(urls.length);
		for (const url of urls) {
			const parsed = new URL(url);

			expect(parsed.protocol).toBe('https:');
			expect(parsed.hostname === 'filterenginez.com' || parsed.hostname.endsWith('.filterenginez.com')).toBe(true);
			expect(parsed.search + parsed.hash).toBe('');
		}
		expect(urls.filter((url) => /\/(about|compare)$/u.test(url) && !url.startsWith('https://filterenginez.com/'))).toEqual([]);
		// The documentation site's `/docs` addresses are redirects to its root.
		expect(urls.filter((url) => url.startsWith(`${DOCS}/docs`))).toEqual([]);
	});

	it('leaves out the documentation the React apps also serve, which is canonical on the documentation site', () => {
		expect(urls.filter((url) => url.includes('/docs') && !url.startsWith(`${DOCS}/`))).toEqual([]);
	});

	it('lists every demo page under the URL the page itself declares canonical, so each is a real page', () => {
		for (const { id, productionOrigin } of VERTICALS) {
			for (const url of urls.filter((candidate) => candidate.startsWith(`${productionOrigin}/`))) {
				expect(verticalPageMeta(id, new URL(url).pathname).canonicalUrl).toBe(url);
			}
		}
		for (const url of urls.filter((candidate) => candidate.startsWith(`${DOCS}/`))) {
			expect(docsPageMeta(new URL(url).pathname, DOCS_SITE_BASE_PATH).canonicalUrl).toBe(url);
		}
	});

	it('ranks the home first, then the explainers, the demo hubs, and the dataset and documentation pages', () => {
		const priorityOf = (url: string): number | undefined => entries.find((entry) => entry.loc === url)?.priority;

		expect(priorityOf('https://filterenginez.com/')).toBe(1);
		expect(priorityOf('https://filterenginez.com/how-it-works')).toBe(0.9);
		expect(priorityOf('https://filterenginez.com/compare')).toBe(0.8);
		expect(priorityOf('https://vue.filterenginez.com/')).toBe(0.7);
		expect(priorityOf('https://vue.filterenginez.com/wine')).toBe(0.6);
		expect(priorityOf(`${DOCS}/`)).toBe(0.6);
		expect(priorityOf(`${DOCS}/api`)).toBe(0.5);
		expect(entries.filter((entry) => entry.changefreq === 'weekly').map((entry) => entry.loc)).toEqual([
			'https://filterenginez.com/',
			...VERTICALS.map((descriptor) => `${descriptor.productionOrigin}/`),
		]);
	});

	it('refuses an apex page that has no priority, rather than guessing one', () => {
		expect(() => sitemapEntries(['/how-it-works', '/pricing'])).toThrow(/\/pricing has no priority/u);
	});
});

describe('the XML', () => {
	const xml = renderSitemap(entries, LASTMOD);
	const document = new DOMParser().parseFromString(xml, 'application/xml');

	it('parses, in the sitemaps namespace', () => {
		expect(document.getElementsByTagName('parsererror')).toHaveLength(0);
		expect(document.documentElement.namespaceURI).toBe('http://www.sitemaps.org/schemas/sitemap/0.9');
		expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
	});

	it('gives every URL a loc, a lastmod, a changefreq and a priority, with valid values', () => {
		const elements = [...document.getElementsByTagName('url')];

		expect(elements.map((element) => element.getElementsByTagName('loc')[0]?.textContent)).toEqual(urls);
		for (const element of elements) {
			const field = (name: string): string => element.getElementsByTagName(name)[0]?.textContent ?? '';

			expect(field('lastmod')).toBe(LASTMOD);
			expect(['monthly', 'weekly']).toContain(field('changefreq'));
			expect(field('priority')).toMatch(/^(?:0\.\d|1\.0)$/u);
		}
	});

	it('escapes the characters XML reserves', () => {
		const escaped = renderSitemap([{ changefreq: 'monthly', loc: 'https://filterenginez.com/?a=1&b=<"\'>', priority: 0.5 }], LASTMOD);
		const parsed = new DOMParser().parseFromString(escaped, 'application/xml');

		expect(escaped).toContain('<loc>https://filterenginez.com/?a=1&amp;b=&lt;&quot;&apos;&gt;</loc>');
		expect(parsed.getElementsByTagName('loc')[0]?.textContent).toBe('https://filterenginez.com/?a=1&b=<"\'>');
	});
});

describe('sitemapLastmod', () => {
	it('reads SOURCE_DATE_EPOCH first, as whole seconds', () => {
		expect(sitemapLastmod('1791273808', '2020-01-01T00:00:00Z')).toBe('2026-10-06T08:03:28Z');
	});

	it('otherwise reads the HEAD commit time, in UTC to the second', () => {
		expect(sitemapLastmod(undefined, '2026-10-14T02:03:28-06:00')).toBe('2026-10-14T08:03:28Z');
		expect(sitemapLastmod('', '2026-10-14T02:03:28-06:00')).toBe('2026-10-14T08:03:28Z');
	});

	it.each([
		['a SOURCE_DATE_EPOCH that is not whole seconds', '17.5', null, /SOURCE_DATE_EPOCH must be whole seconds/u],
		['no date at all', undefined, null, /no date for lastmod/u],
		['a commit time it cannot read', undefined, 'yesterday', /cannot read the HEAD commit time/u],
	])('refuses %s', (_label, epoch, commitTime, message) => {
		expect(() => sitemapLastmod(epoch, commitTime)).toThrow(message);
	});
});
