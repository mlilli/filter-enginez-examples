/**
 * No page of the landing site loads the engine at startup: the build checks it, and the site's source
 * keeps to the one dynamic import that makes it true.
 *
 * @remarks
 * ### What is protected
 *
 * The how-it-works page's live benchmark runs the real engine (about 350 kB minified, most of it the
 * WebAssembly bitmap library) over the wine corpus. It fetches both on demand, through one dynamic
 * `import()` of `packages/site/src/how-it-works/benchmarkEngine.ts`. The pages that import a constant or
 * an error class from next to it do not pull in the rest because the bundler may drop what they leave
 * unused: the engine's packages declare `"sideEffects": false`, and the site's `vite.config.ts` declares
 * the same of examples-shared's how-it-works subpath, whose barrel re-exports the workload. Undoing
 * either still builds, passes every other test and renders the same pages; it only adds the engine to
 * their first download.
 *
 * ### What this file pins
 *
 * - **That the build checks it:** `vite.config.ts` registers `startupWithoutEngine()`, which fails the
 *   build when a page's startup graph holds the engine (`packages/site/src/startupGraph.ts`, tested
 *   in its own suite), and passes the side-effect rules to the bundler.
 * - **That the source keeps the import dynamic,** so the regression fails `pnpm test` before any build:
 *   no site module imports `benchmarkEngine.ts` or the workload's functions statically, and exactly
 *   one imports `benchmarkEngine.ts` dynamically.
 *
 * @packageDocumentation
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './support/repoFiles.js';

/** The site's source directory. */
const SITE_SOURCE = resolve(REPO_ROOT, 'packages/site/src');

/** The site's Vite configuration. */
const VITE_CONFIG = readFileSync(resolve(REPO_ROOT, 'packages/site/vite.config.ts'), 'utf8');

/** The module the benchmark imports on demand, as other modules name it. */
const ENGINE_MODULE_NAME = 'benchmarkEngine.js';

/**
 * A module's text without its comments, whose examples may quote an import.
 *
 * @param source - The module's text.
 * @returns The code. A `//` after a colon or a quote is left alone: it is a URL in a string.
 */
function withoutComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//gu, '').replaceAll(/(?<![:'"`\w])\/\/[^\n]*/gu, '');
}

/** Every non-test TypeScript module of the site, by its path relative to `src`, with its code. */
const SITE_MODULES: readonly (readonly [string, string])[] = readdirSync(SITE_SOURCE, { recursive: true, withFileTypes: true })
	.filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts'))
	.map((entry) => {
		const path = join(entry.parentPath, entry.name);

		return [relative(SITE_SOURCE, path), withoutComments(readFileSync(path, 'utf8'))] as const;
	});

/**
 * The value imports of a module: every `import … from '…'` and `export … from '…'` that is not
 * type-only, as its whole statement.
 *
 * @param source - The module's text.
 * @returns The statements.
 */
function valueImports(source: string): readonly string[] {
	return [...source.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?\bfrom\s+'[^']+';/gmu)].map(([statement]) => statement);
}

/**
 * The dynamic `import()`s of a module, as their specifiers.
 *
 * @param source - The module's text.
 * @returns The specifiers.
 */
function dynamicImports(source: string): readonly string[] {
	return [...source.matchAll(/\bimport\(\s*'([^']+)'\s*\)/gu)].map(([, specifier = '']) => specifier);
}

describe('the site source', () => {
	it('is found, so the cases below are not vacuous', () => {
		expect(SITE_MODULES.map(([path]) => path)).toEqual(expect.arrayContaining(['how-it-works/benchmarkEngine.ts', 'how-it-works/benchmarkWidget.ts']));
		expect(SITE_MODULES.length).toBeGreaterThan(20);
	});

	it(`imports ${ENGINE_MODULE_NAME} dynamically, from exactly one module`, () => {
		const importers = SITE_MODULES.filter(([, source]) => dynamicImports(source).some((specifier) => specifier.endsWith(`/${ENGINE_MODULE_NAME}`)));

		expect(importers.map(([path]) => path)).toEqual(['how-it-works/benchmarkWidget.ts']);
	});

	it(`never imports ${ENGINE_MODULE_NAME} statically, other than for its types`, () => {
		const importers = SITE_MODULES.filter(([, source]) => valueImports(source).some((statement) => statement.includes(`/${ENGINE_MODULE_NAME}'`)));

		expect(importers.map(([path]) => path)).toEqual([]);
	});

	it('imports the workload’s functions statically only in benchmarkEngine.ts, which re-exports them', () => {
		const importers = SITE_MODULES.filter(([, source]) =>
			valueImports(source).some(
				(statement) => statement.includes("'@filter-enginez/examples-shared/how-it-works'") && /\b(?:loadWineCorpus|measureConfig)\b/u.test(statement),
			),
		);

		expect(importers.map(([path]) => path)).toEqual(['how-it-works/benchmarkEngine.ts']);
	});

	it('reads static, type-only and dynamic imports apart, so the cases above can fail', () => {
		const source = [
			"import { measureConfig } from '@filter-enginez/examples-shared/how-it-works';",
			"import type * as Engine from './benchmarkEngine.js';",
			"export { loadWineCorpus } from './benchmarkEngine.js';",
			"const engine = await import('./benchmarkEngine.js');",
		].join('\n');

		expect(valueImports(source)).toEqual([
			"import { measureConfig } from '@filter-enginez/examples-shared/how-it-works';",
			"export { loadWineCorpus } from './benchmarkEngine.js';",
		]);
		expect(dynamicImports(source)).toEqual(['./benchmarkEngine.js']);
		expect(dynamicImports(withoutComments("/** await import('./benchmarkEngine.js') */\n// import('./x.js')\nconst url = 'https://x';"))).toEqual([]);
	});
});

describe('the site build', () => {
	it('fails when a page loads the engine at startup', () => {
		expect(VITE_CONFIG).toMatch(/plugins: \[[^\]]*\bstartupWithoutEngine\(\)/u);
		expect(VITE_CONFIG).toMatch(/findDeferredModulesAtStartup\(pages, chunks\)/u);
	});

	it('tells the bundler the subpath that re-exports the workload runs nothing at import', () => {
		// The engine's modules need no rule: its packages declare `"sideEffects": false`, and the build's
		// startup check above fails if that ever stops keeping the engine off a page.
		expect(VITE_CONFIG).toMatch(/treeshake: \{ moduleSideEffects: HOW_IT_WORKS_SIDE_EFFECT_FREE \}/u);
		expect(VITE_CONFIG).toContain('{ sideEffects: false, test: /[/\\\\]examples-shared[/\\\\]src[/\\\\]how-it-works[/\\\\]/u }');
	});
});
