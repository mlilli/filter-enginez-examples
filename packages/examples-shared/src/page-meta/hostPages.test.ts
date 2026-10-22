/**
 * Tests for the pages each host serves, the head each page's shell carries, and where each shell goes.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { vertical } from '../verticals/verticals.js';
import { DOCS_HOME_TITLE, docsPageMeta, docsPagePaths } from './docsPageMeta.js';
import { hostNotFoundMeta, hostPagePaths, hostPages, isShellHost, ROUTED_HOSTS, shellFileName } from './hostPages.js';
import { DOCS_APP_BASE_PATH, DOCS_SITE_BASE_PATH, verticalIndexablePaths, verticalPageMeta } from './pageMeta.js';

describe('ROUTED_HOSTS', () => {
	it('is the six demo apps, then the documentation site; all but SvelteKit write shells', () => {
		expect(ROUTED_HOSTS).toEqual(['react-rtk', 'react-plain', 'sveltekit', 'vue', 'angular', 'vanilla', 'docs']);
		expect(ROUTED_HOSTS.filter((host) => !isShellHost(host))).toEqual(['sveltekit']);
	});
});

describe('hostPagePaths', () => {
	it('lists a demo app’s own pages, then the documentation under /docs where the app serves it', () => {
		expect(hostPagePaths('react-plain')).toEqual([...verticalIndexablePaths('react-plain'), ...docsPagePaths(DOCS_APP_BASE_PATH)]);
		expect(hostPagePaths('react-plain')).toContain('/lab');
		expect(hostPagePaths('react-plain')).toContain('/docs/rules/range');
	});

	it('lists only its own pages for an app that serves no documentation', () => {
		expect(vertical('vue').routes).not.toContain(DOCS_APP_BASE_PATH);
		expect(hostPagePaths('vue')).toEqual(['/', '/books', '/wine', '/real-estate']);
		expect(hostPagePaths('sveltekit')).toEqual(verticalIndexablePaths('sveltekit'));
	});

	it('lists every documentation page at the documentation site’s root', () => {
		expect(hostPagePaths('docs')).toEqual(docsPagePaths(DOCS_SITE_BASE_PATH));
		expect(hostPagePaths('docs')[0]).toBe('/');
		expect(hostPagePaths('docs').some((path) => path.startsWith('/docs'))).toBe(false);
	});
});

describe('hostPages', () => {
	it('gives a demo app’s own page its own head, and a documentation page the documentation site’s', () => {
		const pages = new Map(hostPages('react-rtk').map(({ meta, path }) => [path, meta]));

		expect(pages.get('/wine')).toEqual(verticalPageMeta('react-rtk', '/wine'));
		expect(pages.get('/docs/api')).toEqual(docsPageMeta('/api', DOCS_SITE_BASE_PATH));
		expect(pages.get('/docs/api')?.canonicalUrl).toBe('https://docs.filterenginez.com/api');
	});

	it('gives every page of the documentation site its canonical at the root', () => {
		for (const { meta, path } of hostPages('docs')) {
			expect(meta.canonicalUrl).toBe(`https://docs.filterenginez.com${path}`);
		}
	});

	it('gives every page of every host a canonical URL and a distinct title', () => {
		for (const host of ROUTED_HOSTS.filter((candidate) => isShellHost(candidate))) {
			const described = hostPages(host).map(({ meta }) => meta);

			expect(described.every((meta) => meta.canonicalUrl !== null), host).toBe(true);
			expect(new Set(described.map((meta) => meta.title)).size, host).toBe(described.length);
		}
	});
});

describe('hostNotFoundMeta', () => {
	it('names the host and is not indexed', () => {
		expect(hostNotFoundMeta('vue')).toEqual({ canonicalUrl: null, description: '', title: 'Page not found — Filter EngineZ · Vue' });
		expect(hostNotFoundMeta('docs')).toEqual({ canonicalUrl: null, description: '', title: `Page not found — ${DOCS_HOME_TITLE}` });
	});
});

describe('shellFileName', () => {
	it.each([
		['/', 'index.html'],
		['/wine', 'wine.html'],
		['/docs', 'docs.html'],
		['/docs/rules/range', 'docs/rules/range.html'],
	])('writes %s to %s', (path, file) => {
		expect(shellFileName(path)).toBe(file);
	});
});
