/**
 * No app makes its first render wait for a stylesheet, and the Vite apps' plugin that keeps it so does
 * what it claims.
 *
 * @remarks
 * ### What is pinned
 *
 * - **Every deployed app has a way to keep its CSS off the first render, derived:** the five Vite apps
 *   register `criticalCssPlugin` (`scripts/lib/critical-css.mjs`) in their `vite.config.ts`, SvelteKit
 *   inlines every page's CSS (`inlineStyleThreshold`), and Angular keeps its default of inlining its
 *   critical CSS and loading the sheet as `media="print"`. A new app is covered the moment it is
 *   deployable, and fails here until it has one. Each build then checks its own first page
 *   (`scripts/check-startup-budget.mjs`, pinned by `startupBudget.test.ts`), so a way that stopped
 *   working fails the build, not just this file.
 * - **The plugin, on fixture bundles:** it puts the first screen's part of the sheet into the page and
 *   no stylesheet link, gives the whole sheet to exactly the on-demand imports whose code needs it,
 *   preloads it when the page's head preloads such code, and fails loudly on a bundle it cannot read
 *   (no single entry, not one sheet, a sheet missing from the bundle) or a build in which Vite did not
 *   write the sheet into an import's dependencies. The cut itself is tested with the function that
 *   makes it, in `packages/site/src/criticalAssets.test.ts`.
 *
 * @packageDocumentation
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import * as criticalAssets from '../../packages/site/src/criticalAssets.js';
import {
	CRITICAL_ASSETS_MODULE,
	type CriticalCssBundleOutput,
	criticalCssPlugin,
	startupChunks,
} from '../../scripts/lib/critical-css.mjs';
import { listDeployTargets } from '../../scripts/lib/deploy-targets.mjs';
import { REPO_ROOT } from './support/repoFiles.js';

/** How each deployed app keeps its stylesheets off the first render. */
const APP_WAYS: Readonly<Record<string, 'angular-inline-critical' | 'plugin' | 'sveltekit-inline'>> = {
	'examples-angular': 'angular-inline-critical',
	'examples-docs': 'plugin',
	'examples-react-plain': 'plugin',
	'examples-react-rtk': 'plugin',
	'examples-sveltekit': 'sveltekit-inline',
	'examples-vanilla': 'plugin',
	'examples-vue': 'plugin',
};

/** Every deployed demo app: an `examples-*` package with a `wrangler.jsonc`. */
const APPS = listDeployTargets()
	.map((target) => target.packageDirectory)
	.filter((name) => name.startsWith('examples-'))
	.sort();

/**
 * Read a file of one of the apps.
 *
 * @param app - The package's directory under `packages/`.
 * @param file - The file, from the package's directory.
 * @returns Its text.
 */
function readAppFile(app: string, file: string): string {
	return readFileSync(resolve(REPO_ROOT, 'packages', app, file), 'utf8');
}

describe('every app keeps its stylesheets off the first render', () => {
	it('finds the apps, so the cases below are not vacuous', () => {
		expect(APPS).toEqual(Object.keys(APP_WAYS).sort());
	});

	for (const app of APPS) {
		const way = APP_WAYS[app];

		it(`${app}: through its ${way ?? '?'}`, () => {
			if (way === 'plugin') {
				const config = readAppFile(app, 'vite.config.ts');

				expect(config).toContain("import { criticalCssPlugin } from '../../scripts/lib/critical-css.mjs';");
				expect(config).toMatch(/import \{[^}]*\brunnerImport\b[^}]*\} from 'vite';/u);
				expect(config).toMatch(/plugins: \[[^\]]*\bcriticalCssPlugin\(\{ runnerImport \}\)/u);
			} else if (way === 'sveltekit-inline') {
				expect(readAppFile(app, 'svelte.config.js')).toMatch(/^\t\tinlineStyleThreshold: Number\.POSITIVE_INFINITY,$/mu);
			} else {
				const angular = JSON.parse(readAppFile(app, 'angular.json')) as {
					readonly projects: Readonly<
						Record<string, { readonly architect: { readonly build: { readonly configurations: Readonly<Record<string, { readonly optimization?: unknown }>> }}}>
					>;
				};
				const builds = Object.values(angular.projects).map((project) => project.architect.build.configurations['production']);

				expect(builds).toHaveLength(1);
				// Unset is Angular's default, which inlines the critical CSS; so does any setting that leaves
				// the styles' `inlineCritical` alone.
				expect(JSON.stringify(builds[0]?.optimization ?? true)).not.toMatch(/"styles":false|"inlineCritical":false|^false$/u);
			}
		});
	}
});

describe('scripts/lib/critical-css.mjs', () => {
	/** The app's one stylesheet: a rule for the hub, one for the header, one for the panel a route draws. */
	const SHEET = '.fe-hub{color:red}.fe-header{gap:0}.fe-panel{color:blue}';

	/** The page Vite writes: the entry, a preload of its static import, and the stylesheet link. */
	const BUILT_PAGE = [
		'<head>',
		'\t\t<script type="module" crossorigin src="/assets/index.js"></script>',
		'\t\t<link rel="modulepreload" crossorigin href="/assets/shared.js">',
		'\t\t<link rel="stylesheet" crossorigin href="/assets/index.css">',
		'\t</head>',
	].join('\n');

	/**
	 * A chunk of a fixture bundle.
	 *
	 * @param fileName - Its file name.
	 * @param code - Its code.
	 * @param more - Its static and dynamic imports, whether it is the entry, and the CSS it imports.
	 * @returns The chunk.
	 */
	function chunk(
		fileName: string,
		code: string,
		more: { readonly css?: readonly string[]; readonly dynamicImports?: readonly string[]; readonly imports?: readonly string[]; readonly isEntry?: boolean } = {},
	): CriticalCssBundleOutput {
		return {
			code,
			dynamicImports: more.dynamicImports ?? [],
			fileName,
			imports: more.imports ?? [],
			isEntry: more.isEntry ?? false,
			type: 'chunk',
			viteMetadata: { importedCss: new Set(more.css ?? []) },
		};
	}

	/**
	 * A fixture bundle: the entry writes `fe-hub` and imports `shared.js` (which writes `fe-header`)
	 * statically; it imports `panel.js` (which writes `fe-panel`) and `more.js` (which writes nothing the
	 * cut lacks) on demand.
	 *
	 * @param entryCss - The CSS the entry chunk imports.
	 * @returns The bundle.
	 */
	function fixtureBundle(entryCss: readonly string[] = ['assets/index.css']): Record<string, CriticalCssBundleOutput> {
		return {
			'assets/index.css': { fileName: 'assets/index.css', source: SHEET, type: 'asset' },
			'assets/index.js': chunk('assets/index.js', 'h="fe-hub";p=()=>import("./panel.js");m=()=>import("./more.js")', {
				css: entryCss,
				dynamicImports: ['assets/panel.js', 'assets/more.js'],
				imports: ['assets/shared.js'],
				isEntry: true,
			}),
			'assets/more.js': chunk('assets/more.js', 'm="fe-hub"'),
			'assets/panel.js': chunk('assets/panel.js', 'p="fe-panel"'),
			'assets/shared.js': chunk('assets/shared.js', 'x="fe-header"'),
		};
	}

	/** The plugin's `runnerImport`: the real module, imported directly. */
	const runnerImport = async (moduleId: string): Promise<{ readonly module: unknown }> => {
		expect(moduleId).toBe(CRITICAL_ASSETS_MODULE);

		return Promise.resolve({ module: criticalAssets });
	};

	let root = '';

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'critical-css-'));
		writeFileSync(join(root, 'index.html'), '<body><div id="root"></div></body>');
	});

	afterEach(() => {
		rmSync(root, { force: true, recursive: true });
	});

	/**
	 * A plugin that has read a bundle, as it is between `generateBundle` and the page being written.
	 *
	 * @param bundle - The bundle it reads.
	 * @returns The plugin, and its `resolveDependencies`.
	 */
	async function readBundle(bundle: Record<string, CriticalCssBundleOutput> = fixtureBundle()): Promise<{
		readonly plugin: ReturnType<typeof criticalCssPlugin>;
		readonly resolveDependencies: ReturnType<ReturnType<typeof criticalCssPlugin>['config']>['build']['modulePreload']['resolveDependencies'];
	}> {
		const plugin = criticalCssPlugin({ runnerImport });

		plugin.configResolved({ root });
		await plugin.generateBundle.handler({}, bundle);

		return { plugin, resolveDependencies: plugin.config().build.modulePreload.resolveDependencies };
	}

	it('finds the module it cuts the sheet with', () => {
		expect(readFileSync(CRITICAL_ASSETS_MODULE, 'utf8')).toContain('export function criticalStylesheet(');
	});

	it('reads the first screen as the entry and its static imports, transitively', () => {
		const bundle = fixtureBundle();

		bundle['assets/shared.js'] = chunk('assets/shared.js', '', { imports: ['assets/deep.js']});
		bundle['assets/deep.js'] = chunk('assets/deep.js', '');

		expect([...startupChunks(bundle).files].sort()).toEqual(['assets/deep.js', 'assets/index.js', 'assets/shared.js']);
	});

	it.each([
		['no entry chunk', {}],
		['two entry chunks', { 'a.js': chunk('a.js', '', { isEntry: true }), 'b.js': chunk('b.js', '', { isEntry: true }) }],
	])('fails on a bundle with %s', (_case, bundle) => {
		expect(() => startupChunks(bundle)).toThrow('the page\'s first screen is read from exactly one');
	});

	it('puts the first screen’s rules into the page, in place of the link, and links no stylesheet', async () => {
		const { plugin } = await readBundle();
		const page = plugin.transformIndexHtml.handler(BUILT_PAGE, { filename: 'index.html' });

		expect(page).toContain('<link rel="modulepreload" crossorigin href="/assets/shared.js">\n\t\t<style>.fe-hub{color:red}.fe-header{gap:0}</style>\n\t</head>');
		expect(page).not.toMatch(/rel="(?:stylesheet|preload)"/u);
	});

	it('gives the whole sheet to the imports whose code needs it, and to no other', async () => {
		const { resolveDependencies } = await readBundle();

		expect(resolveDependencies('assets/panel.js', [], { hostId: 'assets/index.js', hostType: 'js' })).toEqual(['assets/index.css']);
		expect(resolveDependencies('assets/more.js', ['assets/more.js', 'assets/shared.js'], { hostId: 'assets/index.js', hostType: 'js' })).toEqual([
			'assets/more.js',
			'assets/shared.js',
		]);
		expect(resolveDependencies('assets/panel.js', ['assets/panel.js'], { hostId: 'index.html', hostType: 'html' })).toEqual(['assets/panel.js']);
	});

	it('preloads the sheet from the head when the head preloads code that needs it', async () => {
		const { plugin } = await readBundle();
		const page = plugin.transformIndexHtml.handler(
			BUILT_PAGE.replace('\t</head>', '\t<link rel="modulepreload" crossorigin href="/assets/panel.js">\n\t</head>'),
			{ filename: 'index.html' },
		);

		expect(page).toContain('<link rel="preload" as="style" crossorigin href="/assets/index.css">\n\t</head>');
		expect(page).not.toContain('rel="stylesheet"');
	});

	it('reads a sheet the bundle holds as bytes', async () => {
		const bundle = fixtureBundle();

		bundle['assets/index.css'] = { fileName: 'assets/index.css', source: new TextEncoder().encode(SHEET), type: 'asset' };

		const { plugin } = await readBundle(bundle);

		expect(plugin.transformIndexHtml.handler(BUILT_PAGE, { filename: 'index.html' })).toContain('<style>.fe-hub{color:red}.fe-header{gap:0}</style>');
	});

	it('reports what it did, once the build is written', async () => {
		const bundle = fixtureBundle();
		const { plugin, resolveDependencies } = await readBundle(bundle);
		const messages: string[] = [];

		resolveDependencies('assets/panel.js', [], { hostId: 'assets/index.js', hostType: 'js' });
		resolveDependencies('assets/more.js', [], { hostId: 'assets/index.js', hostType: 'js' });
		bundle['assets/index.js'] = chunk('assets/index.js', 'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index.css"])))=>i.map(i=>d[i]);');
		plugin.writeBundle.call({ info: (message) => messages.push(message) }, {}, bundle);

		expect(messages).toEqual(['critical CSS: index.html carries 2 of 3 rules (0.0 kB); assets/index.css loads with 1 of 2 on-demand imports']);
	});

	it('fails when the built code of an import given the sheet does not name it', async () => {
		const { plugin, resolveDependencies } = await readBundle();

		resolveDependencies('assets/panel.js', [], { hostId: 'assets/index.js', hostType: 'js' });

		expect(() => plugin.writeBundle.call({ info: () => undefined }, {}, fixtureBundle())).toThrow(
			'assets/index.js should load assets/index.css with an import, but the built code does not name it.',
		);
	});

	it('fails when the page still links a stylesheet', async () => {
		const { plugin } = await readBundle();
		const page = BUILT_PAGE.replace('\t</head>', '\t<link href="/assets/extra.css" rel="stylesheet">\n\t</head>');

		expect(() => plugin.transformIndexHtml.handler(page, { filename: 'index.html' })).toThrow(
			'index.html still links a stylesheet after its critical CSS was inlined: <link href="/assets/extra.css" rel="stylesheet">',
		);
		expect(() => plugin.transformIndexHtml.handler(BUILT_PAGE.replace('index.css', 'other.css'), { filename: 'index.html' })).toThrow(
			'The page links /assets/other.css, which is not in the build.',
		);
	});

	it.each([
		['imports no stylesheet', [], 'imports 0 stylesheets'],
		['imports two', ['assets/index.css', 'assets/more.css'], 'imports 2 stylesheets'],
		['imports one the bundle lacks', ['assets/gone.css'], 'imports assets/gone.css, which is not in the bundle'],
	])('fails when the first screen %s', async (_case, css, message) => {
		await expect(readBundle(fixtureBundle(css))).rejects.toThrow(message);
	});

	it('fails when asked to write the page or the bundle before it has read the bundle', () => {
		const plugin = criticalCssPlugin({ runnerImport });
		const { resolveDependencies } = plugin.config().build.modulePreload;

		expect(() => resolveDependencies('assets/panel.js', [], { hostId: 'assets/index.js', hostType: 'js' })).toThrow('before the plugin read the bundle');
		expect(() => plugin.transformIndexHtml.handler(BUILT_PAGE, { filename: 'index.html' })).toThrow('index.html: the critical CSS was not cut');
		expect(() => plugin.writeBundle.call({ info: () => undefined }, {}, {})).toThrow('the bundle was written without the plugin reading it');
	});
});
