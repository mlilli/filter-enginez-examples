/**
 * Reading `@filter-enginez/ui-styles` as the one sheet the apps load, for guards that assert what is
 * in it.
 *
 * @remarks
 * `packages/ui-styles/src/styles.css` holds no rules of its own: it imports the sheet's partials
 * (`base.css`, `components.css`, …) in cascade order, and every app imports it. A guard that read
 * that file as text would find nothing but `@import`s; one that read a single partial would pin which
 * partial a rule happens to live in. So guards read the sheet through {@link readUiStyles}, which
 * puts each partial's text where its `@import` stands — the sheet exactly as a bundler assembles it,
 * comments included, in the order the cascade sees it.
 *
 * {@link uiStylesExportFile} answers the other question a guard asks: which file an
 * `@filter-enginez/ui-styles/…` import in an app's or a page's stylesheet loads, read from the
 * package's own `exports`, so a new partial is understood the day it is exported.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

import { REPO_ROOT } from './repoFiles.js';

/** The sheet every app imports, repo-relative. */
export const UI_STYLES_SHEET = 'packages/ui-styles/src/styles.css';

/** The package's name, the prefix of every import of one of its sheets. */
export const UI_STYLES_PACKAGE = '@filter-enginez/ui-styles';

/**
 * An `@import` of a file beside the importing sheet, alone on its line. Imports of other packages
 * (the brand tokens) are left as they are, as a bundler would resolve them separately.
 */
const RELATIVE_IMPORT = /^@import\s+['"](\.{1,2}\/[^'"]+)['"];$/gmu;

/**
 * A stylesheet with every relative `@import` replaced by the imported sheet, recursively.
 *
 * @param path - Absolute path of the sheet.
 * @returns Its text, with its partials inlined in place.
 */
export function readWithPartials(path: string): string {
	return readFileSync(path, 'utf8').replace(RELATIVE_IMPORT, (_statement, specifier: string) =>
		readWithPartials(resolve(dirname(path), specifier)),
	);
}

/**
 * The whole `ui-styles` sheet, as the apps load it.
 *
 * @returns `styles.css` with its partials inlined, in cascade order.
 */
export function readUiStyles(): string {
	return readWithPartials(resolve(REPO_ROOT, UI_STYLES_SHEET));
}

/**
 * The partials `styles.css` imports, in its order.
 *
 * @returns Repo-relative paths.
 */
export function uiStylesPartials(): string[] {
	const sheet = resolve(REPO_ROOT, UI_STYLES_SHEET);

	return [...readFileSync(sheet, 'utf8').matchAll(RELATIVE_IMPORT)].map(([, specifier]) =>
		relative(REPO_ROOT, resolve(dirname(sheet), specifier ?? '')),
	);
}

/**
 * The package's `exports`: each subpath and the file it maps to.
 *
 * @returns Subpath (`./styles.css`) → repo-relative path.
 */
export function uiStylesExports(): Map<string, string> {
	const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, 'packages/ui-styles/package.json'), 'utf8')) as {
		readonly exports: Readonly<Record<string, string>>;
	};

	return new Map(
		Object.entries(manifest.exports).map(([subpath, target]) => [subpath, relative(REPO_ROOT, resolve(REPO_ROOT, 'packages/ui-styles', target))]),
	);
}

/**
 * The file an import of one of the package's sheets loads.
 *
 * @param specifier - An `@import` specifier, such as `@filter-enginez/ui-styles/base.css`.
 * @returns The absolute path, or `undefined` when the specifier names no export of the package.
 */
export function uiStylesExportFile(specifier: string): string | undefined {
	if (!specifier.startsWith(`${UI_STYLES_PACKAGE}/`)) {
		return undefined;
	}

	const target = uiStylesExports().get(`.${specifier.slice(UI_STYLES_PACKAGE.length)}`);

	return target === undefined ? undefined : resolve(REPO_ROOT, target);
}
