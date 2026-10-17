/**
 * Every demo app preloads its first screen's two brand fonts, and the code that writes and checks
 * those preloads does what it claims.
 *
 * @remarks
 * ### What the preloads buy, and why a gate
 *
 * A browser finds a webfont only once it has parsed the stylesheet that declares it, so the first
 * paint sets a fallback and swaps faces a moment later. A `<link rel="preload" as="font">` in the head
 * starts the download with the HTML. Its failure modes are all invisible: a preload naming a file the
 * build no longer has is a 404 on every first visit, a missing one costs only speed, a third one
 * (JetBrains Mono, the largest subset) spends early bandwidth the startup scripts need, and one
 * without `crossorigin` downloads the font twice. No test or screen shows any of them, so each app's
 * build reads its built page back with `scripts/check-font-preloads.mjs`.
 *
 * ### What this file pins
 *
 * - **Which apps check it, derived:** every deployed `examples-*` package, each running the check on
 *   the page it serves first, after bundling and before the corpus strip. Angular writes its preloads
 *   in a step of its own before the check (`scripts/preload-fonts.mjs`); the Vite apps through
 *   `fontPreloadsPlugin` in their `vite.config.ts`; SvelteKit through its `preload` hook, whose font
 *   list must match the shared one.
 * - **The shared library** (`scripts/lib/font-preloads.mjs`): which fonts, how a preload is written
 *   and read in any attribute order, how a hashed name maps back to its source, how a build directory
 *   and a Vite bundle are searched.
 * - **Both scripts,** on fixture builds: the check passes exactly the right page and fails, naming
 *   the problem, on a missing face, an extra face, a preload without `crossorigin`, a preload of a file
 *   not in the build, a page or root that does not exist, and a malformed command line; the writer
 *   writes once and refuses a page that already has preloads or a build missing a font.
 *
 * @packageDocumentation
 */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { listDeployTargets } from '../../scripts/lib/deploy-targets.mjs';
import {
	APP_PRELOADED_FONTS,
	findBuiltFonts,
	fontPreloadsAreWellFormed,
	fontPreloadsPlugin,
	preloadFonts,
	readFontPreloads,
	sourceFontName,
} from '../../scripts/lib/font-preloads.mjs';
import { REPO_ROOT } from './support/repoFiles.js';

// Content hashes from real Angular builds, which the fixtures reuse. cspell:ignore SAUZOI KNAFA

const CHECK_SCRIPT = resolve(REPO_ROOT, 'scripts/check-font-preloads.mjs');
const WRITE_SCRIPT = resolve(REPO_ROOT, 'scripts/preload-fonts.mjs');

/** The check step as each app's build writes it. */
const CHECK_COMMAND = /^node \.\.\/\.\.\/scripts\/check-font-preloads\.mjs (\S+)(?: --root (\S+))?$/u;

/** Angular's writer step. */
const WRITE_COMMAND = /^node \.\.\/\.\.\/scripts\/preload-fonts\.mjs (\S+)$/u;

/** The step `buildsStripLocalCorpus.test.ts` requires to come last. */
const STRIP_PREFIX = 'node ../../scripts/strip-local-corpus.mjs';

/** The bundler steps a build can run. */
const BUNDLER_STEPS: ReadonlySet<string> = new Set(['ng build', 'vite build']);

/** How each app gets its preloads written, and the page its check reads. */
const APP_PRELOADS: Readonly<Record<string, { readonly page: string; readonly root?: string; readonly writer: 'hook' | 'plugin' | 'script' }>> = {
	'examples-angular': { page: 'dist/browser/index.html', writer: 'script' },
	'examples-docs': { page: 'dist/index.html', writer: 'plugin' },
	'examples-react-plain': { page: 'dist/index.html', writer: 'plugin' },
	'examples-react-rtk': { page: 'dist/index.html', writer: 'plugin' },
	'examples-sveltekit': {
		page: '.svelte-kit/output/prerendered/pages/index.html',
		root: '.svelte-kit/output/client',
		writer: 'hook',
	},
	'examples-vanilla': { page: 'dist/index.html', writer: 'plugin' },
	'examples-vue': { page: 'dist/index.html', writer: 'plugin' },
};

/**
 * Read a package's build script, split into its `&&` steps.
 *
 * @param name - The package's directory under `packages/`.
 * @returns The steps, trimmed.
 */
function buildSteps(name: string): string[] {
	const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, 'packages', name, 'package.json'), 'utf8')) as {
		readonly scripts?: Readonly<Record<string, string>>;
	};

	return (manifest.scripts?.['build'] ?? '').split('&&').map((step) => step.trim());
}

/** Every deployed demo app: an `examples-*` package with a `wrangler.jsonc`. */
const APPS = listDeployTargets()
	.map((target) => target.packageDirectory)
	.filter((name) => name.startsWith('examples-'))
	.sort();

/** A built page's head, as the writers find it. */
const PAGE = '<!doctype html><html><head><meta charset="utf-8">\n\t\t<link rel="icon" href="/favicon.svg">\n\t</head><body></body></html>';

describe('every app build preloads its first screen’s fonts', () => {
	it('finds the apps, so the cases below are not vacuous', () => {
		expect(APPS).toEqual(Object.keys(APP_PRELOADS).sort());
	});

	for (const app of APPS) {
		const expected = APP_PRELOADS[app];

		it(`${app}: checks ${expected?.page ?? '?'} after bundling, before the corpus strip`, () => {
			const steps = buildSteps(app);
			const checkIndex = steps.findIndex((step) => CHECK_COMMAND.test(step));
			const [, page, root] = CHECK_COMMAND.exec(steps[checkIndex] ?? '') ?? [];

			expect(checkIndex, `${app}'s build must run node ../../scripts/check-font-preloads.mjs on its first page`).toBeGreaterThan(-1);
			expect(checkIndex).toBeGreaterThan(steps.findIndex((step) => BUNDLER_STEPS.has(step)));
			expect(checkIndex).toBeLessThan(steps.length - 1);
			expect(steps.at(-1)?.startsWith(STRIP_PREFIX)).toBe(true);
			expect({ page, root }).toEqual({ page: expected?.page, root: expected?.root });
		});

		it(`${app}: writes them with its ${expected?.writer ?? '?'}`, () => {
			const steps = buildSteps(app);
			const writeIndex = steps.findIndex((step) => WRITE_COMMAND.test(step));

			if (expected?.writer === 'script') {
				expect(WRITE_COMMAND.exec(steps[writeIndex] ?? '')?.[1]).toBe(expected.page);
				expect(writeIndex).toBeLessThan(steps.findIndex((step) => CHECK_COMMAND.test(step)));
			} else {
				expect(writeIndex, 'only an app without a preload hook or plugin writes them in a build step').toBe(-1);
			}

			if (expected?.writer === 'plugin') {
				const config = readFileSync(resolve(REPO_ROOT, 'packages', app, 'vite.config.ts'), 'utf8');

				expect(config).toContain("import { fontPreloadsPlugin } from '../../scripts/lib/font-preloads.mjs';");
				expect(config).toMatch(/plugins: \[[^\]]*\bfontPreloadsPlugin\(\)/u);
			}

			if (expected?.writer === 'hook') {
				const hooks = readFileSync(resolve(REPO_ROOT, 'packages', app, 'src/hooks.server.ts'), 'utf8');

				expect(hooks).toContain('resolve(event, { preload: preloadFirstScreenAsset })');
			}
		});
	}

	it('SvelteKit’s preload hook names the same faces as the shared list', () => {
		const source = readFileSync(resolve(REPO_ROOT, 'packages/examples-sveltekit/src/lib/server/preload.ts'), 'utf8');
		const stems = /PRELOADED_FONT_STEMS: readonly string\[\] = \[([^\]]*)\]/u.exec(source)?.[1] ?? '';
		const names = [...stems.matchAll(/'([^']+)'/gu)].map(([, stem]) => `${stem ?? ''}.woff2`);

		expect(names.length).toBeGreaterThan(0);
		expect(names.sort()).toEqual([...APP_PRELOADED_FONTS].sort());
	});
});

describe('scripts/lib/font-preloads.mjs', () => {
	it('preloads the display face and Inter, and not JetBrains Mono', () => {
		expect([...APP_PRELOADED_FONTS].sort()).toEqual(['FilterEngineZDisplay-Subset.woff2', 'Inter-Subset.woff2']);
	});

	it('writes one crossorigin preload per font before the page’s first link, in order', () => {
		const html = preloadFonts(PAGE, ['/assets/A-abc.woff2', '/assets/B-abc.woff2']);

		expect(readFontPreloads(html)).toEqual(['/assets/A-abc.woff2', '/assets/B-abc.woff2']);
		expect(html.indexOf('/assets/B-abc.woff2')).toBeLessThan(html.indexOf('rel="icon"'));
		expect(fontPreloadsAreWellFormed(html)).toBe(true);
	});

	it('fails on a page with no link to put the preloads before', () => {
		expect(() => preloadFonts('<head></head>', ['/a.woff2'])).toThrow('no <link>');
	});

	it('reads preloads in any attribute order, and judges each one', () => {
		const svelteKitTag = '<link href="./_app/x.woff2" rel="preload" as="font" type="font/woff2" crossorigin>';
		const noCors = '<link rel="preload" as="font" type="font/woff2" href="/y.woff2">';

		expect(readFontPreloads(`${svelteKitTag}${noCors}<link rel="preload" as="style" href="/z.css">`)).toEqual(['./_app/x.woff2', '/y.woff2']);
		expect(fontPreloadsAreWellFormed(svelteKitTag)).toBe(true);
		expect(fontPreloadsAreWellFormed(`${svelteKitTag}${noCors}`)).toBe(false);
		expect(fontPreloadsAreWellFormed('<link rel="preload" as="font" href="/y.woff2" crossorigin>')).toBe(false);
	});

	it.each([
		['Inter-Subset-DlVByD-t.woff2', 'Inter-Subset.woff2'],
		['Inter-Subset-SAUZOI3V.woff2', 'Inter-Subset.woff2'],
		['Inter-Subset.DlVByD-t.woff2', 'Inter-Subset.woff2'],
		['Inter-Subset.woff2', 'Inter-Subset.woff2'],
	])('maps the built name %s back to %s', (built, source) => {
		expect(sourceFontName(built)).toBe(source);
	});

	describe('with a build on disk', () => {
		let scratch = '';

		afterEach(() => {
			rmSync(scratch, { force: true, recursive: true });
		});

		it('finds each font’s one hashed copy, as a root-relative URL', () => {
			scratch = mkdtempSync(join(tmpdir(), 'font-preloads-'));
			mkdirSync(join(scratch, 'media'));
			writeFileSync(join(scratch, 'media', 'Inter-Subset-SAUZOI3V.woff2'), '');
			writeFileSync(join(scratch, 'media', 'JetBrainsMono-Subset-KNAFA4MJ.woff2'), '');

			expect(findBuiltFonts(scratch, ['Inter-Subset.woff2'])).toEqual(['/media/Inter-Subset-SAUZOI3V.woff2']);
			expect(() => findBuiltFonts(scratch, ['FilterEngineZDisplay-Subset.woff2'])).toThrow('holds 0 built copies');

			writeFileSync(join(scratch, 'Inter-Subset-ABCDEFGH.woff2'), '');
			expect(() => findBuiltFonts(scratch, ['Inter-Subset.woff2'])).toThrow('holds 2 built copies');
		});
	});

	describe('fontPreloadsPlugin', () => {
		/** A Vite bundle holding the three brand fonts and a chunk. */
		const BUNDLE = {
			'assets/FilterEngineZDisplay-Subset-MLGdfEdp.woff2': {
				fileName: 'assets/FilterEngineZDisplay-Subset-MLGdfEdp.woff2',
				originalFileNames: ['../brand/src/fonts/orbitron/FilterEngineZDisplay-Subset.woff2'],
				type: 'asset',
			},
			'assets/index-abc.js': { fileName: 'assets/index-abc.js', type: 'chunk' },
			'assets/Inter-Subset-DlVByD-t.woff2': {
				fileName: 'assets/Inter-Subset-DlVByD-t.woff2',
				originalFileNames: ['../brand/src/fonts/inter/Inter-Subset.woff2'],
				type: 'asset',
			},
			'assets/JetBrainsMono-Subset-Cw6iHCa_.woff2': {
				fileName: 'assets/JetBrainsMono-Subset-Cw6iHCa_.woff2',
				originalFileNames: ['../brand/src/fonts/jetbrains-mono/JetBrainsMono-Subset.woff2'],
				type: 'asset',
			},
		};

		it('runs on the built page only, after Vite has written its links', () => {
			const plugin = fontPreloadsPlugin();

			expect(plugin.apply).toBe('build');
			expect(plugin.transformIndexHtml.order).toBe('post');
		});

		it('preloads the two shared faces at their hashed URLs', () => {
			const html = fontPreloadsPlugin().transformIndexHtml.handler(PAGE, { bundle: BUNDLE, filename: 'index.html' });

			expect(readFontPreloads(html)).toEqual(['/assets/FilterEngineZDisplay-Subset-MLGdfEdp.woff2', '/assets/Inter-Subset-DlVByD-t.woff2']);
		});

		it('fails the build when a font is not in the bundle, or there is no bundle', () => {
			const plugin = fontPreloadsPlugin({ fonts: ['Missing-Subset.woff2']});

			expect(() => plugin.transformIndexHtml.handler(PAGE, { bundle: BUNDLE, filename: 'index.html' })).toThrow('no Missing-Subset.woff2');
			expect(() => fontPreloadsPlugin().transformIndexHtml.handler(PAGE, { filename: 'index.html' })).toThrow('no bundle');
		});
	});
});

describe('scripts/check-font-preloads.mjs and scripts/preload-fonts.mjs', () => {
	let scratch = '';

	afterEach(() => {
		rmSync(scratch, { force: true, recursive: true });
	});

	/**
	 * Write a fixture build: a page with the given preloads, and the two shared fonts plus JetBrains
	 * Mono under `assets/`.
	 *
	 * @param preloads - Tags to put in the page's head.
	 * @returns The page's path.
	 */
	function writeBuild(preloads: string): string {
		scratch = mkdtempSync(join(tmpdir(), 'check-font-preloads-'));
		mkdirSync(join(scratch, 'assets'));
		for (const name of ['FilterEngineZDisplay-Subset-MLGdfEdp', 'Inter-Subset-DlVByD-t', 'JetBrainsMono-Subset-Cw6iHCa_']) {
			writeFileSync(join(scratch, 'assets', `${name}.woff2`), '');
		}

		const page = join(scratch, 'index.html');

		writeFileSync(page, PAGE.replace('<meta charset="utf-8">', `<meta charset="utf-8">${preloads}`));

		return page;
	}

	/** A correct preload of a fixture font. */
	const tag = (name: string): string => `<link rel="preload" href="/assets/${name}.woff2" as="font" type="font/woff2" crossorigin>`;

	/** Both shared faces, preloaded correctly. */
	const BOTH = tag('FilterEngineZDisplay-Subset-MLGdfEdp') + tag('Inter-Subset-DlVByD-t');

	/**
	 * Run a script.
	 *
	 * @param script - Its path.
	 * @param args - Its arguments.
	 * @returns The exit status and output.
	 */
	function run(script: string, ...args: string[]): SpawnSyncReturns<string> {
		return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
	}

	it('passes a page that preloads exactly the two faces, from files in the build', () => {
		const result = run(CHECK_SCRIPT, writeBuild(BOTH));

		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain('preloads FilterEngineZDisplay-Subset.woff2, Inter-Subset.woff2');
	});

	it.each([
		['a missing face', tag('Inter-Subset-DlVByD-t'), 'not exactly'],
		['an extra face', BOTH + tag('JetBrainsMono-Subset-Cw6iHCa_'), 'not exactly'],
		['no preloads at all', '', 'not exactly'],
		['a preload without crossorigin', tag('FilterEngineZDisplay-Subset-MLGdfEdp') + tag('Inter-Subset-DlVByD-t').replace(' crossorigin', ''), 'crossorigin'],
		['a preload of a file not in the build', BOTH.replace('Inter-Subset-DlVByD-t', 'Inter-Subset-GONEGONE'), 'not a file under'],
		['a preload on another origin', BOTH.replace('/assets/Inter', 'https://cdn.example/Inter'), 'not a file under'],
	])('fails a page with %s', (_case, preloads, message) => {
		const result = run(CHECK_SCRIPT, writeBuild(preloads));

		expect(result.status).toBe(1);
		expect(result.stderr).toContain(message);
	});

	it('resolves page-relative URLs against --root, for a page written apart from its assets', () => {
		const page = writeBuild(BOTH.replaceAll('"/assets/', '"./assets/'));
		const elsewhere = join(scratch, 'prerendered', 'index.html');

		mkdirSync(dirname(elsewhere));
		writeFileSync(elsewhere, readFileSync(page, 'utf8'));

		expect(run(CHECK_SCRIPT, elsewhere, '--root', scratch).status).toBe(0);
		expect(run(CHECK_SCRIPT, elsewhere).status).toBe(1);
	});

	it.each([
		['no page', []],
		['two pages', ['a.html', 'b.html']],
		['--root with no directory', ['a.html', '--root']],
	])('fails on a command line with %s', (_case, args) => {
		const result = run(CHECK_SCRIPT, ...args);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain('usage: node check-font-preloads.mjs');
	});

	it('fails on a page or a root that does not exist', () => {
		expect(run(CHECK_SCRIPT, '/no/such/page.html').stderr).toContain('does not exist');
		expect(run(CHECK_SCRIPT, writeBuild(BOTH), '--root', '/no/such/dir').stderr).toContain('/no/such/dir does not exist');
	});

	it('writes the two faces into a built page once, and the result passes the check', () => {
		const page = writeBuild('');
		const written = run(WRITE_SCRIPT, page);

		expect(written.status, written.stderr).toBe(0);
		expect(readFontPreloads(readFileSync(page, 'utf8'))).toEqual([
			'/assets/FilterEngineZDisplay-Subset-MLGdfEdp.woff2',
			'/assets/Inter-Subset-DlVByD-t.woff2',
		]);
		expect(run(CHECK_SCRIPT, page).status).toBe(0);

		const again = run(WRITE_SCRIPT, page);

		expect(again.status).toBe(1);
		expect(again.stderr).toContain('already preloads a font');
	});

	it('refuses to write preloads for a build missing a font, or a page that does not exist', () => {
		const page = writeBuild('');

		rmSync(join(scratch, 'assets', 'Inter-Subset-DlVByD-t.woff2'));
		expect(run(WRITE_SCRIPT, page).stderr).toContain('holds 0 built copies of Inter-Subset.woff2');
		expect(existsSync(page)).toBe(true);
		expect(readFontPreloads(readFileSync(page, 'utf8'))).toEqual([]);
		expect(run(WRITE_SCRIPT, '/no/such/page.html').stderr).toContain('does not exist');
		expect(run(WRITE_SCRIPT).stderr).toContain('usage: node preload-fonts.mjs');
	});
});
