/**
 * Every package the wine worker imports is pre-bundled by each Vite app at dev-server start.
 *
 * @remarks
 * The wine worker (`examples-shared/src/wine/wine.worker.ts`) is spawned through a `?worker` import, so
 * it is a separate module graph that Vite's dependency scan at server start never walks. A bare package
 * that only the worker imports is therefore discovered on the first visit to `/wine`: Vite optimizes it,
 * logs "optimized dependencies changed. reloading", and reloads EVERY open page of that app. Under the
 * end-to-end suite that surfaces as a test on some other page failing with "Cannot find context with
 * specified id" (its page reloaded mid-action), which points nowhere near the cause.
 *
 * So each Vite app that spawns the worker lists, in its `optimizeDeps.include`, every bare package the
 * worker's module graph imports, except the ones the main thread's wine boot (`wineEngine.ts`) imports
 * too: those are discovered by the startup scan through the main graph. The check reads source TEXT, so
 * it runs without building anything; a package added to the worker, or a Vite app that starts spawning
 * it, fails here until the list is updated.
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WINE_SOURCE_DIRECTORY = resolve(REPO_ROOT, 'packages/examples-shared/src/wine');
const WORKER_ENTRY = resolve(WINE_SOURCE_DIRECTORY, 'wine.worker.ts');
const MAIN_THREAD_WINE_BOOT = resolve(WINE_SOURCE_DIRECTORY, 'wineEngine.ts');

/**
 * Matches every runtime import or re-export with a string specifier: `import … from '…'`,
 * `export … from '…'` and `import('…')`, across line breaks. `import type` / `export type` are
 * excluded, because only they are erased under `verbatimModuleSyntax`; an inline `{ type X }` import
 * still loads its module, so it counts.
 */
const RUNTIME_IMPORT_PATTERN =
	/(?:^|\n)\s*(?:import|export)\s+(?!type\s)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gu;

/**
 * The runtime import specifiers of one source file.
 *
 * @param filePath - An absolute path to a `.ts` file.
 * @returns Its specifiers, in source order.
 */
function runtimeSpecifiersOf(filePath: string): string[] {
	const source = readFileSync(filePath, 'utf8');

	return [...source.matchAll(RUNTIME_IMPORT_PATTERN)].map((match) => match[1] ?? match[2] ?? '');
}

/**
 * Walk a module graph from `entry` through its relative imports and collect every bare specifier.
 *
 * @param entry - The absolute path of the graph's entry module.
 * @returns The bare (package) specifiers reached, sorted.
 */
function bareSpecifiersOfGraph(entry: string): string[] {
	const visited = new Set<string>();
	const bareSpecifiers = new Set<string>();
	const pending = [entry];

	while (pending.length > 0) {
		const current = pending.pop() as string;

		if (visited.has(current)) {
			continue;
		}
		visited.add(current);
		for (const specifier of runtimeSpecifiersOf(current)) {
			if (specifier.startsWith('.')) {
				// Sources import siblings with the emitted `.js` extension; the file on disk is `.ts`.
				pending.push(resolve(dirname(current), specifier.replace(/\.js$/u, '.ts')));
			} else {
				bareSpecifiers.add(specifier);
			}
		}
	}

	return [...bareSpecifiers].sort();
}

/**
 * Every non-test source file under a directory, recursively.
 *
 * @param directory - An absolute directory.
 * @returns Absolute file paths.
 */
function sourceFilesUnder(directory: string): string[] {
	return readdirSync(directory).flatMap((name) => {
		const path = join(directory, name);

		if (statSync(path).isDirectory()) {
			return name === 'node_modules' ? [] : sourceFilesUnder(path);
		}

		return /\.(?:ts|tsx|vue|svelte)$/u.test(name) && !/\.(?:test|spec)\.ts$/u.test(name) ? [path] : [];
	});
}

/**
 * The string entries of a Vite config's `optimizeDeps.include` array, read from its text.
 *
 * @param configText - The text of a `vite.config.ts`.
 * @returns The listed specifiers; empty when the config has no `include`.
 */
function optimizeDepsIncludeOf(configText: string): string[] {
	const includeBlock = /optimizeDeps:\s*\{[\s\S]*?include:\s*\[([\s\S]*?)\]/u.exec(configText)?.[1] ?? '';

	return [...includeBlock.replaceAll(/\/\/[^\n]*/gu, '').matchAll(/['"]([^'"]+)['"]/gu)].map((match) => match[1] ?? '');
}

/** The packages the worker imports, and the subset the main-thread wine boot also imports. */
const WORKER_PACKAGES = bareSpecifiersOfGraph(WORKER_ENTRY);
const MAIN_THREAD_PACKAGES = new Set(runtimeSpecifiersOf(MAIN_THREAD_WINE_BOOT).filter((specifier) => !specifier.startsWith('.')));
const WORKER_ONLY_PACKAGES = WORKER_PACKAGES.filter((specifier) => !MAIN_THREAD_PACKAGES.has(specifier));

/** Vite apps whose own source spawns the wine worker (Angular builds with `@angular/build`, not Vite). */
const WORKER_SPAWNING_VITE_APPS = readdirSync(resolve(REPO_ROOT, 'packages'))
	.filter((name) => existsSync(resolve(REPO_ROOT, 'packages', name, 'vite.config.ts')))
	.filter((name) => existsSync(resolve(REPO_ROOT, 'packages', name, 'src')))
	.filter((name) =>
		sourceFilesUnder(resolve(REPO_ROOT, 'packages', name, 'src')).some((file) =>
			readFileSync(file, 'utf8').includes('@filter-enginez/examples-shared/wine-worker-spawn'),
		),
	);

describe('the wine worker’s packages are pre-bundled at dev-server start', () => {
	it('walks the worker graph and finds the apps, so the checks below are not vacuous', () => {
		expect(WORKER_PACKAGES).toContain('@filter-enginez/mock-data/wine/generator');
		expect(WORKER_ONLY_PACKAGES.length).toBeGreaterThanOrEqual(1);
		expect(WORKER_SPAWNING_VITE_APPS.length).toBeGreaterThanOrEqual(5);
	});

	it('reads a runtime import, an inline-type import and a dynamic import, and skips `import type`', () => {
		const sample = [
			"import type { A } from 'erased-a';",
			"import { b, type B } from 'kept-b';",
			"import {\n\tc,\n} from 'kept-c';",
			"export { d } from 'kept-d';",
			"const e = await import('kept-e');",
		].join('\n');

		expect([...sample.matchAll(RUNTIME_IMPORT_PATTERN)].map((match) => match[1] ?? match[2])).toEqual([
			'kept-b',
			'kept-c',
			'kept-d',
			'kept-e',
		]);
	});

	for (const appName of WORKER_SPAWNING_VITE_APPS) {
		it(`${appName}: optimizeDeps.include lists every package only the worker imports`, () => {
			const configPath = resolve(REPO_ROOT, 'packages', appName, 'vite.config.ts');
			const included = optimizeDepsIncludeOf(readFileSync(configPath, 'utf8'));
			const missing = WORKER_ONLY_PACKAGES.filter((specifier) => !included.includes(specifier));

			expect(
				missing,
				`${relative(REPO_ROOT, configPath)}: add these to optimizeDeps.include, or the first /wine visit reloads every open page`,
			).toEqual([]);
		});
	}
});
