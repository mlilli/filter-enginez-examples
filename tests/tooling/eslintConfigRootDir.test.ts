/**
 * A package's root-level `*.config.ts` lints from the repo root as well as from the package.
 *
 * @remarks
 * The shared ESLint preset lists `*.config.ts` in typescript-eslint's `allowDefaultProject`, because no
 * package tsconfig includes a package's `vite.config.ts`. Those globs are relative to `tsconfigRootDir`,
 * which defaults to the working directory. `turbo run lint` runs ESLint inside each package, so
 * `vite.config.ts` matches; the pre-commit hook's lint-staged pass runs it from the repo root, where the
 * same file is `packages/<name>/vite.config.ts`, matches nothing, and fails to parse — so any commit that
 * touches it is rejected.
 *
 * Each package with a root-level `*.config.ts` therefore either sets
 * `tsconfigRootDir: import.meta.dirname` in its `eslint.config.js`, anchoring the globs to the package,
 * or lists the file in its ESLint `ignores`.
 *
 * Read as TEXT: these are properties of literal files humans edit.
 *
 * @packageDocumentation
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Each package's root-level TypeScript config files, by package directory name. */
const CONFIG_FILES_BY_PACKAGE = readdirSync(resolve(REPO_ROOT, 'packages'), { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => ({
		configFiles: readdirSync(resolve(REPO_ROOT, 'packages', entry.name)).filter((file) => /\.config\.[cm]?ts$/u.test(file)),
		name: entry.name,
	}))
	.filter(({ configFiles }) => configFiles.length > 0);

describe('package config files lint from the repo root', () => {
	it('finds packages with a root-level *.config.ts, so the check below is not vacuous', () => {
		expect(CONFIG_FILES_BY_PACKAGE.length).toBeGreaterThanOrEqual(5);
	});

	for (const { configFiles, name } of CONFIG_FILES_BY_PACKAGE) {
		it(`${name}: anchors tsconfigRootDir or ignores ${configFiles.join(', ')}`, () => {
			const eslintConfig = readFileSync(resolve(REPO_ROOT, 'packages', name, 'eslint.config.js'), 'utf8');
			const isAnchored = /tsconfigRootDir:\s*import\.meta\.dirname/u.test(eslintConfig);
			const unhandled = isAnchored ? [] : configFiles.filter((file) => !eslintConfig.includes(`'${file}'`));

			expect(
				unhandled,
				`packages/${name}/eslint.config.js: set \`tsconfigRootDir: import.meta.dirname\` or ignore these`,
			).toEqual([]);
		});
	}
});
