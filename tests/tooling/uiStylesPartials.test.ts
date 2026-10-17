/**
 * `@filter-enginez/ui-styles` is one sheet in partials: every app imports all of it, and a page that
 * imports only some keeps them in the sheet's order.
 *
 * @remarks
 * `packages/ui-styles/src/styles.css` imports the sheet's partials in cascade order and holds no rules
 * of its own (its header explains the split). The apps import that file; the landing site's pages
 * import the few partials they draw. Both stay correct only while a few things hold that no build
 * or type check notices when they stop:
 *
 * - **The sheet is its partials, each once.** A partial missing from `styles.css` drops its rules from
 *   every app; one listed twice repeats them; a rule written into `styles.css` itself sits outside
 *   every partial, where a page importing partials never gets it.
 * - **Every partial is exported,** or a page cannot import it.
 * - **`base.css` comes first** and is the only partial that imports anything (the brand tokens): every
 *   other partial's values are drawn from those tokens, and its `@layer base` must open before any
 *   later layer.
 * - **Every app gets the whole sheet.** Only the packages in {@link PARTIAL_CONSUMERS} may import
 *   partials; every other package whose stylesheets use `ui-styles` imports `styles.css`.
 * - **A page that imports partials keeps the sheet's order,** starts with `base.css`, and never mixes
 *   them with the whole sheet. Two rules of equal specificity are decided by which comes later, so a
 *   reordered import can change what a page shows with every class still having its rule. In order,
 *   every rule a page ships sits where it sits in the apps' cascade, and the page renders as the apps
 *   do.
 *
 * Stylesheet entries are derived, as in `touchInputZoom.test.ts`: every `.css` under a package's
 * `src/` that no other sheet of that package imports, so a new app or page is checked the day it
 * appears. The landing site's build checks the other half, that every class a page uses has its rule
 * in the CSS the page carries (`scripts/check-site-css.mjs`, pinned by `siteCss.test.ts`).
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { stripCssComments } from './support/cssLayers.js';
import { REPO_ROOT } from './support/repoFiles.js';
import { UI_STYLES_PACKAGE, UI_STYLES_SHEET, uiStylesExports, uiStylesPartials } from './support/uiStylesSheet.js';

/** The packages allowed to import `ui-styles` partials rather than the whole sheet. */
const PARTIAL_CONSUMERS: ReadonlySet<string> = new Set(['site']);

/** The packages whose stylesheets are building blocks for the others, not entries of their own. */
const LIBRARY_PACKAGES: ReadonlySet<string> = new Set(['brand', 'ui-styles']);

/** The whole sheet, as a stylesheet imports it. */
const WHOLE_SHEET = `${UI_STYLES_PACKAGE}/styles.css`;

/** The partial every page must import first. */
const BASE_PARTIAL = 'packages/ui-styles/src/base.css';

/** An `@import` specifier, quoted or in `url()`. */
const IMPORT = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/gu;

/**
 * Every `.css` file under a directory, recursively, skipping dependencies and build output.
 *
 * @param dir - Absolute directory.
 * @returns Absolute paths.
 */
function cssFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);

		if (entry === 'node_modules' || entry === 'dist') {
			return [];
		}

		if (statSync(path).isDirectory()) {
			return cssFiles(path);
		}

		return entry.endsWith('.css') ? [path] : [];
	});
}

/**
 * The `@import` specifiers of a sheet, in order, comments ignored.
 *
 * @param path - Absolute path of the sheet.
 * @returns The specifiers.
 */
function importsOf(path: string): string[] {
	return [...stripCssComments(readFileSync(path, 'utf8')).matchAll(IMPORT)].map(([, specifier]) => specifier ?? '');
}

/**
 * The package specifiers a sheet loads, in cascade order, with its own package's sheets followed.
 *
 * @param path - Absolute path of the sheet.
 * @param seen - Sheets already followed, against an import cycle.
 * @returns Every non-relative specifier, in the order the cascade meets it.
 */
function packageImports(path: string, seen: Set<string> = new Set()): string[] {
	seen.add(path);

	return importsOf(path).flatMap((specifier) => {
		if (!specifier.startsWith('.')) {
			return [specifier];
		}

		const target = resolve(dirname(path), specifier);

		return seen.has(target) ? [] : packageImports(target, seen);
	});
}

/** Each package with stylesheets of its own, and its entries: the sheets no sheet of it imports. */
const ENTRIES_BY_PACKAGE: ReadonlyMap<string, readonly string[]> = new Map(
	readdirSync(resolve(REPO_ROOT, 'packages'))
		.filter((name) => !LIBRARY_PACKAGES.has(name) && existsSync(resolve(REPO_ROOT, 'packages', name, 'src')))
		.map((name) => {
			const sheets = cssFiles(resolve(REPO_ROOT, 'packages', name, 'src'));
			const imported = new Set(
				sheets.flatMap((sheet) =>
					importsOf(sheet)
						.filter((specifier) => specifier.startsWith('.'))
						.map((specifier) => resolve(dirname(sheet), specifier)),
				),
			);

			return [name, sheets.filter((sheet) => !imported.has(sheet))] as const;
		})
		.filter(([, entries]) => entries.length > 0),
);

/** Every entry, with the `ui-styles` sheets it loads, in cascade order. */
const ENTRIES = [...ENTRIES_BY_PACKAGE].flatMap(([name, entries]) =>
	entries.map((entry) => ({
		name,
		path: relative(REPO_ROOT, entry),
		uiStyles: packageImports(entry).filter((specifier) => specifier.startsWith(`${UI_STYLES_PACKAGE}/`)),
	})),
);

describe('ui-styles is one sheet in partials', () => {
	const partials = uiStylesPartials();

	it('finds the partials, so the cases below are not vacuous', () => {
		expect(partials.length).toBeGreaterThanOrEqual(2);
		expect(partials[0]).toBe(BASE_PARTIAL);
	});

	it('holds no rules of its own: styles.css is only the imports of its partials', () => {
		const sheet = stripCssComments(readFileSync(resolve(REPO_ROOT, UI_STYLES_SHEET), 'utf8'));

		expect(sheet.replace(/^@import\s+'\.\/[\w-]+\.css';$/gmu, '').trim(), `${UI_STYLES_SHEET} must hold only @imports`).toBe('');
	});

	it('imports every sheet in its src/ once, except itself and the separate figures.css', () => {
		const sheets = cssFiles(resolve(REPO_ROOT, 'packages/ui-styles/src'))
			.map((path) => relative(REPO_ROOT, path))
			.filter((path) => path !== UI_STYLES_SHEET && path !== 'packages/ui-styles/src/figures.css')
			.sort();

		expect(new Set(partials).size, 'a partial is imported twice').toBe(partials.length);
		expect(partials.slice().sort()).toEqual(sheets);
	});

	it('exports every sheet, so a page can import any partial', () => {
		const sheets = cssFiles(resolve(REPO_ROOT, 'packages/ui-styles/src')).map((path) => relative(REPO_ROOT, path));

		expect([...uiStylesExports().values()].filter((target) => target.endsWith('.css')).sort()).toEqual(sheets.sort());
		for (const [subpath, target] of uiStylesExports()) {
			expect(`packages/ui-styles/src${subpath.slice(1)}`, `export ${subpath} is not named for its file`).toBe(target);
		}
	});

	it('imports the brand tokens in base.css, and nothing in any other partial', () => {
		for (const partial of partials) {
			const imports = importsOf(resolve(REPO_ROOT, partial));

			expect(imports, `${partial} imports`).toEqual(partial === BASE_PARTIAL ? ['@filter-enginez/brand/tokens.css'] : []);
		}
	});
});

describe('every stylesheet that uses ui-styles', () => {
	const bundleOrder = uiStylesPartials().map((partial) => `${UI_STYLES_PACKAGE}/${partial.slice('packages/ui-styles/src/'.length)}`);
	const users = ENTRIES.filter((entry) => entry.uiStyles.length > 0);

	it('finds the apps and the site’s pages, so the cases below are not vacuous', () => {
		// Six apps, the documentation site, and the landing site's four pages.
		expect(users.length).toBeGreaterThanOrEqual(11);
		expect(users.filter((entry) => PARTIAL_CONSUMERS.has(entry.name)).length).toBeGreaterThanOrEqual(4);
	});

	it.each(users.filter((entry) => !PARTIAL_CONSUMERS.has(entry.name)).map((entry) => [entry.path, entry]))(
		'%s imports the whole sheet',
		(_path, entry) => {
			expect(entry.uiStyles, `${entry.path} must import ${WHOLE_SHEET}: every app gets every rule`).toContain(WHOLE_SHEET);
		},
	);

	it.each(users.map((entry) => [entry.path, entry]))('%s imports partials in the sheet’s order, base first', (_path, entry) => {
		const partials = entry.uiStyles.filter((specifier) => bundleOrder.includes(specifier));
		const positions = partials.map((specifier) => bundleOrder.indexOf(specifier));

		expect(
			partials.length > 0 && entry.uiStyles.includes(WHOLE_SHEET),
			`${entry.path} imports both ${WHOLE_SHEET} and some of its partials`,
		).toBe(false);
		expect(partials.slice(0, 1), `${entry.path} must import base.css before any other partial`).toEqual(
			partials.length > 0 ? bundleOrder.slice(0, 1) : [],
		);
		expect(
			positions,
			`${entry.path} imports ${partials.join(', ')}: import them once each, in the order ${UI_STYLES_SHEET} lists them`,
		).toEqual([...new Set(positions)].sort((left, right) => left - right));
	});
});
