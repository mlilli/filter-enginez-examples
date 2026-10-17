/**
 * The algorithm figures' stylesheet loads with the pages that draw figures, never with an app.
 *
 * @remarks
 * `@filter-enginez/ui-styles/figures.css` holds the `fe-fig-*` animation rules (about 18 kB
 * minified). In the documentation — the docs site and both React apps' `/docs` routes — only two pages
 * draw figures: a rule page and an algorithm page. Each imports the sheet itself, so the bundler puts
 * it beside that page's chunk and links it when the page loads, after the app's own sheet.
 *
 * Imported from an app's global stylesheet instead, it would be back on every first screen of every
 * one of those apps, and nothing would notice: the pages look identical either way. So this pins both
 * halves — the two figure pages import it, and no app stylesheet does. (The landing site's
 * how-it-works page is the other consumer; it draws figures on its first screen and imports the sheet
 * there, which is `siteCss.test.ts`'s business.)
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './support/repoFiles.js';

/** The sheet's import specifier. */
const FIGURES_SHEET = '@filter-enginez/ui-styles/figures.css';

/** The documentation pages that draw figures, which import the sheet themselves. */
const FIGURE_PAGES = ['packages/examples-shared/src/docs/AlgorithmDocPage.tsx', 'packages/examples-shared/src/docs/RuleDocPage.tsx'];

/** The apps that serve the documentation. */
const DOCS_APPS = ['examples-docs', 'examples-react-plain', 'examples-react-rtk'];

/**
 * Every stylesheet under a directory.
 *
 * @param directory - Absolute path.
 * @returns Absolute paths of its `.css` files.
 */
function cssFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);

		if (entry.isDirectory()) {
			return cssFiles(path);
		}

		return entry.name.endsWith('.css') ? [path] : [];
	});
}

describe('the figures stylesheet', () => {
	it.each(FIGURE_PAGES)('is imported by %s, the page that draws them', (page) => {
		expect(readFileSync(resolve(REPO_ROOT, page), 'utf8')).toContain(`import '${FIGURES_SHEET}';`);
	});

	it('is imported by no app stylesheet of the apps that serve the docs', () => {
		const sheets = DOCS_APPS.flatMap((app) => cssFiles(resolve(REPO_ROOT, 'packages', app, 'src')));

		expect(sheets.length, 'found no app stylesheets to check').toBeGreaterThanOrEqual(DOCS_APPS.length);

		const offenders = sheets
			.filter((path) => readFileSync(path, 'utf8').replaceAll(/\/\*[\s\S]*?\*\//gu, '').includes(FIGURES_SHEET))
			.map((path) => relative(REPO_ROOT, path));

		expect(offenders, `import ${FIGURES_SHEET} from the figure pages, not an app's global sheet`).toEqual([]);
	});

	it('is imported by no other source file in those apps or in examples-shared', () => {
		const roots = [...DOCS_APPS.map((app) => `packages/${app}/src`), 'packages/examples-shared/src'];
		const sources = roots.flatMap((root) => {
			const walk = (directory: string): string[] =>
				readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
					const path = join(directory, entry.name);

					return entry.isDirectory() ? walk(path) : /\.(?:ts|tsx)$/u.test(entry.name) && !/\.test\./u.test(entry.name) ? [path] : [];
				});

			return existsSync(resolve(REPO_ROOT, root)) ? walk(resolve(REPO_ROOT, root)) : [];
		});
		const importers = sources
			.filter((path) => readFileSync(path, 'utf8').includes(`import '${FIGURES_SHEET}';`))
			.map((path) => relative(REPO_ROOT, path))
			.sort();

		expect(importers).toEqual([...FIGURE_PAGES].sort());
	});
});
