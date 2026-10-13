/**
 * Guard: in `examples-shared`, a PascalCase `.tsx` file is a pure presentational component.
 *
 * @remarks
 * **What depends on this.** `vitest.coverage.config.ts` excludes `examples-shared/src/**\/[A-Z]*.tsx` from
 * coverage, on the grounds that those files are rendered end-to-end by all six verticals and unit
 * tests over them would duplicate e2e while coupling to the markup the apps exist to vary.
 *
 * That exclusion is only honest while the naming convention holds. The package's logic-bearing `.tsx`
 * files are camelCase or lowercase — `filterBundle.tsx`, `controlRegistry.tsx`, `docsRoutes.tsx`,
 * `filter-bundle/index.tsx` — and they stay IN scope. `filter-bundle/index.tsx` in particular is the
 * predictive-disable plumbing every dataset depends on; excluding it would be a real loss, and a
 * naive "exclude all .tsx" rule would do exactly that.
 *
 * So the failure this prevents is specific and quiet: somebody adds a `useSomething` hook or a
 * `createContext` to a PascalCase component file, and it vanishes from the coverage denominator
 * without anyone deciding that. No test breaks, the percentage does not move, and a piece of shared
 * logic is simply no longer measured.
 *
 * The check is deliberately crude — a regex for exported `use*` functions and `createContext` — but
 * it is aimed at the two things that actually distinguish "component" from "logic" in this codebase.
 * If it ever fires, the fix is usually to move the hook into a sibling camelCase file, not to loosen
 * this test.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Absolute path to `packages/examples-shared/src`, resolved from this file rather than from cwd. */
const SHARED_SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'packages', 'examples-shared', 'src');

/** Matches an exported React hook declaration, e.g. `export function useFetchFilterBundle(`. */
const EXPORTED_HOOK = /^export (?:function|const) use[A-Z]/m;

/** Matches a React context creation, the other marker of shared state rather than presentation. */
const CREATES_CONTEXT = /createContext[<(]/;

/**
 * Every `.tsx` file under a directory, recursively, excluding test files.
 *
 * @param dir - Directory to walk.
 * @returns Absolute paths of non-test `.tsx` files.
 */
function componentCandidates(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = join(dir, entry.name);

		if (entry.isDirectory()) {
			return entry.name === 'node_modules' || entry.name === 'dist' ? [] : componentCandidates(full);
		}

		return entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [full] : [];
	});
}

describe('examples-shared component/logic split', () => {
	const pascalCase = componentCandidates(SHARED_SRC).filter((path) => /^[A-Z]/.test(path.slice(path.lastIndexOf('/') + 1)));

	it('finds the PascalCase .tsx files the coverage exclusion targets', () => {
		// Without this the per-file assertion below could pass vacuously if the walk ever broke — and a
		// silently-empty guard over a coverage exclusion is worse than no guard.
		expect(pascalCase.length).toBeGreaterThan(20);
	});

	it.each(pascalCase.map((path) => [path.slice(SHARED_SRC.length + 1), path]))(
		'%s is a pure component (no exported hooks, no createContext)',
		(relative, path) => {
			const source = readFileSync(path, 'utf8');
			const offenders = [
				...(EXPORTED_HOOK.test(source) ? ['an exported use* hook'] : []),
				...(CREATES_CONTEXT.test(source) ? ['a createContext call'] : []),
			];

			expect(
				offenders,
				`${relative} is PascalCase, so vitest.coverage.config.ts excludes it from coverage as a pure `
					+ `presentational component — but it contains ${offenders.join(' and ')}. That logic is now `
					+ `invisible to the coverage gate. Move it into a sibling camelCase module (the pattern `
					+ `filterBundle.tsx / controlRegistry.tsx already follow) rather than relaxing this test.`,
			).toEqual([]);
		},
	);
});
