/**
 * No page imports the wine dataset at load: outside the wine worker, `@filter-enginez/mock-data/wine`
 * is a source of TYPES only.
 *
 * @remarks
 * ### Why the barrel is off limits
 *
 * `@filter-enginez/mock-data/wine` is the wine dataset itself. Its module generates the 10,000-wine
 * default tier at load (a top-level `await`), and it re-exports the generator, ~215 kB of name and
 * origin tables. The deployed pages generate the 150,000-wine tier in a Web Worker, so the main thread
 * needs none of that — yet one import is enough to put all of it into a page's main bundle. The
 * `/wine/generator` subpath is the generator alone, and belongs in the worker too.
 *
 * ### Why `import { type Wine }` counts as an import
 *
 * The repo compiles with `verbatimModuleSyntax`, under which an import whose every name is
 * inline-`type` is erased only down to `import '…'` — a side-effect import, which still evaluates the
 * module. Only `import type { … }` disappears entirely. That is exactly how the barrel reached the main
 * thread of every app, through files that only wanted the `Wine` type.
 *
 * ### What may import it
 *
 * {@link ALLOWED_VALUE_IMPORTS}, each with its reason: the worker's corpus resolution, the Node API
 * server, and two on-demand `import()`s of the dataset where a page genuinely needs its records after
 * an interaction. Each entry must still hold such an import — a stale exception is removed, not kept.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT, walkRepoFiles } from './support/repoFiles.js';

/** The two module specifiers that carry the dataset or its generator. */
const DATASET_SPECIFIER = /^@filter-enginez\/mock-data\/wine(?:\/generator)?$/u;

/** Source extensions a page module can be written in. */
const SOURCE_EXTENSIONS = ['.svelte', '.ts', '.tsx', '.vue'] as const;

/**
 * The modules that may import the dataset or its generator for VALUES, and why.
 *
 * @remarks
 * Keyed by repo-relative path; the value is the reason, which a reviewer must be able to act on.
 */
const ALLOWED_VALUE_IMPORTS: Readonly<Record<string, string>> = {
	'packages/examples-server/src/datasets.ts': 'the Node API server holds the default tier in memory; it is no browser bundle',
	'packages/examples-shared/src/docs/DocsPlaygroundPage.tsx':
		'the docs playground loads the dataset on demand, with `import()`, when a visitor picks wine',
	'packages/examples-shared/src/how-it-works/benchmark/benchmarkWorkload.ts':
		'the how-it-works benchmark loads the default tier on demand, with `import()`, to measure the engine over it',
	'packages/examples-shared/src/wine/wineCorpusLoader.ts':
		'the wine worker’s corpus resolution, which generates the 150,000-wine tier — where the generator belongs. Imported only by the worker (asserted below)',
};

/** One import of the dataset or its generator found in a source file. */
interface DatasetImport {
	/** The repo-relative file. */
	readonly path: string;
	/** `type` when erased entirely; otherwise how the module is still evaluated. */
	readonly kind: 'dynamic' | 'inline-type-only' | 'side-effect' | 'type' | 'value';
}

/**
 * Every non-test source file under `packages/`, with its text.
 *
 * @returns Repo-relative paths and contents.
 */
function packageSources(): readonly { readonly path: string; readonly text: string }[] {
	return walkRepoFiles(resolve(REPO_ROOT, 'packages'))
		.filter((path) => SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension)))
		.filter((path) => !path.includes('.test.') && !path.includes('.spec.') && !path.includes('/test-support/'))
		.map((path) => ({ path, text: readFileSync(resolve(REPO_ROOT, path), 'utf8') }));
}

/**
 * Classify the named-import clause of a static `import … from` / `export … from`.
 *
 * @param isTypeOnly - Whether the statement is `import type` / `export type`.
 * @param clause - What sits between the keyword and `from`.
 * @returns The kind.
 */
function classifyStatic(isTypeOnly: boolean, clause: string): DatasetImport['kind'] {
	if (isTypeOnly) {
		return 'type';
	}
	const named = /^\{([\s\S]*)\}$/u.exec(clause.trim())?.[1];
	const names = (named ?? '').split(',').map((name) => name.trim()).filter((name) => name.length > 0);

	return named !== undefined && names.length > 0 && names.every((name) => name.startsWith('type ')) ? 'inline-type-only' : 'value';
}

/**
 * Every import of the dataset or its generator in one source file.
 *
 * @remarks
 * Statements are matched from the start of a line, so prose in a comment that happens to contain
 * `import` and `from` is not read as code.
 *
 * @param path - The repo-relative path.
 * @param text - The file's contents.
 * @returns The imports, classified.
 */
function datasetImportsOf(path: string, text: string): readonly DatasetImport[] {
	const found: DatasetImport[] = [];

	for (const match of text.matchAll(/^\s*(?:import|export)\s+(type\s+)?([^'";]*?)\s+from\s+['"]([^'"]+)['"]/gmu)) {
		if (DATASET_SPECIFIER.test(match[3] ?? '')) {
			found.push({ kind: classifyStatic(match[1] !== undefined, match[2] ?? ''), path });
		}
	}
	for (const match of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gmu)) {
		if (DATASET_SPECIFIER.test(match[1] ?? '')) {
			found.push({ kind: 'side-effect', path });
		}
	}
	for (const match of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/gu)) {
		if (DATASET_SPECIFIER.test(match[1] ?? '')) {
			found.push({ kind: 'dynamic', path });
		}
	}

	return found;
}

describe('the wine dataset stays off every page’s main thread', () => {
	const sources = packageSources();
	const imports = sources.flatMap(({ path, text }) => datasetImportsOf(path, text));

	it('finds the type imports the apps do make, so the cases below are not vacuous', () => {
		expect(sources.length).toBeGreaterThan(100);
		// Every app's wine code names the `Wine` type; dozens of files do.
		expect(imports.filter(({ kind }) => kind === 'type').length).toBeGreaterThan(30);
	});

	it('imports only types from the dataset, outside the listed exceptions', () => {
		const offending = imports
			.filter(({ kind, path }) => kind !== 'type' && !(path in ALLOWED_VALUE_IMPORTS))
			.map(({ kind, path }) => `${path} (${kind})`);

		expect(
			offending,
			'import the Wine types with `import type { … }` — an inline `type` or a value import bundles the dataset and its generator',
		).toEqual([]);
	});

	it('keeps no stale exception: each listed module still imports the dataset for values', () => {
		const stale = Object.keys(ALLOWED_VALUE_IMPORTS).filter(
			(path) => !imports.some((entry) => entry.path === path && entry.kind !== 'type'),
		);

		expect(stale, 'remove these from ALLOWED_VALUE_IMPORTS').toEqual([]);
	});

	it('imports the worker’s corpus resolution from the worker alone', () => {
		const importers = sources
			.filter(({ text }) => /from\s+['"]\.\/wineCorpusLoader\.js['"]/u.test(text))
			.map(({ path }) => path);

		expect(importers).toEqual(['packages/examples-shared/src/wine/wine.worker.ts']);
	});
});

describe('classifyStatic', () => {
	it.each([
		[true, '{ Wine }', 'type'],
		[false, '{ type Wine }', 'inline-type-only'],
		[false, '{ type Wine, type WineColor }', 'inline-type-only'],
		[false, '{ buildOriginTree, type Wine }', 'value'],
		[false, '{ wines }', 'value'],
		[false, '* as wine', 'value'],
		[false, '{ }', 'value'],
	] as const)('reads import%s %s as %s', (isTypeOnly, clause, kind) => {
		expect(classifyStatic(isTypeOnly, clause)).toBe(kind);
	});
});
