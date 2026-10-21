/**
 * Every app makes the same filter-panel decisions through the same shared helpers.
 *
 * @remarks
 * ### The question this answers, permanently
 *
 * "Does this control behave the same in all six apps?" Each app's own suites answer it for that app
 * only, and every one of them stayed green while the apps drifted apart: two apps cleared all filters
 * by looping `removeRule` over a hand-typed id list while four called `clearRules`, one app's search
 * committed on every pause and the others only on blur, one slider snapped typed values to its step
 * and another did not, one checkbox could disable itself while checked. Each decision now lives in
 * one shared helper, so the invariant every app must hold is syntactic and checkable across five
 * frameworks at once:
 *
 *   1. **Clear all is `clearAllFilters` / `clearAllWineFilters`**: one `clearRules`, after the busy
 *      mark. No app calls the engine's `clearRules` itself or keeps a facet-id list to loop over. The
 *      Redux app's forwarded `clearRules` intent is allowed only as the helper's seam.
 *   2. **Every search field binds `createTypeaheadController`** (the React apps through
 *      `useTypeaheadSearch`), so typing, flushing and de-duplication are timed the same everywhere.
 *   3. **Wine's fuzzy and range rules come from `wineSearchRule` and `wineRangeRule`**, so the Fuse
 *      settings and the open price maximum are the same in every app.
 *   4. **Checkboxes disable through `isToggleDisabled`**, which never disables a checked box.
 *   5. **Every hand-rolled slider resolves typed bounds and track presses with `resolveTypedBound` and
 *      `nearestThumb`.**
 *   6. **The result grids take their window from `RESULT_GRID_WINDOW`** rather than a local constant.
 *   7. **The panels' copy is read from the shared tables**, never restated: a placeholder, an
 *      accessible name or an empty-state sentence written out again in one app is how they drifted.
 *
 * Comments are stripped before matching, so a docblock that names a call neither satisfies nor fails
 * an assertion.
 *
 * ### Guards against passing for the wrong reason
 *
 * The app roster is cross-checked against `packages/`, every source set is asserted non-empty, and
 * every "must call" is asserted per implementation, so an app that lost its panel fails rather than
 * passing an empty scan.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BOOKS_ISBN_INVALID_MESSAGE, BOOKS_SEARCH_COPY, BOOKS_SLIDER_COPY } from '../../packages/examples-shared/src/books/books-domain/panelCopy.js';
import { BOOT_FAILURE_COPY, SERVER_ROUTE_SCREEN_COPY } from '../../packages/examples-shared/src/boot-caption/index.js';
import { REAL_ESTATE_DESCRIPTION_SEARCH } from '../../packages/examples-shared/src/real-estate/real-estate-domain/panelCopy.js';
import { RESULT_COPY } from '../../packages/examples-shared/src/verticals/resultCopy.js';
import { WINE_SEARCHES, WINE_SLIDER_COPY } from '../../packages/examples-shared/src/wine/wine-domain/panelCopy.js';
import { REPO_ROOT } from './support/repoFiles.js';

/** Source extensions a panel can be written in. */
const SOURCE_EXTENSIONS = ['.html', '.svelte', '.ts', '.tsx', '.vue'] as const;

/** Each app's source root. */
const APP_SOURCE_ROOTS: Readonly<Record<string, string>> = {
	'examples-angular': 'packages/examples-angular/src',
	'examples-react-plain': 'packages/examples-react-plain/src',
	'examples-react-rtk': 'packages/examples-react-rtk/src',
	'examples-sveltekit': 'packages/examples-sveltekit/src',
	'examples-vanilla': 'packages/examples-vanilla/src',
	'examples-vue': 'packages/examples-vue/src',
};

/**
 * The React panels, sections and grids both React apps render. The shared DOMAIN modules under them
 * (`*-domain`, `selection`, `search`, `filter-bundle`) are where the decisions legitimately live, so
 * only the React layer is scanned.
 */
const SHARED_REACT_PANEL_ROOTS: readonly string[] = [
	'packages/examples-shared/src/books',
	'packages/examples-shared/src/real-estate',
	'packages/examples-shared/src/wine',
];

/**
 * Whether a shared source under those roots is part of the React panel layer: a component, or a hook
 * beside the sections (`filters/`). The `*-domain` decision modules, the engine boot and the preset
 * definitions are framework-neutral, and the decisions legitimately live there.
 *
 * @param path - The repo-relative path.
 * @returns `true` for the React panel layer.
 */
function isSharedReactPanel(path: string): boolean {
	return !/-domain\//u.test(path) && (path.endsWith('.tsx') || path.includes('/filters/'));
}

/** The four hand-rolled slider implementations (React's runs on Radix through `react-ui`). */
const HAND_ROLLED_SLIDERS: readonly string[] = [
	'packages/examples-angular/src/app/controls/range-slider.component.ts',
	'packages/examples-sveltekit/src/lib/controls/RangeSlider.svelte',
	'packages/examples-vanilla/src/controls/rangeSlider.ts',
	'packages/examples-vue/src/controls/RangeSlider.vue',
];

/** The search-timing bindings, one per framework. */
const SEARCH_BINDINGS: Readonly<Record<string, string>> = {
	angular: 'packages/examples-angular/src/app/controls/search-input.component.ts',
	react: 'packages/examples-shared/src/search/useTypeaheadSearch.ts',
	sveltekit: 'packages/examples-sveltekit/src/lib/controls/TypeaheadSearch.svelte',
	vanilla: 'packages/examples-vanilla/src/controls/typeaheadSearch.ts',
	vue: 'packages/examples-vue/src/search/useTypeaheadSearch.ts',
};

/**
 * Remove comments, so only code is matched.
 *
 * @param source - The file's text.
 * @returns The text without block, HTML and line comments.
 */
function stripComments(source: string): string {
	return source
		.replaceAll(/\/\*[\s\S]*?\*\//gu, '')
		.replaceAll(/<!--[\s\S]*?-->/gu, '')
		.replaceAll(/(^|\s)\/\/[^\n]*/gu, '$1');
}

/**
 * Whether a repo-relative path is a non-test source file.
 *
 * @param path - The repo-relative path.
 * @returns `true` for a source file that is not a test, spec or test fixture.
 */
function isSource(path: string): boolean {
	return SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))
		&& !/\.(?:test|spec)\./u.test(path)
		&& !path.includes('/test-support/')
		&& !path.endsWith('.d.ts');
}

/**
 * Every non-test source file under a directory, comments stripped.
 *
 * @param directory - Repo-relative directory.
 * @returns Path → code.
 */
function readSources(directory: string): ReadonlyMap<string, string> {
	const sources = new Map<string, string>();
	const walk = (relativeDirectory: string): void => {
		for (const name of readdirSync(resolve(REPO_ROOT, relativeDirectory))) {
			const path = join(relativeDirectory, name);

			if (statSync(resolve(REPO_ROOT, path)).isDirectory()) {
				walk(path);
			} else if (isSource(path)) {
				sources.set(path, stripComments(readFileSync(resolve(REPO_ROOT, path), 'utf8')));
			}
		}
	};

	walk(directory);

	return sources;
}

/**
 * The shared React panel layer's sources, without the framework-neutral decision modules.
 *
 * @returns Path → code.
 */
function readSharedReactPanels(): ReadonlyMap<string, string> {
	const sources = new Map<string, string>();

	for (const root of SHARED_REACT_PANEL_ROOTS) {
		for (const [path, code] of readSources(root)) {
			if (isSharedReactPanel(path)) {
				sources.set(path, code);
			}
		}
	}

	return sources;
}

/**
 * Every source set the panel decisions are made in: each app, plus the shared React panels.
 *
 * @returns Implementation name → path → code.
 */
function readImplementations(): ReadonlyMap<string, ReadonlyMap<string, string>> {
	const implementations = new Map<string, ReadonlyMap<string, string>>(
		Object.entries(APP_SOURCE_ROOTS).map(([app, root]) => [app, readSources(root)]),
	);

	implementations.set('examples-shared (React panels)', readSharedReactPanels());

	return implementations;
}

/**
 * The source sets the panels are written in: the four apps that write their own, plus the shared
 * React panels both React apps render.
 *
 * @returns Implementation name → path → code.
 */
function readPanelImplementations(): ReadonlyMap<string, ReadonlyMap<string, string>> {
	const all = readImplementations();

	return new Map([...all].filter(([name]) => !name.startsWith('examples-react-')));
}

/**
 * Join a source set's code.
 *
 * @param sources - Path → code.
 * @returns All the code.
 */
function joined(sources: ReadonlyMap<string, string>): string {
	return [...sources.values()].join('\n');
}

/**
 * The quoted literals a source writes out, in any of the frameworks' quoting styles.
 *
 * @param code - Comment-stripped source.
 * @param text - The text to look for.
 * @returns Whether `text` appears as a string literal or as template text.
 */
function restates(code: string, text: string): boolean {
	const escaped = text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);

	return new RegExp(`(?:['"\`>]\\s*)${escaped}(?:\\s*['"\`<])`, 'u').test(code);
}

/** The shared copy no app may restate: placeholders, accessible names, empty states, boot and server screens. */
const SHARED_COPY: readonly string[] = [
	...Object.values(WINE_SEARCHES).flatMap((search) => [search.ariaLabel, search.placeholder]),
	...Object.values(WINE_SLIDER_COPY).map((slider) => slider.sliderLabel),
	...Object.values(BOOKS_SEARCH_COPY).flatMap((search) => [search.ariaLabel, search.placeholder]),
	...Object.values(BOOKS_SLIDER_COPY).map((slider) => slider.ariaLabel),
	BOOKS_ISBN_INVALID_MESSAGE,
	REAL_ESTATE_DESCRIPTION_SEARCH.ariaLabel,
	REAL_ESTATE_DESCRIPTION_SEARCH.placeholder,
	...Object.values(RESULT_COPY).flatMap((copy) => [copy.emptyHint, copy.emptyTitle, copy.scrollerLabel]),
	...Object.values(BOOT_FAILURE_COPY).flatMap((copy) => [copy.hint, copy.title]),
	SERVER_ROUTE_SCREEN_COPY.connectingCaption,
	SERVER_ROUTE_SCREEN_COPY.connectingLoaderLabel,
	SERVER_ROUTE_SCREEN_COPY.offlineTitle,
];

describe('panel behavior parity across every app', () => {
	it('lists every app package', () => {
		// The roster guard: a seventh app must join APP_SOURCE_ROOTS, or every assertion below would
		// quietly cover one app fewer than exist.
		const apps = readdirSync(resolve(REPO_ROOT, 'packages'))
			.filter((name) => name.startsWith('examples-') && !['examples-docs', 'examples-server', 'examples-shared'].includes(name))
			.sort((left, right) => left.localeCompare(right));

		expect(apps).toEqual(Object.keys(APP_SOURCE_ROOTS).sort((left, right) => left.localeCompare(right)));
		for (const sources of readImplementations().values()) {
			expect(sources.size).toBeGreaterThan(0);
		}
	});

	it.each(Object.entries(APP_SOURCE_ROOTS))('%s clears all filters through the shared helpers', (app, root) => {
		const sources = readSources(root);
		const code = joined(sources);

		expect(code, `${app}'s books / real-estate "Clear all" must call clearAllFilters`).toMatch(/\bclearAllFilters\(/u);
		expect(code, `${app}'s wine "Clear all" must call clearAllWineFilters`).toMatch(/\bclearAllWineFilters\(/u);
		for (const [path, fileCode] of sources) {
			expect(fileCode, `${path} calls clearRules itself; use clearAllFilters so the busy mark comes first`).not.toMatch(/\.clearRules\(/u);
			expect(fileCode, `${path} keeps a facet-id list for Clear all; clearAllFilters drops every rule`).not.toMatch(/\bREAL_ESTATE_FACET_RULE_IDS\b/u);
			if (/forwardToEngine\(\s*'clearRules'/u.test(fileCode)) {
				expect(fileCode, `${path} forwards clearRules outside the shared helper's seam`).toMatch(/\bclearAll(?:Wine)?Filters\(/u);
			}
		}
	});

	it.each(Object.entries(SEARCH_BINDINGS))('the %s search fields bind the shared timing controller', (_framework, path) => {
		const code = stripComments(readFileSync(resolve(REPO_ROOT, path), 'utf8'));

		expect(code, `${path} must time its commits with createTypeaheadController`).toMatch(/\bcreateTypeaheadController\(/u);
	});

	it('the React search sections bind useTypeaheadSearch', () => {
		const writers = [...readSharedReactPanels()].filter(([, code]) => /<SearchInput\b/u.test(code));

		expect(writers.length).toBeGreaterThan(0);
		for (const [path, code] of writers) {
			expect(code, `${path} renders a SearchInput without the shared timing`).toMatch(/\buseTypeaheadSearch\(/u);
		}
	});

	it.each([...readPanelImplementations()])('%s builds wine search and range rules through the shared builders', (implementation, sources) => {
		const wineSources = [...sources].filter(([path]) => /\/wine\//u.test(path));
		const code = wineSources.map(([, fileCode]) => fileCode).join('\n');

		expect(wineSources.length, `${implementation} has no wine sources`).toBeGreaterThan(0);
		expect(code, `${implementation}'s wine searches must use wineSearchRule`).toMatch(/\bwineSearchRule\(/u);
		expect(code, `${implementation}'s wine range sliders must use wineRangeRule`).toMatch(/\bwineRangeRule\(/u);
	});

	it.each([...readImplementations()])('%s builds no wine fuzzy or price rule of its own', (_implementation, sources) => {
		for (const [path, fileCode] of [...sources].filter(([sourcePath]) => /\/wine\//u.test(sourcePath))) {
			expect(fileCode, `${path} builds a fuzzy rule itself; use wineSearchRule`).not.toMatch(/\bfuzzy\(/u);
			expect(fileCode, `${path} builds a price range itself; use wineRangeRule`).not.toMatch(/\brange\(\s*'priceUsd'/u);
		}
	});

	it.each([...readImplementations()])('%s never asks toggleWouldBeEmpty directly', (_implementation, sources) => {
		for (const [path, code] of sources) {
			expect(code, `${path} calls toggleWouldBeEmpty directly; isToggleDisabled never disables a checked box`).not.toMatch(/\btoggleWouldBeEmpty\(/u);
		}
	});

	it.each([...readPanelImplementations()])('%s disables its books checkboxes through isToggleDisabled', (implementation, sources) => {
		const books = joined(new Map([...sources].filter(([path]) => /\/books\//u.test(path))));

		expect(books, `${implementation}'s books checkboxes must use isToggleDisabled`).toMatch(/\b(?:isToggleDisabled|useIsToggleDisabled)\(/u);
	});

	it.each(HAND_ROLLED_SLIDERS)('%s resolves typed bounds and track presses with the shared decisions', (path) => {
		const code = stripComments(readFileSync(resolve(REPO_ROOT, path), 'utf8'));

		expect(code, `${path} must snap typed bounds with resolveTypedBound`).toMatch(/\bresolveTypedBound\(/u);
		expect(code, `${path} must pick the pressed thumb with nearestThumb`).toMatch(/\bnearestThumb\(/u);
	});

	it.each([...readPanelImplementations()])('%s takes its result-grid window from the shared table', (implementation, sources) => {
		expect(joined(sources), `${implementation} must read RESULT_GRID_WINDOW`).toMatch(/\bRESULT_GRID_WINDOW\b/u);
	});

	it.each([...readImplementations()])('%s declares no render window of its own', (_implementation, sources) => {
		for (const [path, fileCode] of sources) {
			expect(fileCode, `${path} declares its own render window; use RESULT_GRID_WINDOW`).not.toMatch(/\b(?:BATCH_INCREMENT|HARD_CAP_RENDER|INITIAL_BATCH|PAGE_SIZE)\s*=/u);
		}
	});

	it('has shared copy to look for', () => {
		expect(SHARED_COPY.length).toBeGreaterThan(30);
		expect(SHARED_COPY.every((text) => text.length > 0)).toBe(true);
	});

	it.each([...readImplementations()])('%s reads the panels\' copy from the shared tables', (_implementation, sources) => {
		for (const [path, code] of sources) {
			const restated = SHARED_COPY.filter((text) => restates(code, text));

			expect(restated, `${path} writes shared copy out again; import it from the shared table`).toEqual([]);
		}
	});
});
