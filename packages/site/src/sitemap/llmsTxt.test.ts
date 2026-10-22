/**
 * Tests for every host's `llms.txt`: the sections and links each host's file holds, every link a page
 * the sitemap lists (or one of the three external addresses), and each committed copy equal to what the
 * registries produce.
 *
 * @remarks
 * The committed copies (`public/llms.txt` in each host's package, `static/llms.txt` under SvelteKit)
 * are file snapshots: a registry change that alters a file fails this suite until the copy is
 * rewritten, with `vitest run packages/site/src/sitemap/llmsTxt.test.ts --update`.
 *
 * @packageDocumentation
 */

import { verticalPages } from '@filter-enginez/examples-shared/page-meta';
import { docsPages } from '@filter-enginez/examples-shared/page-meta-docs';
import { vertical, VERTICALS } from '@filter-enginez/examples-shared/verticals';
import { describe, expect, it } from 'vitest';

import {
	ENGINE_REPOSITORY_URL,
	EXAMPLES_REPOSITORY_URL,
	type LlmsTxtDocument,
	llmsTxtDocument,
	type LlmsTxtHost,
	llmsTxtHosts,
	llmsTxtOrigin,
	NPM_SCOPE_URL,
	renderLlmsTxt,
} from './llmsTxt.js';
import { sitemapEntries } from './sitemap.js';

/** The three links that are not pages of these sites. */
const EXTERNAL_URLS: ReadonlySet<string> = new Set([ENGINE_REPOSITORY_URL, EXAMPLES_REPOSITORY_URL, NPM_SCOPE_URL]);

/** Every page the sitemap lists. */
const SITEMAP_URLS: ReadonlySet<string> = new Set(sitemapEntries().map((entry) => entry.loc));

/**
 * Where each host's committed copy lives, relative to this file: the host's package's `public/`, or
 * `static/` for SvelteKit, whose build copies that directory instead.
 *
 * @param host - The host.
 * @returns The path.
 */
function committedCopy(host: LlmsTxtHost): string {
	if (host === 'site') {
		return '../../public/llms.txt';
	}

	return `../../../examples-${host}/${host === 'sveltekit' ? 'static' : 'public'}/llms.txt`;
}

/**
 * Every URL a document links to.
 *
 * @param document - The document.
 * @returns The URLs, in order.
 */
function linkedUrls(document: LlmsTxtDocument): readonly string[] {
	return document.sections.flatMap((section) => section.links.map((link) => link.url));
}

/**
 * A document's section headings.
 *
 * @param document - The document.
 * @returns The headings, in order.
 */
function headings(document: LlmsTxtDocument): readonly string[] {
	return document.sections.map((section) => section.heading);
}

describe('llmsTxtHosts', () => {
	it('is every host the sitemap lists: the apex, the six demo apps and the documentation site', () => {
		const hosts = llmsTxtHosts();
		const sitemapOrigins = new Set([...SITEMAP_URLS].map((url) => new URL(url).origin));

		expect(hosts).toEqual(['site', ...VERTICALS.map(({ id }) => id), 'docs']);
		expect(new Set(hosts.map(llmsTxtOrigin))).toEqual(sitemapOrigins);
	});

	it('serves the apex, the documentation site and each app at its own origin', () => {
		expect(llmsTxtOrigin('site')).toBe('https://filterenginez.com');
		expect(llmsTxtOrigin('docs')).toBe('https://docs.filterenginez.com');
		expect(llmsTxtOrigin('vue')).toBe('https://vue.filterenginez.com');
	});
});

describe('each host’s document', () => {
	it.each(llmsTxtHosts())('%s links only to pages the sitemap lists, the repositories and npm, each once', (host) => {
		const urls = linkedUrls(llmsTxtDocument(host));

		expect(urls.length).toBeGreaterThan(10);
		expect(urls.filter((url) => !SITEMAP_URLS.has(url) && !EXTERNAL_URLS.has(url))).toEqual([]);
		expect(new Set(urls).size).toBe(urls.length);
		expect(urls.filter((url) => EXTERNAL_URLS.has(url)).slice().sort()).toEqual([...EXTERNAL_URLS].sort());
	});

	it.each(llmsTxtHosts())('%s gives every link text and a note', (host) => {
		const links = llmsTxtDocument(host).sections.flatMap((section) => section.links);

		expect(links.filter((link) => link.title === '' || link.note === '')).toEqual([]);
	});

	it('leads a demo app’s file with its own pages, then the documentation, the other demos, the landing site and the source', () => {
		const document = llmsTxtDocument('react-plain');
		const [own] = document.sections;
		const { pageDescription, pageTitle, productionOrigin } = vertical('react-plain');

		expect(document.title).toBe(pageTitle);
		expect(document.summary).toBe(pageDescription);
		expect(headings(document)).toEqual(['This app', 'Documentation', 'Other demos', 'Landing site', 'Source']);
		expect(document.sections[2]?.links.map((link) => link.title)).toEqual(VERTICALS.filter(({ id }) => id !== 'react-plain').map(({ name }) => name));
		expect(own?.links.map((link) => link.url)).toEqual([
			`${productionOrigin}/`,
			...verticalPages('react-plain').map((page) => `${productionOrigin}${page.path}`),
		]);
		expect(own?.links.at(-1)?.title).toBe('The lab');
	});

	it('names each demo app’s stack, and the vanilla app’s lack of one', () => {
		const notes = new Map(llmsTxtDocument('site').sections.find((section) => section.heading === 'Demos')?.links.map((link) => [link.title, link.note]));

		expect(notes.get('React RTK')).toMatch(/^Built with React 19 and @filter-enginez\/react-signals\. /u);
		expect(notes.get('Vanilla')).toMatch(/^Built with plain TypeScript and no framework\. /u);
		expect(llmsTxtDocument('vanilla').details.at(-1)).toMatch(/^Vanilla is built with plain TypeScript and no framework\. /u);
	});

	it('lists every documentation page on the documentation site, and only its entry points elsewhere', () => {
		const docs = llmsTxtDocument('docs');
		const docsUrls = linkedUrls(docs).filter((url) => url.startsWith('https://docs.filterenginez.com/'));

		expect(headings(docs)).toEqual(['Documentation', 'Rules', 'Algorithms', 'Demos', 'Landing site', 'Source']);
		expect(docsUrls.slice().sort()).toEqual(['/', ...docsPages().map((page) => page.path)].map((path) => `https://docs.filterenginez.com${path}`).sort());
		expect(docs.sections[1]?.links.length).toBeGreaterThan(10);
		expect(docs.sections[2]?.links.length).toBeGreaterThan(5);
		expect(linkedUrls(llmsTxtDocument('vue')).filter((url) => url.startsWith('https://docs.filterenginez.com/'))).toEqual([
			'https://docs.filterenginez.com/',
			'https://docs.filterenginez.com/playground',
			'https://docs.filterenginez.com/api',
		]);
	});

	it('introduces the project on the apex, and links to the rest', () => {
		const site = llmsTxtDocument('site');

		expect(site.title).toBe('Filter EngineZ');
		expect(headings(site)).toEqual(['Landing site', 'Documentation', 'Demos', 'Source']);
		expect(linkedUrls(site).slice(0, 3)).toEqual(['https://filterenginez.com/', 'https://filterenginez.com/compare', 'https://filterenginez.com/how-it-works']);
	});

	it('takes the apex pages from the list it is given, and refuses one it has no words for', () => {
		expect(linkedUrls(llmsTxtDocument('site', ['/how-it-works'])).slice(0, 2)).toEqual(['https://filterenginez.com/', 'https://filterenginez.com/how-it-works']);
		expect(() => llmsTxtDocument('docs', ['/pricing'])).toThrow('the apex page /pricing has no link text. Add it to APEX_PAGES');
	});
});

describe('renderLlmsTxt', () => {
	it('writes the H1, the summary, the prose and each section’s link list, in llmstxt.org’s shape', () => {
		const text = renderLlmsTxt({
			details: ['First paragraph.', 'Second paragraph.'],
			sections: [
				{ heading: 'Docs', links: [{ note: 'The home.', title: 'Home', url: 'https://example.com/' }]},
				{
					heading: 'More',
					links: [
						{ note: 'One.', title: 'A', url: 'https://example.com/a' },
						{ note: 'Two.', title: 'B', url: 'https://example.com/b' },
					],
				},
			],
			summary: 'What it is.',
			title: 'Example',
		});

		expect(text).toBe(
			[
				'# Example',
				'',
				'> What it is.',
				'',
				'First paragraph.',
				'',
				'Second paragraph.',
				'',
				'## Docs',
				'',
				'- [Home](https://example.com/): The home.',
				'',
				'## More',
				'',
				'- [A](https://example.com/a): One.',
				'- [B](https://example.com/b): Two.',
				'',
			].join('\n'),
		);
	});
});

describe('the committed copies', () => {
	it.each(llmsTxtHosts())('%s serves what the registries produce', async (host) => {
		await expect(renderLlmsTxt(llmsTxtDocument(host))).toMatchFileSnapshot(committedCopy(host));
	});
});
