/**
 * Pins the measurement script and the size budgets against the vertical registry.
 *
 * @remarks
 * Two sources describe the verticals with no compile-time link to each other:
 * `examples-shared/verticals` (identity) and `scripts/measure-verticals.mjs` (how much code each one
 * wrote). Nothing makes them agree, and the failure mode is quiet — a vertical missing from the
 * script is simply never measured, which reads as a small app rather than as missing data.
 *
 * `.size-limit.json` here budgets only this repository's own shippable code (the brand package). The
 * framework bindings' budgets — what each vertical's adapter costs — belong to the engine
 * repository, which publishes those packages and guards its own `.size-limit.json`.
 *
 * All of it is read as TEXT. This project is repo-root and resolves no workspace packages, and the
 * script is `.mjs` run by bare `node`; parsing beats importing on both counts.
 *
 * @packageDocumentation
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Read a repo file.
 *
 * @param relative - Path from the repo root.
 * @returns Its contents.
 */
function read(relative: string): string {
	return readFileSync(resolve(REPO_ROOT, relative), 'utf8');
}

/** The vertical ids the registry declares, in its own order. */
const registryIds = [
	...read('packages/examples-shared/src/verticals/verticals.ts').matchAll(/^\t\tid: '([a-z-]+)',$/gmu),
].map(([, id]) => id);

describe('the vertical registry', () => {
	it('declares the six ids the rest of this file checks against', () => {
		// Guards the guard: every assertion below is driven by this parse, so a regex that silently
		// matched nothing would make the whole file vacuously green.
		expect(registryIds).toEqual([
			'react-rtk',
			'react-plain',
			'sveltekit',
			'vue',
			'angular',
			'vanilla',
		]);
	});
});

describe('measure-verticals.mjs', () => {
	it('measures one tree per vertical, in the registry’s order', () => {
		// Scoped to the TREES array. Matching the whole file would sweep up the SHARED block too — which
		// would pass happily on the day someone deleted a vertical and added a shared package, since only
		// the COUNT would stay plausible.
		const script = read('scripts/measure-verticals.mjs');
		const block = /const TREES = \[([\s\S]*?)\n\];/u.exec(script);

		expect(block, 'the TREES array should be findable').not.toBeNull();

		const measured = [...(block?.[1] ?? '').matchAll(/id: '([a-z-]+)'/gu)].map(([, id]) => id);

		expect(measured).toEqual(registryIds);
	});

	it('points every tree at a directory that exists', () => {
		const script = read('scripts/measure-verticals.mjs');

		for (const [, path] of script.matchAll(/path: '(packages\/[^']+)'/gu)) {
			// A typo here does not throw — `walk` would simply find nothing and report zero, which looks
			// like a very small app rather than a broken path.
			expect(() => read(`${path}/../package.json`), `${path} should exist`).not.toThrow();
		}
	});
});

describe('.size-limit.json', () => {
	const config = JSON.parse(read('.size-limit.json')) as {
		readonly ignore?: readonly string[];
		readonly limit?: string;
		readonly name: string;
		/** A single file, or several measured under one budget — size-limit accepts both. */
		readonly path: string | readonly string[];
	}[];

	/**
	 * Every file one entry measures.
	 *
	 * @remarks
	 * `typeof` rather than `Array.isArray`: the latter narrows a `readonly string[]` to `any[]`, which
	 * makes everything downstream `any` and trips the unsafe-argument rules for no benefit.
	 *
	 * @param path - An entry's `path`, in either form.
	 * @returns The paths as an array.
	 */
	function pathsOf(path: string | readonly string[]): readonly string[] {
		return typeof path === 'string' ? [path] : path;
	}

	it('budgets at least one entry, so the cases below have subjects', () => {
		// Vacuity guard. Every case below loops over the entries, and a loop over an empty array passes.
		expect(config.length, '.size-limit.json has no entries — has it moved?').toBeGreaterThan(0);
	});

	it('gives every entry a limit and a built path', () => {
		for (const entry of config) {
			expect(entry.limit, `${entry.name} has no limit`).toMatch(/kB$/u);

			// `path` may be a string or an array — size-limit accepts several files under one budget,
			// which is how `brand` measures Mark + Wordmark together under a single budget row for
			// the pair. Every element still has to point at built output.
			for (const path of pathsOf(entry.path)) {
				// `dist`, not `src`: the packages' `exports` maps point at TypeScript source for workspace
				// consumers, so measuring `src` would measure whatever esbuild made of the types.
				expect(path, `${entry.name} should measure built output`).toMatch(/^packages\/[^/]+\/dist\//u);
			}
		}
	});

	it('marks its own workspace siblings as ignored, so each number is MARGINAL', () => {
		// The convention the whole table rests on: every row is "what this package adds", with the
		// framework external. Without it a React component package would measure React, every budget
		// would be unreachable by orders of magnitude, and the numbers would answer a question nobody
		// asked.
		//
		// **Derived from each package's real manifest, not from a hardcoded name.** Requiring
		// `@filter-enginez/core` of every entry would assume every measured package depends on the
		// engine, and `brand` does not — it is a pure asset package, `dependencies: {}` — so the literal
		// form would fail it for being correct. Reading the manifest checks the actual rule ("no
		// workspace sibling is counted twice") and keeps checking it as the graph changes.
		for (const entry of config) {
			const [firstPath] = pathsOf(entry.path);
			const packageDir = /^packages\/([^/]+)\//u.exec(firstPath ?? '')?.[1];

			expect(packageDir, `${entry.name} has an unparseable path`).toBeDefined();

			const manifest = JSON.parse(read(`packages/${packageDir ?? ''}/package.json`)) as {
				dependencies?: Record<string, string>;
				peerDependencies?: Record<string, string>;
			};
			const siblings = [
				...Object.keys(manifest.dependencies ?? {}),
				...Object.keys(manifest.peerDependencies ?? {}),
			].filter((name) => name.startsWith('@filter-enginez/'));

			for (const sibling of siblings) {
				expect(entry.ignore ?? [], `${entry.name} should ignore ${sibling}`).toContain(sibling);
			}
		}
	});
});
