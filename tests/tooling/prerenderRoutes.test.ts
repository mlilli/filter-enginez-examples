/**
 * Every dataset route of every app is prerendered, the same way, and every app hands the snapshot over
 * the same way.
 *
 * @remarks
 * `scripts/prerender-routes.mjs` writes each dataset route's booted page into its HTML shell, and
 * `examples-shared`'s `prerender-core` decides when a visit shows it. What no type checker sees, and what
 * this suite holds:
 *
 * - **Which routes.** Every route in the verticals registry (bar the documentation) is either a
 *   client-booted dataset route or a server-backed one, so a new dataset route cannot miss its snapshot by
 *   being in neither list.
 * - **Every build runs the step, last.** After the shells exist and after the local-only corpus is
 *   stripped (a snapshot of a corpus the site does not deploy would show the wrong count), for the five
 *   Vite and Angular apps in `package.json`, for SvelteKit inside its adapter wrapper. And each app's
 *   HTML holds the root the step writes in front of.
 * - **How a shell is written** (`writePrerenderedShell`), on fixtures.
 * - **The hand-over, in all six apps.** The boot screens check for the snapshot, the dataset views release
 *   it (it stays a moment, out of the way: `prerender-core` says why) and the failure screens dismiss it. A table rather than a derivation: each framework names these places
 *   differently, and the table is the parity contract, read in one place.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { APP_ROOTS, loadPrerenderModule, loadVerticalRoutes, prerenderedRoutes, writePrerenderedShell } from '../../scripts/lib/prerender-shells.mjs';
import { REPO_ROOT } from './support/repoFiles.js';

const prerender = await loadPrerenderModule();
const VERTICALS = await loadVerticalRoutes();

/** The documentation route, the one registry route that boots no dataset. */
const DOCS_ROUTE = '/docs';

/** The step the build ends with, and the step that must come before it. */
const PRERENDER_STEP = 'node ../../scripts/prerender-routes.mjs';
const STRIP_STEP = 'node ../../scripts/strip-local-corpus.mjs';

/** Each Vite or Angular app's build output, the directory the step reads. */
const BUILD_OUTPUT: Readonly<Record<Exclude<keyof typeof APP_ROOTS, 'sveltekit'>, string>> = {
	angular: 'dist/browser',
	'react-plain': 'dist',
	'react-rtk': 'dist',
	vanilla: 'dist',
	vue: 'dist',
};

/** Each app's HTML template: where its root element is written. */
const HTML_TEMPLATE: Readonly<Record<keyof typeof APP_ROOTS, string>> = {
	angular: 'packages/examples-angular/src/index.html',
	'react-plain': 'packages/examples-react-plain/index.html',
	'react-rtk': 'packages/examples-react-rtk/index.html',
	sveltekit: 'packages/examples-sveltekit/src/app.html',
	vanilla: 'packages/examples-vanilla/index.html',
	vue: 'packages/examples-vue/index.html',
};

/**
 * The hand-over, per app: each file and the call it must make. `hasPrerender` (or vanilla's
 * `appendBootScreen`) is a boot screen standing aside for the snapshot; a release is the dataset view taking
 * over; a dismissal is a failure screen replacing the page.
 */
const HAND_OVER: Readonly<Record<keyof typeof APP_ROOTS, readonly { readonly call: string; readonly file: string }[]>> = {
	angular: [
		{ call: 'hasPrerender', file: 'src/app/app.component.ts' },
		{ call: 'hasPrerender', file: 'src/app/pages/wine-page.component.ts' },
		{ call: 'releasePrerenderOnFirstRender', file: 'src/app/pages/books-page.component.ts' },
		{ call: 'releasePrerenderOnFirstRender', file: 'src/app/pages/books-server-page.component.ts' },
		{ call: 'releasePrerenderOnFirstRender', file: 'src/app/pages/real-estate-page.component.ts' },
		{ call: 'releasePrerenderOnFirstRender', file: 'src/app/wine/wine-view.component.ts' },
		{ call: 'dismissPrerenderOnFirstRender', file: 'src/app/pages/books-server-page.component.ts' },
		{ call: 'dismissPrerenderOnFirstRender', file: 'src/app/shell/boot-failure.component.ts' },
		{ call: 'dismissPrerenderOnFirstRender', file: 'src/app/shell/page-error.component.ts' },
	],
	'react-plain': [
		{ call: 'hasPrerender', file: 'src/routes/DatasetRoute.tsx' },
		{ call: 'useDismissPrerender', file: 'src/routes/DatasetRoute.tsx' },
		{ call: 'useReleasePrerender', file: 'src/routes/DatasetView.tsx' },
		{ call: 'hasPrerender', file: 'src/books/ServerConnecting.tsx' },
		{ call: 'useReleasePrerender', file: 'src/books/BooksServerRoute.tsx' },
		{ call: 'useDismissPrerender', file: 'src/books/BooksServerRoute.tsx' },
	],
	'react-rtk': [
		{ call: 'hasPrerender', file: 'src/routes/DatasetRoute.tsx' },
		{ call: 'useDismissPrerender', file: 'src/routes/DatasetRoute.tsx' },
		{ call: 'useReleasePrerender', file: 'src/routes/DatasetView.tsx' },
		{ call: 'hasPrerender', file: 'src/books-server/ServerConnecting.tsx' },
		{ call: 'useReleasePrerender', file: 'src/books-server/BooksServerRoute.tsx' },
		{ call: 'useDismissPrerender', file: 'src/books-server/BooksServerRoute.tsx' },
	],
	sveltekit: [
		{ call: 'hasPrerender', file: 'src/routes/books/+page.svelte' },
		{ call: 'hasPrerender', file: 'src/routes/real-estate/+page.svelte' },
		{ call: 'hasPrerender', file: 'src/routes/wine/+page.svelte' },
		{ call: 'onMount(releasePrerender', file: 'src/lib/books/BooksView.svelte' },
		{ call: 'onMount(releasePrerender', file: 'src/lib/real-estate/RealEstateView.svelte' },
		{ call: 'onMount(releasePrerender', file: 'src/lib/wine/WineView.svelte' },
		{ call: 'onMount(dismissPrerender', file: 'src/lib/shell/BootFailureScreen.svelte' },
	],
	vanilla: [
		{ call: 'appendBootScreen', file: 'src/pages/booksPage.ts' },
		{ call: 'appendBootScreen', file: 'src/pages/booksRawPage.ts' },
		{ call: 'appendBootScreen', file: 'src/pages/realEstatePage.ts' },
		{ call: 'appendBootScreen', file: 'src/pages/winePage.ts' },
		{ call: 'appendBootScreen', file: 'src/pages/wineServerPage.ts' },
		{ call: 'releasePrerender', file: 'src/pages/booksPage.ts' },
		{ call: 'releasePrerender', file: 'src/pages/booksRawPage.ts' },
		{ call: 'releasePrerender', file: 'src/pages/realEstatePage.ts' },
		{ call: 'releasePrerender', file: 'src/pages/winePageShell.ts' },
		{ call: 'dismissPrerender', file: 'src/pages/booksPage.ts' },
		{ call: 'dismissPrerender', file: 'src/pages/booksRawPage.ts' },
		{ call: 'dismissPrerender', file: 'src/pages/realEstatePage.ts' },
		{ call: 'dismissPrerender', file: 'src/pages/winePage.ts' },
		{ call: 'dismissPrerender', file: 'src/pages/wineServerPage.ts' },
		{ call: 'dismissPrerender', file: 'src/router.ts' },
	],
	vue: [
		{ call: 'hasPrerender', file: 'src/pages/BooksPage.vue' },
		{ call: 'hasPrerender', file: 'src/pages/RealEstatePage.vue' },
		{ call: 'hasPrerender', file: 'src/pages/WinePage.vue' },
		{ call: 'onMounted(releasePrerender', file: 'src/books/BooksView.vue' },
		{ call: 'onMounted(releasePrerender', file: 'src/real-estate/RealEstateView.vue' },
		{ call: 'onMounted(releasePrerender', file: 'src/wine/WineView.vue' },
		{ call: 'onMounted(dismissPrerender', file: 'src/shell/BootFailureScreen.vue' },
		{ call: 'onMounted(dismissPrerender', file: 'src/shell/PageErrorScreen.vue' },
	],
};

/**
 * A file's text with its comments removed, so a call named only in prose does not count.
 *
 * @param path - Repo-relative.
 * @returns The code.
 */
function codeOf(path: string): string {
	return readFileSync(join(REPO_ROOT, path), 'utf8')
		.replaceAll(/\/\*[\s\S]*?\*\//gu, '')
		.replaceAll(/(^|[^:'"`])\/\/[^\n]*/gu, '$1')
		.replaceAll(/<!--[\s\S]*?-->/gu, '');
}

describe('which routes are prerendered', () => {
	it('reads the registry: six apps, each serving dataset routes', () => {
		expect(VERTICALS.map(({ id }) => id).sort()).toEqual(Object.keys(APP_ROOTS).sort());
	});

	it.each(VERTICALS.map((entry) => [entry.id, entry] as const))('%s: every dataset route is client-booted or server-backed', (_id, entry) => {
		const datasetRoutes = entry.routes.filter((path) => path !== DOCS_ROUTE);
		const unknown = datasetRoutes.filter(
			(path) => !prerender.CLIENT_DATASET_ROUTE_PATHS.includes(path) && !prerender.SERVER_DATASET_ROUTE_PATHS.includes(path),
		);

		expect(datasetRoutes.length).toBeGreaterThan(0);
		expect(unknown, 'add each to CLIENT_DATASET_ROUTE_PATHS or SERVER_DATASET_ROUTE_PATHS in examples-shared/src/prerender/index.ts').toEqual([]);
	});

	it('prerenders a host’s server-backed routes, except where SvelteKit renders them on the server', () => {
		const routes = ['/books', '/books-server', '/wine-server', '/docs'];

		expect(prerenderedRoutes('react-rtk', routes, prerender)).toEqual(['/books', '/books-server', '/wine-server']);
		expect(prerenderedRoutes('sveltekit', routes, prerender)).toEqual(['/books']);
	});
});

describe('every app’s build prerenders, last', () => {
	it.each(Object.entries(BUILD_OUTPUT))('%s: its build ends with the step, after the corpus strip', (host, output) => {
		const manifest = JSON.parse(readFileSync(join(REPO_ROOT, `packages/examples-${host}/package.json`), 'utf8')) as { scripts: { build: string }};
		const steps = manifest.scripts.build.split(' && ');

		expect(steps.at(-1)).toBe(`${PRERENDER_STEP} ${output} --host ${host}`);
		expect(steps.at(-2)?.startsWith(STRIP_STEP), 'strip the local-only corpus first: the snapshot must show the corpus the site deploys').toBe(true);
	});

	it('sveltekit: its adapter wrapper runs the step over the prerendered pages before adapting', () => {
		const config = codeOf('packages/examples-sveltekit/svelte.config.js');

		expect(config).toContain('prerender-routes.mjs');
		expect(config).toMatch(/\[PRERENDER_STEP, builder\.getClientDirectory\(\), '--host', 'sveltekit', '--pages', pages\]/u);
		expect(config.indexOf('stripLocalCorpus(builder')).toBeGreaterThan(0);
		expect(config.indexOf('[PRERENDER_STEP,')).toBeGreaterThan(config.indexOf('stripLocalCorpus(builder'));
		expect(config.indexOf('await adapter.adapt(builder)')).toBeGreaterThan(config.indexOf('[PRERENDER_STEP,'));
	});

	it.each(Object.entries(HTML_TEMPLATE))('%s: its HTML holds the root the step writes in front of, once', (host, template) => {
		const html = readFileSync(join(REPO_ROOT, template), 'utf8');
		const { tag } = APP_ROOTS[host as keyof typeof APP_ROOTS];

		expect(html.split(tag)).toHaveLength(2);
	});

	it.each(Object.entries(APP_ROOTS))('%s: the style that keeps the live page transparent under the snapshot reaches it', (_host, root) => {
		// No opacity reaches a `display: contents` root (SvelteKit's), so its children take it; a page left
		// visible under the layer paints its own count while the snapshot's is still waiting on the webfont.
		expect(root.sibling.endsWith(' > *')).toBe(root.tag.includes('display: contents'));
	});
});

describe('writePrerenderedShell', () => {
	const shell = '<!doctype html><html><head><title>t</title></head><body><div id="root"></div><script type="module" src="/a.js"></script></body></html>';
	const snapshot = {
		desktop: { cards: '<li>d</li>', page: '<p>desktop</p>' },
		isFullTier: false,
		missingStyles: ['.a{color:red}'],
		missingStylesheets: ['/assets/route.css'],
		phone: { cards: '<li>p</li>', page: '<p>phone</p>' },
	};
	const root = APP_ROOTS['react-rtk'];

	it('writes the styles into the head, and the templates and the picker in front of the root', () => {
		const written = writePrerenderedShell(shell, snapshot, root, prerender);
		const { PRERENDER } = prerender;

		expect(written).toContain(
			`<style>#${PRERENDER.hostId} ~ #root { opacity: 0; }</style><link rel="stylesheet" href="/assets/route.css"><style>.a{color:red}</style></head>`,
		);
		expect(written).toContain(
			`<template id="${PRERENDER.phoneTemplateId}"><p>phone</p></template><template id="${PRERENDER.desktopTemplateId}"><p>desktop</p></template>` +
				`<template id="${PRERENDER.phoneCardsTemplateId}"><li>p</li></template><template id="${PRERENDER.desktopCardsTemplateId}"><li>d</li></template>` +
				`<script>${prerender.prerenderPickerScript()}</script><div id="root"></div>`,
		);
		expect(written).toContain(`<template id="${PRERENDER.phoneTemplateId}">`);
	});

	it('marks a full-tier snapshot on both page templates', () => {
		const written = writePrerenderedShell(shell, { ...snapshot, isFullTier: true }, root, prerender);

		const { PRERENDER } = prerender;

		expect(written).toContain(`<template id="${PRERENDER.phoneTemplateId}" ${PRERENDER.fullTierAttribute}>`);
		expect(written).toContain(`<template id="${PRERENDER.desktopTemplateId}" ${PRERENDER.fullTierAttribute}>`);
		expect(written).toContain(`<template id="${PRERENDER.phoneCardsTemplateId}">`);
	});

	it('refuses a shell it already wrote, and one whose root is missing, doubled or above the head’s end', () => {
		const written = writePrerenderedShell(shell, snapshot, root, prerender);

		expect(() => writePrerenderedShell(written, snapshot, root, prerender)).toThrow(/already holds a prerendered page/u);
		expect(() => writePrerenderedShell(shell.replace('<div id="root">', '<div id="app">'), snapshot, root, prerender)).toThrow(/exactly once/u);
		expect(() => writePrerenderedShell(shell.replace('</body>', '<div id="root"></div></body>'), snapshot, root, prerender)).toThrow(/exactly once/u);
		expect(() => writePrerenderedShell('<div id="root"></div><head></head>', snapshot, root, prerender)).toThrow(/no <\/head> before/u);
	});

	it('refuses a stylesheet named by an absolute address, which only the build server could answer', () => {
		expect(() => writePrerenderedShell(shell, { ...snapshot, missingStylesheets: ['http://127.0.0.1:5000/a.css']}, root, prerender)).toThrow(/site path/u);
	});

	it('keeps a style’s content from closing its element early', () => {
		const written = writePrerenderedShell(shell, { ...snapshot, missingStyles: ['a::after{content:"</style>"}']}, root, prerender);

		expect(written).toContain('content:"<\\/style>"');
	});
});

describe('the hand-over, in all six apps', () => {
	it('covers every app', () => {
		expect(Object.keys(HAND_OVER).sort()).toEqual(Object.keys(APP_ROOTS).sort());
	});

	it.each(Object.entries(HAND_OVER).flatMap(([host, entries]) => entries.map(({ call, file }) => [host, file, call] as const)))(
		'%s: %s calls %s',
		(host, file, call) => {
			expect(codeOf(`packages/examples-${host}/${file}`)).toContain(call.includes('(') ? call : `${call}(`);
		},
	);

	it('the shared React page-error screen dismisses it too', () => {
		expect(codeOf('packages/examples-shared/src/app-router/PageErrorScreen.tsx')).toContain('useDismissPrerender(');
	});
});
