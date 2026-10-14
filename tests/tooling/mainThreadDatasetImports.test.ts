/**
 * No page imports a dataset at load: outside the listed modules, `@filter-enginez/mock-data` and its
 * dataset subpaths are a source of TYPES only.
 *
 * @remarks
 * ### Why the barrels are off limits
 *
 * `@filter-enginez/mock-data/books`, `/real-estate` and `/wine` are the datasets themselves. Each
 * module generates its 10,000-record default tier when it is evaluated, and the wine barrel also
 * re-exports the wine generator, ~215 kB of name and origin tables (`/wine/generator` is that
 * generator alone). The package root re-exports all three. The pages load each dataset on demand: the
 * books and real-estate boots stream the default tier over `/api/<dataset>` and fall back to a dynamic
 * `import()` of the dataset, and the 150,000-wine tier is generated in a Web Worker. One static import
 * anywhere on a page's graph undoes that: the bundler can no longer split the dataset into a chunk of
 * its own, so it lands in the startup bundle and generates its records on every page, including pages
 * that never show it.
 *
 * `/handlers` is not a dataset barrel: its request handlers load each dataset with `import()` on the
 * first request, and the apps import it only from their development-only mock setup.
 *
 * ### Why `import { type Book }` counts as an import
 *
 * The repo compiles with `verbatimModuleSyntax`, under which an import whose every name is
 * inline-`type` is erased only down to `import '…'` — a side-effect import, which still evaluates the
 * module. Only `import type { … }` disappears entirely. A module that wants only a record type must use
 * `import type`.
 *
 * ### What may import a dataset
 *
 * {@link ALLOWED_IMPORTS}, each with the import kinds it may use and why: the Node server modules,
 * which are no browser bundle; the wine worker's corpus resolution; and the on-demand `import()`s
 * through which a page loads a dataset when it genuinely needs the records. An on-demand entry allows
 * `import()` only, so it cannot regress to a static import. Each entry must still hold such an import
 * — a stale exception is removed, not kept.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT, walkRepoFiles } from './support/repoFiles.js';

/** The module specifiers that carry a dataset or its generator: the root, each dataset, the wine generator. */
const DATASET_SPECIFIER = /^@filter-enginez\/mock-data(?:\/(?:books|real-estate|wine(?:\/generator)?))?$/u;

/** The three dataset subpaths, each of which the apps must be seen importing types from. */
const DATASET_SUBPATHS = ['books', 'real-estate', 'wine'] as const;

/** Source extensions a page module can be written in. */
const SOURCE_EXTENSIONS = ['.svelte', '.ts', '.tsx', '.vue'] as const;

/** How a source file imports a dataset module. */
type DatasetImportKind = 'dynamic' | 'inline-type-only' | 'side-effect' | 'type' | 'value';

/** One permitted way for one module to import a dataset, and why. */
interface AllowedImport {
	/** The import kinds the module may use (`type` is always allowed, everywhere). */
	readonly kinds: readonly Exclude<DatasetImportKind, 'type'>[];
	/** Why — a reason a reviewer must be able to act on. */
	readonly reason: string;
}

/**
 * The modules that may import a dataset or its generator for VALUES, keyed by repo-relative path.
 */
const ALLOWED_IMPORTS: Readonly<Record<string, AllowedImport>> = {
	'packages/examples-server/src/datasets.ts': {
		kinds: ['value'],
		reason:
			'the Node API server and the Cloudflare `/api` Worker hold the default tiers in memory to filter them; neither is a browser bundle',
	},
	'packages/examples-server/src/gen-sample.ts': {
		kinds: ['value'],
		reason: 'a Node command that writes a sample of the books to disk; no browser bundle',
	},
	'packages/examples-shared/src/books/bootBooksConfigEngine.ts': {
		kinds: ['dynamic'],
		reason: '`/books-config` boots from the bundled books and their declarative config, loaded on demand with `import()`',
	},
	'packages/examples-shared/src/books/bootBooksCore.ts': {
		kinds: ['dynamic'],
		reason: 'the books boot’s fallback when `/api/books` is unavailable, loaded on demand with `import()`',
	},
	'packages/examples-shared/src/docs/DocsPlaygroundPage.tsx': {
		kinds: ['dynamic'],
		reason: 'the docs playground loads a dataset on demand, with `import()`, when a visitor picks it',
	},
	'packages/examples-shared/src/how-it-works/benchmark/benchmarkWorkload.ts': {
		kinds: ['dynamic'],
		reason: 'the how-it-works benchmark loads the wine default tier on demand, with `import()`, to measure the engine over it',
	},
	'packages/examples-shared/src/real-estate/bootRealEstateCore.ts': {
		kinds: ['dynamic'],
		reason: 'the real-estate boot’s fallback when `/api/real-estate` is unavailable, loaded on demand with `import()`',
	},
	'packages/examples-shared/src/wine/wineCorpusLoader.ts': {
		kinds: ['value'],
		reason:
			'the wine worker’s corpus resolution, which generates the 150,000-wine tier — where the generator belongs. Imported only by the worker (asserted below)',
	},
	'packages/examples-vanilla/src/pages/booksRawPage.ts': {
		kinds: ['dynamic'],
		reason: '`/books-raw` builds its bare engine over the bundled books, loaded on demand with `import()` when the route renders',
	},
};

/** One import of a dataset or its generator found in a source file. */
interface DatasetImport {
	/** `type` when erased entirely; otherwise how the module is still evaluated. */
	readonly kind: DatasetImportKind;
	/** The repo-relative file. */
	readonly path: string;
	/** The module specifier imported. */
	readonly specifier: string;
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
function classifyStatic(isTypeOnly: boolean, clause: string): DatasetImportKind {
	if (isTypeOnly) {
		return 'type';
	}
	const named = /^\{([\s\S]*)\}$/u.exec(clause.trim())?.[1];
	const names = (named ?? '').split(',').map((name) => name.trim()).filter((name) => name.length > 0);

	return named !== undefined && names.length > 0 && names.every((name) => name.startsWith('type ')) ? 'inline-type-only' : 'value';
}

/**
 * Every import of a dataset or its generator in one source file.
 *
 * @remarks
 * Static statements are matched from the start of a line, and an `import()` only on a line that is not
 * a comment line (`*` or `//`), so prose in a comment that shows an import is not read as code.
 *
 * @param path - The repo-relative path.
 * @param text - The file's contents.
 * @returns The imports, classified.
 */
function datasetImportsOf(path: string, text: string): readonly DatasetImport[] {
	const found: DatasetImport[] = [];

	for (const match of text.matchAll(/^\s*(?:import|export)\s+(type\s+)?([^'";]*?)\s+from\s+['"]([^'"]+)['"]/gmu)) {
		const specifier = match[3] ?? '';

		if (DATASET_SPECIFIER.test(specifier)) {
			found.push({ kind: classifyStatic(match[1] !== undefined, match[2] ?? ''), path, specifier });
		}
	}
	for (const match of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gmu)) {
		const specifier = match[1] ?? '';

		if (DATASET_SPECIFIER.test(specifier)) {
			found.push({ kind: 'side-effect', path, specifier });
		}
	}
	for (const match of text.matchAll(/^(?!\s*(?:\*|\/\/))[^\n]*?\bimport\(\s*['"]([^'"]+)['"]\s*\)/gmu)) {
		const specifier = match[1] ?? '';

		if (DATASET_SPECIFIER.test(specifier)) {
			found.push({ kind: 'dynamic', path, specifier });
		}
	}

	return found;
}

/**
 * Whether an import is permitted: a type import anywhere, or a listed module using a listed kind.
 *
 * @param entry - The import.
 * @returns `true` when the import is allowed.
 */
function isAllowed({ kind, path }: DatasetImport): boolean {
	return kind === 'type' || (ALLOWED_IMPORTS[path]?.kinds.some((allowed) => allowed === kind) ?? false);
}

describe('the datasets stay off every page’s main thread', () => {
	const sources = packageSources();
	const imports = sources.flatMap(({ path, text }) => datasetImportsOf(path, text));

	it('finds the type imports the apps do make, so the cases below are not vacuous', () => {
		expect(sources.length).toBeGreaterThan(100);
		// Every app names the record types; dozens of files do, for each of the three datasets.
		for (const subpath of DATASET_SUBPATHS) {
			expect(
				imports.filter(({ kind, specifier }) => kind === 'type' && specifier === `@filter-enginez/mock-data/${subpath}`).length,
				`type imports of @filter-enginez/mock-data/${subpath}`,
			).toBeGreaterThan(10);
		}
	});

	it('imports only types from a dataset, outside the listed exceptions and their listed kinds', () => {
		const offending = imports
			.filter((entry) => !isAllowed(entry))
			.map(({ kind, path, specifier }) => `${path} (${kind} import of ${specifier})`);

		expect(
			offending,
			'import record types with `import type { … }` and load records on demand with `import()` from a listed module — an inline `type` or a static value import puts the dataset in the startup bundle',
		).toEqual([]);
	});

	it('keeps no stale exception: each listed module still imports a dataset in a listed way', () => {
		const stale = Object.entries(ALLOWED_IMPORTS)
			.filter(([path, { kinds }]) => !imports.some((entry) => entry.path === path && kinds.some((kind) => kind === entry.kind)))
			.map(([path]) => path);

		expect(stale, 'remove these from ALLOWED_IMPORTS, or correct their kinds').toEqual([]);
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

describe('datasetImportsOf', () => {
	it.each([
		["import type { Book } from '@filter-enginez/mock-data/books';", 'type'],
		["import { type Listing } from '@filter-enginez/mock-data/real-estate';", 'inline-type-only'],
		["import { books as defaultBooks } from '@filter-enginez/mock-data/books';", 'value'],
		["import {\n\ttype Listing,\n\tlistings,\n} from '@filter-enginez/mock-data/real-estate';", 'value'],
		["\timport { wines } from '@filter-enginez/mock-data/wine';", 'value'],
		["import { generateWines } from '@filter-enginez/mock-data/wine/generator';", 'value'],
		["import { books } from '@filter-enginez/mock-data';", 'value'],
		["export { listings } from '@filter-enginez/mock-data/real-estate';", 'value'],
		["import '@filter-enginez/mock-data/books';", 'side-effect'],
		["const { books } = await import('@filter-enginez/mock-data/books');", 'dynamic'],
	] as const)('reads %j as a %s import', (line, kind) => {
		expect(datasetImportsOf('example.ts', line).map((entry) => entry.kind)).toEqual([kind]);
	});

	it.each([
		"import { allHandlers } from '@filter-enginez/mock-data/handlers';",
		"import { books } from '@filter-enginez/mock-data/books-extra';",
		" * ships `import { books } from '@filter-enginez/mock-data/books'` in prose, mid-line",
		" * (`() => import('@filter-enginez/mock-data/books').then(m => m.books)`) in a doc comment",
		"\t// const { books } = await import('@filter-enginez/mock-data/books');",
	])('ignores %j', (line) => {
		expect(datasetImportsOf('example.ts', line)).toEqual([]);
	});
});
