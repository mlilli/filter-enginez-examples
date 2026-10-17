/**
 * The landing site's build checks every page's CSS — every class the page uses has its rule, and the
 * page carries no more than its budget — and the check measures what it claims to.
 *
 * @remarks
 * ### What the check protects
 *
 * Each page of the landing site carries its stylesheet inline, made of only the
 * `@filter-enginez/ui-styles` partials it draws (`uiStylesPartials.test.ts` holds those imports to the
 * sheet's order). A page that starts drawing a component from a partial it does not import builds,
 * passes every test and renders that component unstyled; a page that imports the whole sheet again
 * renders correctly and quietly triples its size. `scripts/check-site-css.mjs` fails the build for
 * either.
 *
 * ### What this file pins
 *
 * - **That the site's build runs it,** after `vite build` and before the corpus strip, which
 *   `buildsStripLocalCorpus.test.ts` requires to be the build's last step.
 * - **What it compares against, derived:** its `--reference` sheets are exactly the `ui-styles`
 *   sheets that are not partials of another (the whole sheet and the figures), so a class the site
 *   could draw from either is known to the check; and its `--budget`s name exactly the site's pages,
 *   so a new page fails here until it has one.
 * - **What the script reads,** on fixture builds: classes in a page's HTML; class-like words in every
 *   chunk its scripts load, statically or on demand; the classes the reference sheets name, through
 *   their `@import`s; and the classes another page's CSS names. Plain words in scripts, and classes no
 *   stylesheet has a rule for, are left alone.
 * - **That it fails loudly** on a missing rule, a page over budget, and on a build it cannot judge: no
 *   pages, a page without inline CSS or with a stylesheet link, a missing script, a page without a
 *   budget or a budget without a page, reference sheets that do not resolve or name no class, and a
 *   malformed command line. A check that read nothing would otherwise read exactly like one that passed.
 *
 * @packageDocumentation
 */

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { REPO_ROOT } from './support/repoFiles.js';
import { UI_STYLES_PACKAGE, uiStylesExports, uiStylesPartials } from './support/uiStylesSheet.js';

const CHECK_SCRIPT = resolve(REPO_ROOT, 'scripts/check-site-css.mjs');

/** The command's prefix in the site's build, from its package directory, against its `dist`. */
const CHECK_PREFIX = 'node ../../scripts/check-site-css.mjs dist ';

/** The step `buildsStripLocalCorpus.test.ts` requires to come last. */
const STRIP_PREFIX = 'node ../../scripts/strip-local-corpus.mjs';

/** The site's build script, split into its `&&` steps. */
const SITE_BUILD_STEPS = (
	(JSON.parse(readFileSync(resolve(REPO_ROOT, 'packages/site/package.json'), 'utf8')) as { readonly scripts: Readonly<Record<string, string>> })
		.scripts['build'] ?? ''
)
	.split('&&')
	.map((step) => step.trim());

/**
 * The values a command passes for one flag, in order.
 *
 * @param step - The command.
 * @param flag - The flag, such as `--budget`.
 * @returns Each value that follows the flag.
 */
function flagValues(step: string, flag: string): string[] {
	const words = step.split(/\s+/u);

	return words.flatMap((word, index) => (word === flag ? [words[index + 1] ?? ''] : []));
}

describe('the landing site’s build checks its pages’ CSS', () => {
	const checkIndex = SITE_BUILD_STEPS.findIndex((step) => step.startsWith(CHECK_PREFIX));
	const check = SITE_BUILD_STEPS[checkIndex] ?? '';

	it('runs the check on dist after vite build, before the corpus strip', () => {
		expect(checkIndex, `the site's build must run \`${CHECK_PREFIX}…\``).toBeGreaterThan(0);
		expect(SITE_BUILD_STEPS[0]).toBe('vite build');
		expect(SITE_BUILD_STEPS.at(-1)?.startsWith(STRIP_PREFIX)).toBe(true);
		expect(checkIndex).toBeLessThan(SITE_BUILD_STEPS.length - 1);
	});

	it('references every ui-styles sheet that is not a partial of another', () => {
		const partials = new Set(uiStylesPartials());
		const sheets = [...uiStylesExports()]
			.filter(([, target]) => target.endsWith('.css') && !partials.has(target))
			.map(([subpath]) => `${UI_STYLES_PACKAGE}${subpath.slice(1)}`)
			.sort();

		expect(sheets).toEqual(expect.arrayContaining([`${UI_STYLES_PACKAGE}/styles.css`, `${UI_STYLES_PACKAGE}/figures.css`]));
		expect(flagValues(check, '--reference').sort()).toEqual(sheets);
	});

	it('gives every page of the site a budget, and no budget to a page it does not have', () => {
		const pages = readdirSync(resolve(REPO_ROOT, 'packages/site')).filter((entry) => entry.endsWith('.html')).sort();
		const budgeted = flagValues(check, '--budget').map((budget) => budget.split('=')[0] ?? '');

		expect(pages.length).toBeGreaterThanOrEqual(4);
		expect(budgeted.sort()).toEqual(pages);
	});
});

describe('check-site-css.mjs', () => {
	let scratch = '';

	afterEach(() => {
		if (scratch !== '') {
			rmSync(scratch, { force: true, recursive: true });
			scratch = '';
		}
	});

	/**
	 * Write a fixture: the reference sheets beside a `dist/` of pages and scripts.
	 *
	 * @param files - Path under the fixture → contents. Pages and scripts go under `dist/`.
	 * @returns The fixture's directory.
	 */
	function writeFixture(files: Readonly<Record<string, string>>): string {
		scratch = mkdtempSync(join(tmpdir(), 'site-css-'));
		for (const [path, contents] of Object.entries(files)) {
			mkdirSync(dirname(join(scratch, path)), { recursive: true });
			writeFileSync(join(scratch, path), contents);
		}

		return scratch;
	}

	/**
	 * Run the script from a fixture's directory, as the site's build runs it from the package's.
	 *
	 * @param cwd - The fixture.
	 * @param args - Its arguments.
	 * @returns The exit status and output.
	 */
	function runCheck(cwd: string, ...args: string[]): SpawnSyncReturns<string> {
		return spawnSync(process.execPath, [CHECK_SCRIPT, ...args], { cwd, encoding: 'utf8' });
	}

	/**
	 * A page: its inline CSS, its body and its scripts.
	 *
	 * @param css - The `<style>` contents.
	 * @param body - The `<body>` contents.
	 * @param scripts - Module script URLs.
	 * @returns The HTML.
	 */
	function page(css: string, body: string, scripts: readonly string[] = []): string {
		const tags = scripts.map((src) => `<script type="module" crossorigin src="${src}"></script>`).join('');

		return `<!doctype html><html><head>${tags}<style>${css}</style></head><body>${body}</body></html>`;
	}

	/** The reference sheets: one importing another, as `ui-styles/styles.css` imports its partials. */
	const REFERENCE = {
		'ref/part.css': '/* .fe-commented { } */\n.fe-card { color: red; }\n.fe-card__title, .fe-unused:hover { margin: 0; }\n.shared { color: blue; }\n',
		'ref/sheet.css': "@import './part.css';\n.fe-sheet-only { color: green; }\n",
	};

	/** The arguments of a passing run over {@link passingFixture}. */
	const ARGS = ['dist', '--reference', './ref/sheet.css', '--budget', 'index.html=1', '--budget', 'other.html=1'];

	/**
	 * A build that passes: the home page uses `.fe-card` in its HTML and `.fe-card__title` from a chunk
	 * its script loads on demand, plus words that must not count: a plain word the reference styles
	 * (`shared`), a class no sheet styles (`fe-hook`), and a comment's class (`fe-commented`).
	 *
	 * @param overrides - Files to add or replace.
	 * @returns The fixture's directory.
	 */
	function passingFixture(overrides: Readonly<Record<string, string>> = {}): string {
		return writeFixture({
			...REFERENCE,
			'dist/assets/index.js': 'const load=()=>import("./lazy.js");export{load};',
			'dist/assets/lazy.js': 'export const make=(e)=>{e.className="fe-card__title fe-hook";e.textContent="shared fe-commented";};',
			'dist/index.html': page(
				'.fe-card{color:red}.fe-card__title{margin:0}.fe-mark{background:url("data:image/svg+xml,%3csvg%20filter=\'drop-shadow(0 0 1px red)\'%3e%3c/svg%3e")}.fe-after-url{margin:0}.fe-after-url:before{content:""}',
				'<div class="fe-card fe-hook"><span class="fe-mark fe-after-url"></span></div>',
				['/assets/index.js'],
			),
			'dist/other.html': page('.fe-other{margin:0}', '<p class="fe-other">x</p>'),
			...overrides,
		});
	}

	it('passes when every class a page uses has its rule, and reports what it read', () => {
		const run = runCheck(passingFixture(), ...ARGS);

		expect(run.status, run.stderr).toBe(0);
		expect(run.stdout).toContain('every class has its rule');
		// .fe-card, .fe-card__title (from the lazy chunk), .fe-mark and .fe-after-url, read past the
		// data URL's own `)` and the quotes after it; not `shared`, `fe-hook` or `fe-commented`.
		expect(run.stdout).toContain('index.html: 0.2 kB of CSS (budget 1 kB), 4 styled classes used');
		expect(run.stdout).toContain('other.html: 0.0 kB of CSS (budget 1 kB), 1 styled classes used');
	});

	it('fails on a class in the HTML whose rule only a reference sheet’s import has', () => {
		const html = page('.fe-card{color:red}', '<div class="fe-card fe-unused"></div>');
		const run = runCheck(passingFixture({ 'dist/index.html': html }), ...ARGS);

		expect(run.status).toBe(1);
		expect(run.stderr).toContain('index.html uses .fe-unused (in the HTML), and its CSS has no rule for it.');
		expect(run.stderr).toContain('import that partial, in the order ui-styles/src/styles.css lists it');
	});

	it('fails on a class only a chunk loaded on demand creates', () => {
		const run = runCheck(passingFixture({ 'dist/assets/lazy.js': 'export const make=(e)=>{e.className="fe-sheet-only";};' }), ...ARGS);

		expect(run.status).toBe(1);
		expect(run.stderr).toMatch(/index\.html uses \.fe-sheet-only \(in assets[/\\]lazy\.js\), and its CSS has no rule for it\./u);
	});

	it('fails on a class another page’s CSS styles', () => {
		const run = runCheck(passingFixture({ 'dist/assets/index.js': 'document.body.className="fe-other";' }), ...ARGS);

		expect(run.status).toBe(1);
		expect(run.stderr).toMatch(/index\.html uses \.fe-other \(in assets[/\\]index\.js\)/u);
	});

	it('fails a page over its budget', () => {
		const run = runCheck(passingFixture(), 'dist', '--reference', './ref/sheet.css', '--budget', 'index.html=0.1', '--budget', 'other.html=1');

		expect(run.status).toBe(1);
		expect(run.stderr).toContain('index.html carries 0.2 kB of CSS, over its 0.1 kB budget.');
		expect(run.stderr).toContain('such as the whole ui-styles sheet');
	});

	it('fails a page with no budget, and a budget for a page the build does not have', () => {
		const run = runCheck(passingFixture(), 'dist', '--reference', './ref/sheet.css', '--budget', 'index.html=1', '--budget', 'gone.html=1');

		expect(run.status).toBe(1);
		expect(run.stderr).toContain('other.html has no budget: add --budget other.html=<kB>');
		expect(run.stderr).toContain('--budget names gone.html, which is not in the build.');
	});

	it('fails a page that links a stylesheet, whose CSS it would not read', () => {
		const html = '<html><head><link rel="stylesheet" crossorigin href="/assets/x.css"><style>.a{}</style></head></html>';
		const run = runCheck(passingFixture({ 'dist/other.html': html }), ...ARGS);

		expect(run.status).toBe(1);
		expect(run.stderr).toContain('other.html links a stylesheet');
	});

	it('fails a page with no inline stylesheet', () => {
		const run = runCheck(passingFixture({ 'dist/other.html': '<html><body class="fe-card"></body></html>' }), ...ARGS);

		expect(run.status).toBe(1);
		expect(run.stderr).toContain('other.html has no inline stylesheet');
	});

	it('fails a page whose module script is not in the build', () => {
		const html = page('.fe-card{}', '', ['/assets/gone.js']);
		const run = runCheck(passingFixture({ 'dist/other.html': html }), ...ARGS);

		expect(run.status).toBe(1);
		expect(run.stderr).toMatch(/other\.html loads assets[/\\]gone\.js, which is not in the build output\./u);
	});

	it('fails a build with no pages, or no build at all', () => {
		const fixture = writeFixture({ ...REFERENCE, 'dist/assets/index.js': '' });

		expect(runCheck(fixture, ...ARGS).stderr).toContain('has no pages.');
		expect(runCheck(fixture, 'missing', '--reference', './ref/sheet.css', '--budget', 'index.html=1').stderr).toContain('does not exist');
	});

	it('fails on reference sheets that do not resolve, or name no class', () => {
		const fixture = passingFixture({ 'ref/empty.css': 'body { margin: 0; }\n' });
		const unresolved = runCheck(fixture, 'dist', '--reference', '@filter-enginez/nowhere/styles.css', '--budget', 'index.html=1');
		const empty = runCheck(fixture, 'dist', '--reference', './ref/empty.css', '--budget', 'index.html=1', '--budget', 'other.html=1');

		expect(unresolved.status).toBe(1);
		expect(unresolved.stderr).toContain('--reference @filter-enginez/nowhere/styles.css does not resolve');
		expect(empty.status).toBe(1);
		expect(empty.stderr).toContain('have no class selectors');
	});

	it.each([
		['no reference', ['dist', '--budget', 'index.html=1']],
		['no budget', ['dist', '--reference', './ref/sheet.css']],
		['no build directory', ['--reference', './ref/sheet.css', '--budget', 'index.html=1']],
		['a budget that is not a number', ['dist', '--reference', './ref/sheet.css', '--budget', 'index.html=lots']],
	])('fails on a malformed command line: %s', (_case, args) => {
		const run = runCheck(passingFixture(), ...args);

		expect(run.status).toBe(1);
		expect(run.stderr).toContain('usage: node check-site-css.mjs');
	});

	it('reads the fixture it was given, so the cases above are not vacuous', () => {
		const fixture = passingFixture();

		expect(readdirSync(join(fixture, 'dist')).sort()).toEqual(['assets', 'index.html', 'other.html']);
		expect(relative(REPO_ROOT, CHECK_SCRIPT)).toBe('scripts/check-site-css.mjs');
	});
});
