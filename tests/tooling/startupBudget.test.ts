/**
 * Every demo app's build checks its startup JavaScript against a budget, and the check measures what
 * it claims to.
 *
 * @remarks
 * ### What the budget protects
 *
 * Every app loads its dataset pages on demand: the React apps through their registry entries' `load`,
 * Vue through lazy route components, vanilla through a dynamic `import()` in each route's `render`,
 * Angular through `loadComponent` and resolvers that `import()` their boot, SvelteKit through its
 * per-route nodes, and the docs through `docsRouteAt`'s lazy routes. The split lasts only while nothing
 * on the startup graph imports a page statically, and breaking it is silent — the build succeeds,
 * every test passes, every screen renders, and the hub now downloads the engine. So each app's `build`
 * runs `scripts/check-startup-budget.mjs` on its built first page, which fails the build when the
 * JavaScript fetched before the first render exceeds the budget it is given.
 *
 * ### What this file pins
 *
 * - **Which apps run it, derived:** every deployed `examples-*` package (one with a `wrangler.jsonc`).
 *   A new app is covered the moment it is deployable, and fails here until its build runs the check
 *   on the page it serves first.
 * - **Where in the build it runs:** after the bundler, and before the corpus strip, which
 *   `buildsStripLocalCorpus.test.ts` requires to be the build's last step.
 * - **What the script counts,** on fixture builds: the entry module, the modulepreloaded chunks and
 *   everything they import statically — including a chunk only reachable through a static import, in
 *   case modulepreload is ever turned off — and not a dynamically imported chunk, which is the code the
 *   budget exists to keep out of the count. Also the shapes the other bundlers write: Angular's bare
 *   chunk names, and a prerendered SvelteKit page that starts from an inline `import()` and is measured
 *   with `--html` against a separate client directory. Markup quoted in an HTML comment is not read.
 * - **That it fails loudly** over budget, and on a build it cannot measure: no page, no entry,
 *   a listed chunk missing from disk, or a malformed command line. A budget check that measured
 *   nothing would otherwise read exactly like one that passed.
 * - **That it fails a page whose first render waits for a stylesheet,** in each form a build writes
 *   one (Vite's link, SvelteKit's, unquoted attributes, an inline `@import`), and passes the forms that
 *   do not block: SvelteKit's `disabled` link beside its inlined CSS, Angular's `media="print"` link and
 *   its `<noscript>` fallback, a preload, and markup quoted in a comment.
 *
 * @packageDocumentation
 */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { listDeployTargets } from '../../scripts/lib/deploy-targets.mjs';
import { REPO_ROOT } from './support/repoFiles.js';

const BUDGET_SCRIPT = resolve(REPO_ROOT, 'scripts/check-startup-budget.mjs');

/** The budget step as each app's build writes it, from its package directory. */
const BUDGET_COMMAND = /^node \.\.\/\.\.\/scripts\/check-startup-budget\.mjs (\S+)(?: --html (\S+))? --max-kb (\d+)$/u;

/** The step `buildsStripLocalCorpus.test.ts` requires to come last. */
const STRIP_PREFIX = 'node ../../scripts/strip-local-corpus.mjs';

/** The bundler steps a build can run. Everything the budget measures is written by one of them. */
const BUNDLER_STEPS: ReadonlySet<string> = new Set(['ng build', 'vite build']);

/**
 * Where each app's first page is built, as its budget step names it: the directory its URLs resolve
 * against, and the page when it is not that directory's `index.html`.
 *
 * @remarks
 * Measuring the wrong output is the quiet failure here — an old `dist` or another page would pass
 * forever — so the arguments are pinned per app. SvelteKit's hub is a prerendered page, written apart
 * from the client assets it loads, and measured from SvelteKit's own output so it does not depend on
 * which adapter the build used.
 */
const FIRST_PAGES: Readonly<Record<string, { readonly directory: string; readonly html?: string }>> = {
	'examples-angular': { directory: 'dist/browser' },
	'examples-docs': { directory: 'dist' },
	'examples-react-plain': { directory: 'dist' },
	'examples-react-rtk': { directory: 'dist' },
	'examples-sveltekit': { directory: '.svelte-kit/output/client', html: '.svelte-kit/output/prerendered/pages/index.html' },
	'examples-vanilla': { directory: 'dist' },
	'examples-vue': { directory: 'dist' },
};

/** The part of a package manifest this file reads. */
interface Manifest {
	readonly scripts?: Readonly<Record<string, string>>;
}

/**
 * Read a package's build script, split into its `&&` steps.
 *
 * @param name - The package's directory under `packages/`.
 * @returns The steps, trimmed.
 */
function buildSteps(name: string): string[] {
	const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, 'packages', name, 'package.json'), 'utf8')) as Manifest;

	return (manifest.scripts?.['build'] ?? '').split('&&').map((step) => step.trim());
}

/** Every deployed demo app: an `examples-*` package with a `wrangler.jsonc`. */
const APPS = listDeployTargets()
	.map((target) => target.packageDirectory)
	.filter((name) => name.startsWith('examples-'))
	.sort();

describe('every app build checks its startup budget', () => {
	it('finds the apps, so the cases below are not vacuous', () => {
		// Pinned by name as well as derived, so a derivation that stopped matching would fail here
		// rather than shrink the set the per-app cases run over.
		expect(APPS).toEqual(Object.keys(FIRST_PAGES).sort());
	});

	for (const app of APPS) {
		it(`${app}: runs the budget check on its first page after bundling, before the corpus strip`, () => {
			const steps = buildSteps(app);
			const budgetIndex = steps.findIndex((step) => BUDGET_COMMAND.test(step));
			const bundlerIndex = steps.findIndex((step) => BUNDLER_STEPS.has(step));
			const [, directory, html, maxKb] = BUDGET_COMMAND.exec(steps[budgetIndex] ?? '') ?? [];

			expect(budgetIndex, `${app}'s build must run \`node ../../scripts/check-startup-budget.mjs <dir> --max-kb <kB>\``).toBeGreaterThan(-1);
			expect(steps.filter((step) => step.includes('check-startup-budget')), 'one budget step, in the pinned form').toHaveLength(1);
			expect(bundlerIndex, `${app}'s build runs no bundler step`).toBeGreaterThan(-1);
			expect(budgetIndex).toBeGreaterThan(bundlerIndex);
			expect(steps.at(-1)?.startsWith(STRIP_PREFIX)).toBe(true);
			expect(budgetIndex).toBeLessThan(steps.length - 1);
			expect({ directory, html }).toEqual({ directory: FIRST_PAGES[app]?.directory, html: FIRST_PAGES[app]?.html });
			expect(Number(maxKb)).toBeGreaterThan(0);
		});
	}
});

describe('check-startup-budget.mjs', () => {
	let scratch = '';

	afterEach(() => {
		if (scratch !== '') {
			rmSync(scratch, { force: true, recursive: true });
			scratch = '';
		}
	});

	/**
	 * Write a fixture build: an `index.html` plus the given files under `assets/` and at the root.
	 *
	 * @param html - The document's `<head>` content, or `null` for no `index.html`.
	 * @param assets - File name → contents, under `assets/` (where Vite writes chunks).
	 * @param rootFiles - File name → contents, beside `index.html` (where Angular writes them).
	 * @returns The build-output directory.
	 */
	function writeBuild(
		html: string | null,
		assets: Readonly<Record<string, string>>,
		rootFiles: Readonly<Record<string, string>> = {},
	): string {
		scratch = mkdtempSync(join(tmpdir(), 'startup-budget-'));
		mkdirSync(join(scratch, 'assets'));
		if (html !== null) {
			writeFileSync(join(scratch, 'index.html'), `<!doctype html><html><head>${html}</head><body></body></html>`);
		}
		for (const [name, contents] of Object.entries(assets)) {
			writeFileSync(join(scratch, 'assets', name), contents);
		}
		for (const [name, contents] of Object.entries(rootFiles)) {
			writeFileSync(join(scratch, name), contents);
		}

		return scratch;
	}

	/**
	 * Run the script.
	 *
	 * @param args - Its arguments.
	 * @returns The exit status and output.
	 */
	function runBudget(...args: string[]): SpawnSyncReturns<string> {
		return spawnSync(process.execPath, [BUDGET_SCRIPT, ...args], { encoding: 'utf8' });
	}

	/**
	 * A fixture shaped like a Vite build: an entry, a preloaded vendor chunk, and code beyond them, with
	 * a stylesheet linked the one way that does not block the first render, so that its size is in the
	 * build without being JavaScript the first screen counts.
	 */
	const VITE_LIKE_HTML =
		'<script type="module" crossorigin src="/assets/index.js"></script>' +
		'<link rel="modulepreload" crossorigin href="/assets/vendor.js">' +
		'<link rel="stylesheet" href="/assets/index.css" media="print">';

	/**
	 * The fixture's chunks, each found by exactly one of the two routes the script reads, so dropping
	 * either route changes the count. `vendor.js` is only in the document's modulepreload list.
	 * `shared.js` is only reachable as a static import of `index.js` (as if modulepreload were off), and
	 * `facade.js` only as a static re-export. `page.js` is dynamically imported and must not be
	 * counted. Sizes: 100 + 200 + 300 + 50 = 650 bytes counted; `page.js` is 5,000.
	 */
	function viteLikeAssets(): Record<string, string> {
		const pad = (code: string, size: number): string => code.padEnd(size, ' ');

		return {
			'facade.js': pad('const f=1;export{f};', 50),
			'index.css': pad('body{}', 9000),
			'index.js': pad('import"./shared.js";export{f}from"./facade.js";const p=()=>import(`./page.js`);', 100),
			'page.js': pad('import"./vendor.js";', 5000),
			'shared.js': pad('export const s=1;', 300),
			'vendor.js': pad('export const a=1;', 200),
		};
	}

	it('counts the entry, its preloads and its static imports — not dynamic imports or CSS', () => {
		const run = runBudget(writeBuild(VITE_LIKE_HTML, viteLikeAssets()), '--max-kb', '1');

		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toContain('0.7 kB of JavaScript before the first render (4 files; budget 1 kB)');
	});

	it('fails over budget, naming the files and what to look for', () => {
		const run = runBudget(writeBuild(VITE_LIKE_HTML, viteLikeAssets()), '--max-kb', '0.5');

		expect(run.status).toBe(1);
		expect(run.stderr).toContain('0.7 kB of JavaScript before the first render (4 files; budget 0.5 kB)');
		expect(run.stderr).toMatch(/0\.3 kB\s+assets[/\\]shared\.js/u);
		expect(run.stderr).toContain('should load on demand');
		expect(run.stderr).not.toContain('page.js');
	});

	it('fails on a build with no index.html', () => {
		const run = runBudget(writeBuild(null, { 'index.js': '' }), '--max-kb', '400');

		expect(run.status).toBe(1);
		expect(run.stderr).toContain('does not exist');
	});

	it('fails on an index.html with no module entry', () => {
		const run = runBudget(writeBuild('<script src="/assets/index.js"></script>', { 'index.js': '' }), '--max-kb', '400');

		expect(run.status).toBe(1);
		expect(run.stderr).toContain('no <script type="module" src>');
	});

	it('fails when a chunk on the first screen is missing from the build', () => {
		const run = runBudget(
			writeBuild('<script type="module" src="/assets/index.js"></script>', { 'index.js': 'import"./gone.js";' }),
			'--max-kb',
			'400',
		);

		expect(run.status).toBe(1);
		expect(run.stderr).toMatch(/assets[/\\]gone\.js is part of the first screen but is not in the build output/u);
	});

	it('reads Angular\'s bare chunk names, and skips markup quoted in a comment', () => {
		// Angular writes `<script src="main-X.js" type="module">` and bare preload names beside
		// `<base href="/">`; its index.html also quotes a relative `<script src="main.js">` in a comment.
		const run = runBudget(
			writeBuild(
				'<base href="/"><!-- The builder emits <script src="ghost.js" type="module"></script> --><link rel="modulepreload" href="chunk-A.js">'
					+ '<script src="main-B.js" type="module"></script>',
				{},
				{ 'chunk-A.js': 'export const a=1;'.padEnd(300, ' '), 'chunk-C.js': 'export const c=1;'.padEnd(200, ' '), 'main-B.js': 'import"./chunk-C.js";'.padEnd(500, ' ') },
			),
			'--max-kb',
			'1',
		);

		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toContain('1.0 kB of JavaScript before the first render (3 files; budget 1 kB)');
	});

	it('measures a page given with --html, started by an inline import(), against a separate directory', () => {
		// A prerendered SvelteKit page: its preloads and its inline start script name `./_app/…` URLs,
		// and the page itself is written apart from the client assets those URLs resolve against.
		const client = writeBuild(null, {});

		mkdirSync(join(client, '_app'));
		writeFileSync(join(client, '_app', 'start.js'), 'import"./shared.js";'.padEnd(400, ' '));
		writeFileSync(join(client, '_app', 'shared.js'), 'export const s=1;'.padEnd(100, ' '));
		writeFileSync(join(client, '_app', 'node.js'), 'export const n=1;const p=()=>import("./page.js");'.padEnd(250, ' '));
		writeFileSync(join(client, '_app', 'page.js'), ''.padEnd(9000, ' '));

		const page = join(client, 'prerendered', 'index.html');

		mkdirSync(dirname(page));
		writeFileSync(
			page,
			'<html><head><link href="./_app/node.js" rel="modulepreload"></head><body>'
				+ '<script>Promise.all([import("./_app/start.js")]).then(([kit]) => kit.start());</script></body></html>',
		);

		const run = runBudget(client, '--html', page, '--max-kb', '1');

		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toContain('0.8 kB of JavaScript before the first render (3 files; budget 1 kB)');
	});

	it('fails when the page given with --html does not exist', () => {
		const run = runBudget(writeBuild(VITE_LIKE_HTML, viteLikeAssets()), '--html', '/no/such/page.html', '--max-kb', '400');

		expect(run.status).toBe(1);
		expect(run.stderr).toContain('/no/such/page.html does not exist');
	});

	it.each([
		['Vite\'s stylesheet link', '<link rel="stylesheet" crossorigin href="/assets/index.css">'],
		['SvelteKit\'s stylesheet link', '<link href="./_app/immutable/assets/0.css" rel="stylesheet">'],
		['a link with unquoted attributes', '<link rel=stylesheet href=/assets/index.css>'],
		['a link whose media matches the screen', '<link rel="stylesheet" href="/assets/index.css" media="all">'],
		['an inline @import', '<style>@import url(/assets/index.css);body{margin:0}</style>'],
	])('fails a page whose first render waits for a stylesheet: %s', (_case, tag) => {
		const run = runBudget(writeBuild(`${VITE_LIKE_HTML}${tag}`, viteLikeAssets()), '--max-kb', '1');

		expect(run.status).toBe(1);
		expect(run.stderr).toContain('makes its first render wait for a stylesheet');
		expect(run.stderr).toContain(tag.startsWith('<style') ? 'an @import in an inline <style>' : tag);
		expect(run.stderr).toContain('scripts/lib/critical-css.mjs');
	});

	it('passes the stylesheets that do not hold up the first render', () => {
		const tags = [
			// SvelteKit, beside the CSS it inlined: the link is there so its client knows the sheet is applied.
			'<style>body{margin:0}</style><link href="./_app/immutable/assets/0.css" rel="stylesheet" disabled media="(max-width: 0)">',
			// Angular: its sheet loaded as print and swapped in, and the fallback for a browser without scripts.
			'<link rel="stylesheet" href="styles-X.css" media="print" data-beasties-media="all">',
			'<noscript><link rel="stylesheet" href="styles-X.css"></noscript>',
			// A preload of the whole sheet, and markup that is only quoted.
			'<link rel="preload" as="style" crossorigin href="/assets/index.css">',
			'<!-- <link rel="stylesheet" href="/assets/old.css"> -->',
		];
		const run = runBudget(writeBuild(`${VITE_LIKE_HTML}${tags.join('')}`, viteLikeAssets()), '--max-kb', '1');

		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toContain('before the first render (4 files; budget 1 kB), and no stylesheet holds it up');
	});

	it.each([
		['no budget', ['dist']],
		['a budget that is not a positive number', ['dist', '--max-kb', 'none']],
		['no output directory', ['--max-kb', '400']],
		['--html with no page', ['dist', '--max-kb', '400', '--html']],
	])('fails on a command line with %s', (_case, args) => {
		const run = runBudget(...args);

		expect(run.status).toBe(1);
		expect(run.stderr).toContain('usage: node check-startup-budget.mjs');
	});
});
