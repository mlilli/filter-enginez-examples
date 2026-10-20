/**
 * The modules the React apps' builds declare free of side effects are free of them, and every React
 * app declares them.
 *
 * @remarks
 * `scripts/lib/tree-shaking.mjs` tells the bundler that `@filter-enginez/brand`'s two barrels run
 * nothing when imported, so an import through one binds straight to the component it names and the
 * hub's startup chunk no longer carries components only a dataset page draws. That is safe only while
 * the barrels are nothing but re-exports: a barrel that grew a statement of its own (registering a
 * custom element, say) would have it silently dropped from every build. So this file reads the modules
 * the rule matches, found by the rule itself, and fails on any statement that is not `export … from`.
 * It also holds every app built with React's Vite plugin to passing the rule, since those are the apps
 * that draw the brand's React components.
 *
 * @packageDocumentation
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SIDE_EFFECT_FREE_BARRELS } from '../../scripts/lib/tree-shaking.mjs';
import { REPO_ROOT } from './support/repoFiles.js';

/**
 * Every file under a directory, recursively.
 *
 * @param directory - The directory.
 * @returns Absolute paths.
 */
function filesUnder(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
		entry.isDirectory() ? filesUnder(join(directory, entry.name)) : [join(directory, entry.name)],
	);
}

/** Whether any rule declares the module at this path free of side effects. */
const declaredSideEffectFree = (path: string): boolean => SIDE_EFFECT_FREE_BARRELS.some((rule) => !rule.sideEffects && rule.test.test(path));

/** The React apps: every package whose Vite config uses React's plugin. */
const REACT_APPS = readdirSync(resolve(REPO_ROOT, 'packages'))
	.filter((name) => {
		try {
			return readFileSync(resolve(REPO_ROOT, 'packages', name, 'vite.config.ts'), 'utf8').includes("from '@vitejs/plugin-react'");
		} catch {
			return false;
		}
	})
	.sort();

describe('scripts/lib/tree-shaking.mjs', () => {
	const brandFiles = filesUnder(resolve(REPO_ROOT, 'packages/brand/src'));
	const declared = brandFiles.filter(declaredSideEffectFree);

	it('declares exactly the brand package’s two barrels, on either path separator', () => {
		expect(declared.map((path) => relative(REPO_ROOT, path).split(sep).join('/')).sort()).toEqual([
			'packages/brand/src/index.ts',
			'packages/brand/src/loaders/index.ts',
		]);
		expect(declaredSideEffectFree('C:\\repo\\packages\\brand\\src\\loaders\\index.ts')).toBe(true);
		expect(declaredSideEffectFree('/repo/packages/brand/src/Mark.tsx')).toBe(false);
		expect(declaredSideEffectFree('/repo/packages/examples-shared/src/index.ts')).toBe(false);
	});

	it.each(['packages/brand/src/index.ts', 'packages/brand/src/loaders/index.ts'])('%s holds nothing but re-exports', (file) => {
		const statements = readFileSync(resolve(REPO_ROOT, file), 'utf8')
			.replaceAll(/\/\*[\s\S]*?\*\//gu, '')
			.replaceAll(/\/\/.*$/gmu, '')
			.split(';')
			.map((statement) => statement.trim())
			.filter((statement) => statement !== '');

		expect(statements.length).toBeGreaterThan(0);
		for (const statement of statements) {
			expect(statement, `${file} runs code of its own; it can no longer be declared free of side effects`).toMatch(
				/^export (?:\*|\{[^}]*\}) from '\.\/[\w/.-]+\.js'$/u,
			);
		}
	});
});

describe('every React app passes the rules to its bundler', () => {
	it('finds the React apps, so the cases below are not vacuous', () => {
		expect(REACT_APPS).toEqual(['examples-docs', 'examples-react-plain', 'examples-react-rtk']);
	});

	it.each(REACT_APPS)('%s', (app) => {
		const config = readFileSync(resolve(REPO_ROOT, 'packages', app, 'vite.config.ts'), 'utf8');

		expect(config).toContain("import { SIDE_EFFECT_FREE_BARRELS } from '../../scripts/lib/tree-shaking.mjs';");
		expect(config).toMatch(/^\t\trolldownOptions: \{ treeshake: \{ moduleSideEffects: \[\.\.\.SIDE_EFFECT_FREE_BARRELS\]\}\},$/mu);
	});
});
