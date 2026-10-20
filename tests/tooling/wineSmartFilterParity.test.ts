/**
 * Every wine panel applies, leaves and clears a smart-filter preset through the same shared helpers.
 *
 * @remarks
 * ### The question this answers, permanently
 *
 * "Does applying a preset on top of manual filters do the same thing in all six apps?" It did not: the
 * React preset row once called `setExpression` directly, so a preset applied over a manual filter left
 * that filter in place (dormant behind the expression, still in `?f=`, back the moment the preset was
 * cleared) while the other panels replaced it, and its writes never marked the action busy. Each app
 * was internally consistent and every per-app test was green.
 *
 * ### Why helper calls rather than behavior
 *
 * The behavior is pinned per app by jsdom suites (`WineFilterPanel.test.tsx`, SvelteKit's and Vue's
 * `WineFilterPanel.presets.test.ts`, Angular's `wine-smart-filters.component.spec.ts`, vanilla's
 * `wine/view.test.ts`). What none of them can see is a SEVENTH copy of the logic drifting: a new
 * vertical, or a rewrite, that open-codes the writes again. The writes live in
 * `examples-shared/src/wine/wine-domain/commit.ts`, so the invariant every panel must hold is
 * syntactic and checkable across five frameworks at once:
 *
 *   1. **Every preset row writes through `commitSmartFilterSelection`** and makes no expression write
 *      of its own.
 *   2. **Every wine route's results header writes through `clearAllWineFilters` and
 *      `removeWineFilterChip`**, so "Clear all" and the smart-filter chip's × do the same in each app.
 *   3. **No wine route source calls `setExpression`, `commitExpression` or `clearRules` directly.**
 *      Leaving expression mode is `exitExpressionMode`, which also drops the leaves a restored preset
 *      registers as flat rules; a direct `setExpression(null)` would let them start filtering.
 *   4. **Every facet section that writes a rule drops an active preset first** (`leaveExpressionMode`).
 *
 * Comments are stripped before matching, so a docblock that names a forbidden call does not fail the
 * guard and one that names a required call does not satisfy it.
 *
 * ### Guards against passing for the wrong reason
 *
 * The preset rows are DISCOVERED (by the "Match any (OR)" label each one renders), not listed, and the
 * discovered set is held to the five panel implementations; the six wine-serving app directories are
 * cross-checked against the filesystem. Every set this suite iterates is asserted non-empty first.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT, walkRepoFiles } from './support/repoFiles.js';

/** Source extensions a panel can be written in. */
const SOURCE_EXTENSIONS = ['.svelte', '.ts', '.tsx', '.vue'] as const;

/** Each wine-serving app's own wine directory. */
const APP_WINE_DIRECTORIES: Readonly<Record<string, string>> = {
	'examples-angular': 'packages/examples-angular/src/app/wine',
	'examples-react-plain': 'packages/examples-react-plain/src/wine',
	'examples-react-rtk': 'packages/examples-react-rtk/src/wine',
	'examples-sveltekit': 'packages/examples-sveltekit/src/lib/wine',
	'examples-vanilla': 'packages/examples-vanilla/src/wine',
	'examples-vue': 'packages/examples-vue/src/wine',
};

/**
 * The shared React panel, which both React apps render. NOT the whole of `examples-shared/src/wine`:
 * `wine-domain/commit.ts` is where the forbidden calls legitimately live.
 */
const SHARED_REACT_PANEL = 'packages/examples-shared/src/wine/filters';

/** The facet-section sources of each panel implementation. */
const SECTION_DIRECTORIES: Readonly<Record<string, string>> = {
	angular: 'packages/examples-angular/src/app/wine/sections',
	react: SHARED_REACT_PANEL,
	sveltekit: 'packages/examples-sveltekit/src/lib/wine/sections',
	vanilla: 'packages/examples-vanilla/src/wine',
	vue: 'packages/examples-vue/src/wine/sections',
};

/** A call that writes one facet's rule, in any of the five panels. */
const FACET_WRITE = /\b(?:clearRule|commitFacet|commitFilterMutation|commitOriginSelection|commitRule|commitSelection)\(/u;

/** The label every preset row renders, as markup text or as a string literal. */
const PRESET_ROW_LABEL = /(?:>\s*Match any \(OR\)\s*<|'Match any \(OR\)')/u;

/**
 * Remove comments, so only code is matched.
 *
 * @remarks
 * Block comments (JSDoc included), HTML comments in `.svelte` / `.vue` templates, and line comments
 * that start a line or follow whitespace (so a `https://` inside a string survives).
 *
 * @param source - The file's text.
 * @returns The text without comments.
 */
function stripComments(source: string): string {
	return source
		.replaceAll(/\/\*[\s\S]*?\*\//gu, '')
		.replaceAll(/<!--[\s\S]*?-->/gu, '')
		.replaceAll(/(^|\s)\/\/[^\n]*/gu, '$1');
}

/**
 * Whether a repo-relative path is a non-test panel source file.
 *
 * @param path - The repo-relative path.
 * @returns `true` for a `.svelte` / `.ts` / `.tsx` / `.vue` file that is not a test or spec.
 */
function isPanelSource(path: string): boolean {
	return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))
		&& !path.includes('.test.')
		&& !path.includes('.spec.');
}

/**
 * Every non-test source file under a directory, comments stripped.
 *
 * @param directory - Repo-relative directory.
 * @returns Path → code, one entry per file.
 */
function readSources(directory: string): ReadonlyMap<string, string> {
	const sources = new Map<string, string>();
	const walk = (relativeDirectory: string): void => {
		for (const name of readdirSync(resolve(REPO_ROOT, relativeDirectory))) {
			const path = join(relativeDirectory, name);

			if (statSync(resolve(REPO_ROOT, path)).isDirectory()) {
				walk(path);
			} else if (isPanelSource(path)) {
				sources.set(path, stripComments(readFileSync(resolve(REPO_ROOT, path), 'utf8')));
			}
		}
	};

	walk(directory);

	return sources;
}

/**
 * Every preset row in the repo, found by the label it renders.
 *
 * @returns Path → code for each non-test source that renders "Match any (OR)".
 */
function discoverPresetRows(): ReadonlyMap<string, string> {
	const rows = new Map<string, string>();

	for (const path of walkRepoFiles()) {
		if (!path.startsWith('packages/') || !path.includes('/src/') || !isPanelSource(path)) {
			continue;
		}
		const code = stripComments(readFileSync(resolve(REPO_ROOT, path), 'utf8'));

		if (PRESET_ROW_LABEL.test(code)) {
			rows.set(path, code);
		}
	}

	return rows;
}

/**
 * The direct engine writes a wine route source must not make, found in its code.
 *
 * @param code - Comment-stripped source.
 * @returns The forbidden calls present, by name.
 */
function forbiddenWrites(code: string): readonly string[] {
	const patterns: Readonly<Record<string, RegExp>> = {
		'.clearRules(': /\.clearRules\(/u,
		'.setExpression(': /\.setExpression\(/u,
		'commitExpression(': /\bcommitExpression\(/u,
		"forwardToEngine('clearRules'": /forwardToEngine\(\s*'clearRules'/u,
		"forwardToEngine('setExpression'": /forwardToEngine\(\s*'setExpression'/u,
	};

	return Object.entries(patterns)
		.filter(([, pattern]) => pattern.test(code))
		.map(([name]) => name);
}

describe('wine smart-filter parity across every panel implementation', () => {
	it('finds exactly one preset row per panel implementation', () => {
		const owners = [...discoverPresetRows().keys()].map((path) => path.split('/')[1] ?? path).sort((left, right) => left.localeCompare(right));

		// The two React apps share one row, in `examples-shared`.
		expect(owners).toEqual([
			'examples-angular',
			'examples-shared',
			'examples-sveltekit',
			'examples-vanilla',
			'examples-vue',
		]);
	});

	it.each([...discoverPresetRows()])('%s writes through commitSmartFilterSelection', (path, code) => {
		expect(code, `${path} must apply presets with commitSmartFilterSelection`).toMatch(/\bcommitSmartFilterSelection\(/u);
		expect(code, `${path} clears the facets itself; commitSmartFilterSelection does that`).not.toMatch(/\bclearAllFacetRules\(/u);
		expect(forbiddenWrites(code), `${path} writes the expression directly; use the wine-domain helpers`).toEqual([]);
	});

	it('lists every package that has a wine directory', () => {
		// The roster guard: a seventh app growing a wine route must join APP_WINE_DIRECTORIES, or every
		// assertion below would quietly cover one app fewer than exist.
		const isDirectory = (path: string): boolean =>
			statSync(resolve(REPO_ROOT, path), { throwIfNoEntry: false })?.isDirectory() === true;
		const withWine = readdirSync(resolve(REPO_ROOT, 'packages'))
			.filter((pkg) => ['src/app/wine', 'src/lib/wine', 'src/wine'].some((directory) => isDirectory(`packages/${pkg}/${directory}`)))
			.sort((left, right) => left.localeCompare(right));

		// `examples-shared` holds the shared React panel and the helpers, not an app of its own.
		expect(withWine).toEqual([...Object.keys(APP_WINE_DIRECTORIES), 'examples-shared'].sort((left, right) => left.localeCompare(right)));
		expect(Object.values(APP_WINE_DIRECTORIES).every(isDirectory)).toBe(true);
	});

	it.each(Object.entries(APP_WINE_DIRECTORIES))(
		'%s clears and removes header chips through the shared helpers, and writes no expression directly',
		(pkg, directory) => {
			const sources = readSources(directory);
			const code = [...sources.values()].join('\n');

			expect(sources.size, `${directory} has no sources`).toBeGreaterThan(0);
			expect(code, `${pkg}'s "Clear all" must call clearAllWineFilters`).toMatch(/\bclearAllWineFilters\(/u);
			expect(code, `${pkg}'s header chip × must call removeWineFilterChip`).toMatch(/\bremoveWineFilterChip\(/u);

			for (const [path, fileCode] of sources) {
				expect(forbiddenWrites(fileCode), `${path} writes the engine directly; use the wine-domain helpers`).toEqual([]);
			}
		},
	);

	it('keeps the shared React panel off direct expression writes too', () => {
		const sources = readSources(SHARED_REACT_PANEL);

		expect(sources.size).toBeGreaterThan(0);
		for (const [path, code] of sources) {
			expect(forbiddenWrites(code), `${path} writes the engine directly; use the wine-domain helpers`).toEqual([]);
		}
	});

	it.each(Object.entries(SECTION_DIRECTORIES))('every %s facet section drops an active preset before it writes', (_panel, directory) => {
		const writers = [...readSources(directory)].filter(([, code]) => FACET_WRITE.test(code));

		expect(writers.length, `${directory} has no facet section that writes a rule`).toBeGreaterThan(0);
		for (const [path, code] of writers) {
			expect(code, `${path} writes a facet rule without calling leaveExpressionMode first`).toMatch(/\bleaveExpressionMode\(\)/u);
		}
	});
});
