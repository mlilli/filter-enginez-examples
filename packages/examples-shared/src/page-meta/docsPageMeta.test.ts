/**
 * Tests for the documentation pages' titles, descriptions and canonical URLs.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { ALGORITHM_TEXTS } from '../docs/content/algorithmsText.js';
import { RULE_DOCS } from '../docs/content/rulesContent.js';
import { DOCS_HOME_DESCRIPTION, DOCS_HOME_TITLE, docsPageMeta, docsPagePaths, docsPages } from './docsPageMeta.js';
import { DOCS_APP_BASE_PATH, DOCS_SITE_BASE_PATH } from './pageMeta.js';

describe('docsPagePaths', () => {
	it('lists the home, a page per rule and per algorithm, the playground and the API reference, at the documentation site’s root', () => {
		const paths = docsPagePaths(DOCS_SITE_BASE_PATH);

		// Non-vacuous: the catalogs are populated.
		expect(RULE_DOCS.length).toBeGreaterThan(10);
		expect(ALGORITHM_TEXTS.length).toBeGreaterThan(5);
		expect(paths).toEqual([
			'/',
			...RULE_DOCS.map((rule) => `/rules/${rule.id}`),
			...ALGORITHM_TEXTS.map((algorithm) => `/algorithms/${algorithm.id}`),
			'/playground',
			'/api',
		]);
		expect(new Set(paths).size).toBe(paths.length);
	});

	it('lists the same pages under /docs, where a demo app serves them', () => {
		expect(docsPagePaths(DOCS_APP_BASE_PATH)).toEqual(docsPagePaths(DOCS_SITE_BASE_PATH).map((path) => (path === '/' ? '/docs' : `/docs${path}`)));
	});
});

describe('docsPages', () => {
	it('is every page but the home, each summarized without its name and described as its head describes it', () => {
		const pages = docsPages();

		expect(pages.map((page) => page.path)).toEqual(docsPagePaths(DOCS_SITE_BASE_PATH).slice(1));
		for (const { description, name, path } of pages) {
			expect(docsPageMeta(path, DOCS_SITE_BASE_PATH)).toMatchObject({ description, title: `${name} — Filter EngineZ docs` });
		}
	});

	it('summarizes a rule and an algorithm by the catalog’s one line, and the other pages by their description', () => {
		const [rule] = RULE_DOCS;
		const [algorithm] = ALGORITHM_TEXTS;
		const byPath = new Map(docsPages().map((page) => [page.path, page]));

		expect(byPath.get(`/rules/${rule?.id ?? ''}`)?.summary).toBe(rule?.simple);
		expect(byPath.get(`/algorithms/${algorithm?.id ?? ''}`)?.summary).toBe(algorithm?.simple);
		for (const path of ['/playground', '/api']) {
			expect(byPath.get(path)?.summary).toBe(byPath.get(path)?.description);
		}
	});
});

describe('docsPageMeta', () => {
	it('gives the home the title and description the documentation site’s shell carries, canonical at the site’s root', () => {
		const home = { canonicalUrl: 'https://docs.filterenginez.com/', description: DOCS_HOME_DESCRIPTION, title: DOCS_HOME_TITLE };

		expect(docsPageMeta('/', DOCS_SITE_BASE_PATH)).toEqual(home);
		expect(docsPageMeta('/docs', DOCS_APP_BASE_PATH)).toEqual(home);
		expect(docsPageMeta('/docs/', DOCS_APP_BASE_PATH)).toEqual(home);
	});

	it('counts the rule catalog in the home’s description, every rule in it', () => {
		const counted = /the (\d+)-rule filter catalog/u.exec(DOCS_HOME_DESCRIPTION)?.[1];

		expect(counted, 'the description names the catalog by its size').toBeDefined();
		expect(Number(counted)).toBe(RULE_DOCS.length);
	});

	it('names a rule page after the rule and describes it in the catalog’s words', () => {
		const [rule] = RULE_DOCS;

		const meta = {
			canonicalUrl: `https://docs.filterenginez.com/rules/${rule?.id ?? ''}`,
			description: `${rule?.name ?? ''}: ${rule?.simple ?? ''}`,
			title: `${rule?.name ?? ''} — Filter EngineZ docs`,
		};

		expect(docsPageMeta(`/rules/${rule?.id ?? ''}/`, DOCS_SITE_BASE_PATH)).toEqual(meta);
		expect(docsPageMeta(`/docs/rules/${rule?.id ?? ''}`, DOCS_APP_BASE_PATH)).toEqual(meta);
	});

	it('gives every page a canonical URL on the documentation site and a distinct title', () => {
		const described = docsPagePaths(DOCS_SITE_BASE_PATH).map((path) => docsPageMeta(path, DOCS_SITE_BASE_PATH));

		expect(described.map((meta) => meta.canonicalUrl)).toEqual(docsPagePaths(DOCS_SITE_BASE_PATH).map((path) => `https://docs.filterenginez.com${path}`));
		expect(docsPagePaths(DOCS_APP_BASE_PATH).map((path) => docsPageMeta(path, DOCS_APP_BASE_PATH))).toEqual(described);
		expect(new Set(described.map((meta) => meta.title)).size).toBe(described.length);
		expect(described.every((meta) => meta.description.length > 40)).toBe(true);
	});

	it.each([
		['/rules/no-such-rule', DOCS_SITE_BASE_PATH],
		['/docs/rules/no-such-rule', DOCS_APP_BASE_PATH],
		// A path outside the base path names no documentation page either.
		['/wine', DOCS_APP_BASE_PATH],
	] as const)('treats %s (base %j), which names no page, as not found', (pathname, basePath) => {
		expect(docsPageMeta(pathname, basePath)).toEqual({
			canonicalUrl: null,
			description: '',
			title: `Page not found — ${DOCS_HOME_TITLE}`,
		});
	});
});
