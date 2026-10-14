/**
 * Every React app's build checks its startup JavaScript against a budget, and the check measures what
 * it claims to.
 *
 * @remarks
 * ### What the budget protects
 *
 * The React apps load every page on demand: datasets through their registry entries' `load`, the docs
 * through `docsRoute`'s lazy routes, the lab and the server-backed route the same way. The split lasts
 * only while nothing on the startup graph imports a page statically, and breaking it is silent — the
 * build succeeds, every test passes, every screen renders, and the hub now downloads the engine. So
 * each app's `build` ends its bundling with `scripts/check-startup-budget.mjs`, which fails the build
 * when the JavaScript fetched before the first render exceeds the budget it is given.
 *
 * ### What this file pins
 *
 * - **Which apps run it, derived:** every package with an `index.html` (a Vite single-page app) that
 *   depends on `react-dom`. A new React app is covered the moment it exists, and fails here until its
 *   build runs the check.
 * - **Where in the build it runs:** after `vite build`, and before the corpus strip, which
 *   `buildsStripLocalCorpus.test.ts` requires to be the build's last step.
 * - **What the script counts,** on a fixture build: the entry module, the modulepreloaded chunks and
 *   everything they import statically — including a chunk only reachable through a static import, in
 *   case modulepreload is ever turned off — and not a dynamically imported chunk, which is the code the
 *   budget exists to keep out of the count.
 * - **That it fails loudly** over budget, and on a build it cannot measure: no `index.html`, no entry
 *   script, a listed chunk missing from disk, or a malformed command line. A budget check that measured
 *   nothing would otherwise read exactly like one that passed.
 *
 * @packageDocumentation
 */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { REPO_ROOT } from './support/repoFiles.js';

const BUDGET_SCRIPT = resolve(REPO_ROOT, 'scripts/check-startup-budget.mjs');

/** The command each app's build runs, from its package directory, against its `dist`. */
const BUDGET_COMMAND = /^node \.\.\/\.\.\/scripts\/check-startup-budget\.mjs dist --max-kb (\d+)$/u;

/** The step `buildsStripLocalCorpus.test.ts` requires to come last. */
const STRIP_PREFIX = 'node ../../scripts/strip-local-corpus.mjs';

/** The part of a package manifest this file reads. */
interface Manifest {
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly scripts?: Readonly<Record<string, string>>;
}

/**
 * Read a package's manifest.
 *
 * @param name - The package's directory under `packages/`.
 * @returns The parsed `package.json`.
 */
function readManifest(name: string): Manifest {
	return JSON.parse(readFileSync(resolve(REPO_ROOT, 'packages', name, 'package.json'), 'utf8')) as Manifest;
}

/** Every React single-page app: a package with an `index.html` that depends on `react-dom`. */
const REACT_APPS = readdirSync(resolve(REPO_ROOT, 'packages'), { withFileTypes: true })
	.filter((entry) => entry.isDirectory() && existsSync(resolve(REPO_ROOT, 'packages', entry.name, 'index.html')))
	.map((entry) => entry.name)
	.filter((name) => readManifest(name).dependencies?.['react-dom'] !== undefined)
	.sort();

describe('React app builds check their startup budget', () => {
	it('finds the React apps, so the cases below are not vacuous', () => {
		// Pinned by name as well as derived, so a derivation that stopped matching would fail here
		// rather than shrink the set the per-app cases run over.
		expect(REACT_APPS).toEqual(expect.arrayContaining(['examples-react-plain', 'examples-react-rtk']));
	});

	for (const app of REACT_APPS) {
		it(`${app}: runs the budget check on dist after vite build, before the corpus strip`, () => {
			const build = readManifest(app).scripts?.['build'] ?? '';
			const steps = build.split('&&').map((step) => step.trim());
			const budgetIndex = steps.findIndex((step) => BUDGET_COMMAND.test(step));

			expect(
				budgetIndex,
				`${app}'s build is "${build}" — it must run \`node ../../scripts/check-startup-budget.mjs dist --max-kb <kB>\``,
			).toBeGreaterThan(0);
			expect(steps[0]).toBe('vite build');
			expect(steps.at(-1)?.startsWith(STRIP_PREFIX)).toBe(true);
			expect(budgetIndex).toBeLessThan(steps.length - 1);
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
	 * Write a fixture build: an `index.html` plus the given files under `assets/`.
	 *
	 * @param html - The document's `<head>` content.
	 * @param assets - File name → contents.
	 * @returns The build-output directory.
	 */
	function writeBuild(html: string | null, assets: Readonly<Record<string, string>>): string {
		scratch = mkdtempSync(join(tmpdir(), 'startup-budget-'));
		mkdirSync(join(scratch, 'assets'));
		if (html !== null) {
			writeFileSync(join(scratch, 'index.html'), `<!doctype html><html><head>${html}</head><body></body></html>`);
		}
		for (const [name, contents] of Object.entries(assets)) {
			writeFileSync(join(scratch, 'assets', name), contents);
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

	/** A fixture shaped like a Vite build: an entry, a preloaded vendor chunk, and code beyond them. */
	const VITE_LIKE_HTML =
		'<script type="module" crossorigin src="/assets/index.js"></script>' +
		'<link rel="modulepreload" crossorigin href="/assets/vendor.js">' +
		'<link rel="stylesheet" crossorigin href="/assets/index.css">';

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

	it.each([
		['no budget', ['dist']],
		['a budget that is not a positive number', ['dist', '--max-kb', 'none']],
		['no output directory', ['--max-kb', '400']],
	])('fails on a command line with %s', (_case, args) => {
		const run = runBudget(...args);

		expect(run.status).toBe(1);
		expect(run.stderr).toContain('usage: node check-startup-budget.mjs');
	});
});
