/**
 * The React-free subpath firewall, enforced by walking the actual import graph.
 *
 * @remarks
 * `examples-shared` is a React-first package that also serves five non-React verticals. The way it
 * does that is a set of `-core` / `-domain` / `-engine` subpath exports carrying the orchestration
 * without the presentation (the engine repository's `docs/architecture.md` §17b,
 * https://github.com/mlilli/filter-enginez). The whole arrangement rests on one
 * invariant: **nothing reachable from those entry points may import React.**
 *
 * That invariant has no natural enforcement. ES imports are not tree-shaken at the source boundary a
 * Svelte or Angular bundle cares about, so a single `import { useMemo } from 'react'` added anywhere
 * in the transitive graph re-taints every consumer at once. Nothing fails: the React apps keep
 * working, typecheck passes, tests pass, and the only symptom is React quietly reappearing in five
 * other bundles, where only someone reading a bundle analysis would find it.
 *
 * So this walks the graph the same way a bundler would — following relative imports from each
 * declared React-free entry point — and fails on the first module that reaches a banned specifier.
 * A `.tsx` file anywhere in the graph fails too: JSX cannot appear without React in this repo, so it
 * is a reliable proxy even when the React import is indirect.
 *
 * **`@filter-enginez/react-ui/bounds` is allowed, deliberately.** Despite the package name it is an
 * import-free subpath — no React, no engine, no browser globals — created exactly so the non-React
 * verticals could share the bounds math. The package ROOT is banned; the subpath is not. That
 * distinction is the point, and getting it backwards would either break five bundles or duplicate
 * the one helper five ways.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SHARED_ROOT = resolve(REPO_ROOT, 'packages/examples-shared');

/**
 * The subpaths that promise to be React-free. Every non-React vertical imports only from this list.
 *
 * Kept as an explicit list rather than derived by name pattern: the promise is a DECISION about each
 * entry point, and a new `./foo-core` should have to be added here consciously rather than inherit
 * the guarantee from its suffix.
 */
const REACT_FREE_SUBPATHS = [
	'./about-core',
	'./books-boot-core',
	'./books-core',
	'./books-domain',
	'./books-server-core',
	'./books-server-engine',
	// The dataset boot caption, worded once for all six verticals (see `bootCaptionSingleSource`). It
	// imports nothing at all, which is the strongest form of this promise available: there is no
	// transitive graph to taint.
	'./boot-caption',
	'./bounds',
	'./bundle-readers',
	'./devtools-core',
	'./notfound-core',
	'./picker',
	'./real-estate-boot-core',
	'./real-estate-core',
	'./real-estate-domain',
	'./real-estate-map',
	'./selection',
	'./verticals',
	'./viewport-core',
	// The dataset-neutral chip-vocabulary derivation. Every dataset's panel needs it, React or not,
	// which is why it has its own address rather than living under one dataset's slice.
	'./vocabulary',
	'./wine-core',
	'./wine-domain',
	// The wine twin of `./books-server-core` / `./books-server-engine`. `bootServerEngine.ts`'s own
	// docblock claims React-freeness, and a claim in a docblock is what this file exists to replace.
	'./wine-server-core',
	// The Vite-only worker spawn, quarantined out of `./wine-core` so Angular can import that. It is
	// listed because "React-free" and "safe for a non-React vertical" are the same question here.
	'./wine-worker-spawn',
] as const;

/** Specifiers that mean React has entered the graph. */
const BANNED = [
	'react',
	'react-dom',
	'react-router-dom',
	'@filter-enginez/react-signals',
	'@filter-enginez/react-rxjs',
	'@filter-enginez/react-ui',
];

/**
 * Whether an import specifier is banned.
 *
 * @remarks
 * Exact match or a subpath of a banned package — except `@filter-enginez/react-ui/bounds`, which is
 * the deliberately import-free subpath the non-React verticals share.
 *
 * @param specifier - The raw import specifier.
 * @returns `true` when importing it taints the graph.
 */
function isBanned(specifier: string): boolean {
	if (specifier === '@filter-enginez/react-ui/bounds') {
		return false;
	}

	return BANNED.some((banned) => specifier === banned || specifier.startsWith(`${banned}/`));
}

/**
 * Every import specifier in a source file.
 *
 * @remarks
 * Regex rather than a real parser: this only needs the specifier strings, and the repo's formatting
 * is Prettier-normalized. Covers static imports, `export … from`, and dynamic `import()` — the last
 * matters because the SvelteKit routes defer their browser-only graphs that way.
 *
 * @param source - File contents.
 * @returns The specifiers, in source order.
 */
function importsOf(source: string): string[] {
	const pattern = /(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/gu;

	return [...source.matchAll(pattern)].map(([, specifier]) => specifier ?? '');
}

/**
 * Resolve a relative specifier to a file on disk.
 *
 * @remarks
 * The repo runs `moduleResolution: nodenext`, so source imports carry `.js` extensions that must be
 * mapped back to `.ts` / `.tsx` on disk — and a directory import means its `index`.
 *
 * @param fromFile - The importing file's absolute path.
 * @param specifier - A relative specifier.
 * @returns The absolute path, or `null` when nothing matches.
 */
function resolveLocal(fromFile: string, specifier: string): string | null {
	const base = resolve(dirname(fromFile), specifier).replace(/\.js$/u, '');
	const candidates = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base];

	return candidates.find((candidate) => existsSync(candidate) && candidate.includes('.')) ?? null;
}

/**
 * Walk a subpath's transitive local graph.
 *
 * @param entry - Absolute path of the entry module.
 * @returns Violations as `file → specifier` strings; empty when clean.
 */
function violationsFrom(entry: string): string[] {
	const seen = new Set<string>();
	const queue = [entry];
	const violations: string[] = [];

	while (queue.length > 0) {
		const file = queue.pop();

		if (file === undefined || seen.has(file)) {
			continue;
		}
		seen.add(file);

		const relative = file.replace(`${REPO_ROOT}/`, '');

		if (file.endsWith('.tsx')) {
			violations.push(`${relative} → is .tsx (JSX implies React)`);

			continue;
		}

		for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
			if (isBanned(specifier)) {
				violations.push(`${relative} → imports "${specifier}"`);

				continue;
			}
			if (specifier.startsWith('.')) {
				const next = resolveLocal(file, specifier);

				if (next !== null) {
					queue.push(next);
				}
			}
		}
	}

	return violations;
}

/** The package's declared export map. */
const exportMap = (JSON.parse(readFileSync(resolve(SHARED_ROOT, 'package.json'), 'utf8')) as {
	exports: Record<string, string>;
}).exports;

describe('examples-shared React-free subpaths', () => {
	it.each(REACT_FREE_SUBPATHS)('%s reaches no React import', (subpath) => {
		const target = exportMap[subpath];

		expect(target, `${subpath} is not declared in the export map`).toBeDefined();

		const violations = violationsFrom(resolve(SHARED_ROOT, target ?? ''));

		expect(violations, `React reachable from ${subpath}:\n  ${violations.join('\n  ')}`).toEqual([]);
	});

	it('walks a graph deep enough to be meaningful', () => {
		// A guard on the guard. If `resolveLocal` ever stopped resolving — a changed extension
		// convention, a moved file — every subpath above would pass by visiting one module and finding
		// nothing. The suite would stay green while enforcing nothing at all.
		const seen = new Set<string>();
		const queue = [resolve(SHARED_ROOT, exportMap['./books-domain'] ?? '')];

		while (queue.length > 0) {
			const file = queue.pop();

			if (file === undefined || seen.has(file)) {
				continue;
			}
			seen.add(file);
			for (const specifier of importsOf(readFileSync(file, 'utf8'))) {
				if (specifier.startsWith('.')) {
					const next = resolveLocal(file, specifier);

					if (next !== null) {
						queue.push(next);
					}
				}
			}
		}

		expect(seen.size).toBeGreaterThan(3);
	});

	it('would catch a banned import', () => {
		// The detector itself, since every assertion above is a negative. Without this, a broken
		// `isBanned` reads exactly like a clean codebase.
		expect(isBanned('react')).toBe(true);
		expect(isBanned('@filter-enginez/react-signals')).toBe(true);
		expect(isBanned('@filter-enginez/react-ui')).toBe(true);
	});

	it('allows the import-free react-ui/bounds subpath', () => {
		// The one deliberate exception. Banning it would push five verticals into duplicating the
		// bounds math — which is exactly the duplication that subpath exists to prevent.
		expect(isBanned('@filter-enginez/react-ui/bounds')).toBe(false);
	});
});
