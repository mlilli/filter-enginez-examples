/**
 * Every app's HTML shell names its hub, carries no canonical of its own, and every app writes each
 * route's head as it navigates.
 *
 * @remarks
 * Each demo app is a single-page app: one HTML shell answers every route (SvelteKit renders on the
 * server too). Two failures here are silent in every other gate:
 *
 * - **A static `<link rel="canonical">` in a shell** would name the hub as the canonical page for
 *   every route, and a search engine would fold the dataset pages into the hub and drop them.
 * - **An app that stops writing the route's head** would show every route under the hub's title and
 *   no canonical, which nothing but a crawler notices.
 *
 * So this pins that each shell carries the hub's title and description exactly as the verticals
 * registry spells them (the documentation site's, as `page-meta-docs` spells them) and no canonical,
 * and that each app's router calls the shared page-meta helpers. `examples-shared/page-meta` decides
 * the values and has its own suites. Read as text; this project resolves no workspace packages.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './support/repoFiles.js';

/**
 * Read a repository file as text.
 *
 * @param path - Repo-relative path.
 * @returns The contents.
 */
function readRepoFile(path: string): string {
	return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

/** The verticals registry's source. */
const REGISTRY = readRepoFile('packages/examples-shared/src/verticals/verticals.ts');

/**
 * A vertical's hub title and description, parsed out of the registry.
 *
 * @param id - The vertical id.
 * @returns The two strings.
 */
function hubMeta(id: string): { readonly description: string; readonly title: string } {
	const entry = new RegExp(`id: '${id}',[\\s\\S]*?pageDescription:\\s*'([^']*)',\\s*pageTitle: '([^']*)'`, 'u').exec(REGISTRY);

	return { description: entry?.[1] ?? '', title: entry?.[2] ?? '' };
}

/** Each app's HTML shell, and the source that writes each route's head. */
const APPS = [
	{ id: 'react-rtk', shell: 'packages/examples-react-rtk/index.html', writer: 'packages/examples-react-rtk/src/App.tsx', writes: /followRouterPageMeta\(router, docsHostedPageMeta\('react-rtk'\)\)/u },
	{ id: 'react-plain', shell: 'packages/examples-react-plain/index.html', writer: 'packages/examples-react-plain/src/App.tsx', writes: /followRouterPageMeta\(router, docsHostedPageMeta\('react-plain'\)\)/u },
	{ id: 'vue', shell: 'packages/examples-vue/index.html', writer: 'packages/examples-vue/src/router.ts', writes: /router\.afterEach\([\s\S]*?applyPageMeta\(document, verticalPageMeta\('vue', to\.path\)\)/u },
	{ id: 'angular', shell: 'packages/examples-angular/src/index.html', writer: 'packages/examples-angular/src/app/app.component.ts', writes: /NavigationEnd[\s\S]*?applyPageMeta\(document, verticalPageMeta\('angular',/u },
	{ id: 'vanilla', shell: 'packages/examples-vanilla/index.html', writer: 'packages/examples-vanilla/src/main.ts', writes: /onNavigate:[\s\S]*?applyPageMeta\(document, verticalPageMeta\('vanilla', pathname\)\)/u },
] as const;

/** SvelteKit's shell and root layout, which renders the head on the server. */
const SVELTEKIT_SHELL = 'packages/examples-sveltekit/src/app.html';
const SVELTEKIT_LAYOUT = 'packages/examples-sveltekit/src/routes/+layout.svelte';

describe('the registry the shells are checked against', () => {
	it('gives every vertical a hub title and description', () => {
		for (const id of ['react-rtk', 'react-plain', 'sveltekit', 'vue', 'angular', 'vanilla']) {
			const { description, title } = hubMeta(id);

			expect(title, id).toMatch(/^Filter EngineZ · /u);
			expect(description.length, id).toBeGreaterThan(60);
		}
	});
});

describe.each(APPS)('$id', ({ id, shell, writer, writes }) => {
	const html = readRepoFile(shell);

	it('carries the hub’s title and description in its shell, as the registry spells them', () => {
		const { description, title } = hubMeta(id);

		expect(html).toContain(`<title>${title}</title>`);
		expect(html).toContain(`content="${description}"`);
	});

	it('carries no canonical link in its shell, which would name the hub for every route', () => {
		expect(html).not.toContain('rel="canonical"');
	});

	it('writes each route’s head as it navigates, through the shared helpers', () => {
		expect(readRepoFile(writer)).toMatch(writes);
	});
});

describe('the documentation site', () => {
	const html = readRepoFile('packages/examples-docs/index.html');
	const meta = readRepoFile('packages/examples-shared/src/page-meta/docsPageMeta.ts');

	it('carries its home’s title and description in its shell, as page-meta-docs spells them', () => {
		const description = /export const DOCS_HOME_DESCRIPTION\s*=\s*'([^']*)';/u.exec(meta)?.[1] ?? '';

		expect(meta).toContain('export const DOCS_HOME_TITLE = `${BRAND_NAME} — Documentation`;');
		expect(html).toContain('<title>Filter EngineZ — Documentation</title>');
		expect(description.length).toBeGreaterThan(60);
		expect(html).toContain(`content="${description}"`);
		expect(html).not.toContain('rel="canonical"');
	});

	it('writes each route’s head as it navigates, and answers / with a redirect to /docs', () => {
		expect(readRepoFile('packages/examples-docs/src/App.tsx')).toContain('followRouterPageMeta(router, docsPageMeta)');
		expect(readRepoFile('packages/examples-docs/public/_redirects').split('\n')).toContain('/ /docs 301');
	});
});

describe('SvelteKit', () => {
	it('renders the title, description and canonical in its root layout, on the server', () => {
		const layout = readRepoFile(SVELTEKIT_LAYOUT);

		expect(layout).toMatch(/verticalPageMeta\('sveltekit', \$page\.url\.pathname\)/u);
		expect(layout).toMatch(/<svelte:head>[\s\S]*<title>\{meta\.title\}<\/title>[\s\S]*<link rel="canonical" href=\{meta\.canonicalUrl\} \/>/u);
	});

	it('leaves the title to the layout: none in the shell, none in a page', () => {
		expect(readRepoFile(SVELTEKIT_SHELL)).not.toContain('<title>');
		expect(readRepoFile(SVELTEKIT_SHELL)).not.toContain('rel="canonical"');
		for (const page of ['+page.svelte', '+error.svelte', 'books/+page.svelte', 'books-server/+page.svelte', 'wine/+page.svelte', 'wine-server/+page.svelte', 'real-estate/+page.svelte']) {
			expect(readRepoFile(`packages/examples-sveltekit/src/routes/${page}`), page).not.toContain('<title>');
		}
	});
});
