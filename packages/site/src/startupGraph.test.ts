/**
 * Tests for `startupGraph.ts` — the build's check that no page loads the engine at startup.
 *
 * @remarks
 * The bundles here are small hand-built ones in the shape the build hands the check: chunks by file
 * name, each with its static imports and the ids of the modules in it, and pages as Vite writes them.
 * The real build runs the same functions over the site (`vite.config.ts`), and fails on a violation.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import {
	type BuiltChunk,
	DEFERRED_MODULES,
	type DeferredModules,
	describeStartupViolations,
	findDeferredModulesAtStartup,
	pageStartupScripts,
	startupChunks,
} from './startupGraph.js';

/** Where a dependency's module ids sit in the build, as the bundler reports them. */
const NODE_MODULES = '/repo/node_modules/.pnpm/x/node_modules';

/** A module of the engine proper. */
const ENGINE_MODULE = `${NODE_MODULES}/@filter-enginez/core/dist/createFilterEngine.js`;

/** The engine's error class, which the comparison page legitimately loads at startup. */
const ERROR_MODULE = `${NODE_MODULES}/@filter-enginez/core/dist/errors/FilterEngineConfigError.js`;

/** One module of each deferred group, so a build holding these satisfies every group's vacuity check. */
const ONE_OF_EACH = [
	ENGINE_MODULE,
	`${NODE_MODULES}/roaring-wasm/browser/index.mjs`,
	`${NODE_MODULES}/fuse.js/dist/fuse.mjs`,
	`${NODE_MODULES}/rbush/index.js`,
	`${NODE_MODULES}/@filter-enginez/mock-data/dist/wine/generate.js`,
];

/** Just the engine, as one deferred group. */
const ENGINE_ONLY: readonly DeferredModules[] = [{ name: 'the engine', pattern: /[/\\]@filter-enginez[/\\]core[/\\]dist[/\\](?!errors[/\\])/u }];

/**
 * A page as Vite writes one: a module script and its modulepreload links.
 *
 * @param entry - The module script.
 * @param preloads - The chunks it preloads.
 * @returns The HTML.
 */
function page(entry: string, ...preloads: string[]): string {
	return [
		'<!doctype html><html><head>',
		`<script type="module" crossorigin src="/${entry}"></script>`,
		...preloads.map((preload) => `<link rel="modulepreload" crossorigin href="/${preload}">`),
		'</head><body></body></html>',
	].join('\n');
}

/**
 * A build: a page entry that imports a shared chunk statically and the engine dynamically.
 *
 * @param engineIsStatic - Import the engine chunk statically instead.
 * @returns The chunks, by file name.
 */
function build(engineIsStatic = false): Map<string, BuiltChunk> {
	return new Map<string, BuiltChunk>([
		['assets/page.js', { imports: engineIsStatic ? ['assets/shared.js', 'assets/engine.js'] : ['assets/shared.js'], moduleIds: ['/repo/src/page.ts']}],
		['assets/shared.js', { imports: ['assets/errors.js'], moduleIds: ['/repo/src/shared.ts']}],
		['assets/errors.js', { imports: [], moduleIds: [ERROR_MODULE]}],
		['assets/engine.js', { imports: ['assets/errors.js'], moduleIds: ONE_OF_EACH }],
	]);
}

describe('pageStartupScripts', () => {
	it('lists the module scripts and the modulepreload links, in page order, without the leading slash', () => {
		expect(pageStartupScripts(page('assets/page.js', 'assets/shared.js', 'assets/errors.js'))).toEqual([
			'assets/page.js',
			'assets/shared.js',
			'assets/errors.js',
		]);
	});

	it('reads attributes however they are quoted, in any case, and among other rel values', () => {
		const html = [
			"<SCRIPT TYPE='module' SRC='/assets/single.js'></SCRIPT>",
			'<script type=module src=/assets/bare.js async></script>',
			'<link rel="preload modulepreload" href="/assets/listed.js">',
		].join('');

		expect(pageStartupScripts(html)).toEqual(['assets/single.js', 'assets/bare.js', 'assets/listed.js']);
	});

	it('leaves out what a page does not load as a module: classic and inline scripts, other links, other origins', () => {
		const html = [
			'<script type="application/ld+json">{}</script>',
			'<script src="/assets/classic.js"></script>',
			'<script type="module">import "/assets/inline.js";</script>',
			'<script type="module" src="https://cdn.example/x.js"></script>',
			'<script type="module" src="//cdn.example/y.js"></script>',
			'<link rel="stylesheet" href="/assets/page.css">',
			'<link href="/assets/no-rel.js">',
			'<link rel="preload" href="/assets/font.woff2" as="font" crossorigin>',
		].join('');

		expect(pageStartupScripts(html)).toEqual([]);
	});
});

describe('startupChunks', () => {
	it('follows static imports transitively, each chunk once, and never a dynamic one', () => {
		expect([...startupChunks(['assets/page.js'], build()).keys()].sort()).toEqual(['assets/errors.js', 'assets/page.js', 'assets/shared.js']);
	});

	it('reaches a chunk two ways only once', () => {
		const chunks = startupChunks(['assets/page.js', 'assets/shared.js'], build(true));

		expect([...chunks.keys()].sort()).toEqual(['assets/engine.js', 'assets/errors.js', 'assets/page.js', 'assets/shared.js']);
	});

	it('fails on a script or an import the build does not have', () => {
		expect(() => startupChunks(['assets/gone.js'], build())).toThrow('assets/gone.js is loaded at startup but is not a JavaScript chunk in the build.');
	});
});

describe('findDeferredModulesAtStartup', () => {
	it('passes a build that loads the engine on demand, and lets the error classes start with the page', () => {
		expect(findDeferredModulesAtStartup(new Map([['index.html', page('assets/page.js', 'assets/shared.js')]]), build())).toEqual([]);
	});

	it('reports every deferred module a page reaches through a static import', () => {
		const violations = findDeferredModulesAtStartup(new Map([['how-it-works.html', page('assets/page.js')]]), build(true));

		expect(violations.map((violation) => violation.moduleId)).toEqual(ONE_OF_EACH);
		expect(violations[0]).toEqual({ chunk: 'assets/engine.js', group: DEFERRED_MODULES[0]?.name, moduleId: ENGINE_MODULE, page: 'how-it-works.html' });
	});

	it('reports a deferred chunk a page only preloads', () => {
		const violations = findDeferredModulesAtStartup(new Map([['compare.html', page('assets/page.js', 'assets/engine.js')]]), build(), ENGINE_ONLY);

		expect(violations).toEqual([{ chunk: 'assets/engine.js', group: 'the engine', moduleId: ENGINE_MODULE, page: 'compare.html' }]);
	});

	it('checks every page', () => {
		const pages = new Map([
			['index.html', page('assets/page.js', 'assets/shared.js')],
			['compare.html', page('assets/engine.js')],
		]);

		expect(findDeferredModulesAtStartup(pages, build(), ENGINE_ONLY).map((violation) => violation.page)).toEqual(['compare.html']);
	});

	it('fails a build with no pages', () => {
		expect(() => findDeferredModulesAtStartup(new Map(), build())).toThrow('The build has no HTML pages to check.');
	});

	it('fails when a deferred group matches nothing in the build, rather than passing vacuously', () => {
		const withoutFuse = new Map(build());

		withoutFuse.set('assets/engine.js', { imports: [], moduleIds: ONE_OF_EACH.filter((moduleId) => !moduleId.includes('fuse.js')) });

		expect(() => findDeferredModulesAtStartup(new Map([['index.html', page('assets/page.js')]]), withoutFuse)).toThrow(
			/No module in the build matches fuse\.js, the engine’s fuzzy search .*update DEFERRED_MODULES/u,
		);
	});

	it('matches Windows paths too', () => {
		expect(DEFERRED_MODULES.some((group) => group.pattern.test(String.raw`C:\repo\node_modules\@filter-enginez\core\dist\index.js`))).toBe(true);
		expect(DEFERRED_MODULES.some((group) => group.pattern.test(String.raw`C:\repo\node_modules\@filter-enginez\core\dist\errors\index.js`))).toBe(
			false,
		);
	});
});

describe('describeStartupViolations', () => {
	it('names each page and group once, with the chunk, one module and the fix', () => {
		const message = describeStartupViolations([
			{ chunk: 'assets/engine.js', group: 'the engine', moduleId: ENGINE_MODULE, page: 'compare.html' },
			{ chunk: 'assets/engine.js', group: 'the engine', moduleId: `${NODE_MODULES}/@filter-enginez/core/dist/index.js`, page: 'compare.html' },
			{ chunk: 'assets/engine.js', group: 'rbush', moduleId: `${NODE_MODULES}/rbush/index.js`, page: 'compare.html' },
		]);

		expect(message.split('\n')).toEqual([
			'A page loads JavaScript at startup that only the live benchmark needs, on demand:',
			`  compare.html loads the engine at startup, in assets/engine.js (e.g. ${ENGINE_MODULE})`,
			`  compare.html loads rbush at startup, in assets/engine.js (e.g. ${NODE_MODULES}/rbush/index.js)`,
			'Import it through how-it-works/benchmarkEngine.ts with a dynamic import(), and keep the engine’s modules declared side-effect free in vite.config.ts.',
		]);
	});
});
