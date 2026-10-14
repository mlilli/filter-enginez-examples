/**
 * eslint.config.js
 * Location: packages/site
 *
 * Two runtimes in one package, so two scopes:
 *
 * - **The Cloudflare Worker** (`src/*.ts`) and the Vite config run with no DOM, so the package takes
 *   the `nodeIsomorphic` preset, as `examples-server` does — including its
 *   `@filter-enginez/no-browser-api-in-core` rule.
 * - **The home, how-it-works and compare pages** (`src/home/`, `src/how-it-works/`, `src/compare/`)
 *   are browser code that builds DOM. For them
 *   the preset's isomorphic-boundary rule is switched off and the browser globals are on, which is
 *   exactly what the framework-free demo app composes from `base` + `globals.browser`.
 *
 * `tsconfigRootDir` anchors the preset's `allowDefaultProject` globs (`*.config.ts`) to this package,
 * so `vite.config.ts` resolves whether ESLint runs here (`turbo run lint`) or from the repo root (the
 * pre-commit hook's lint-staged pass). Each `.ts` file under `src/` is type-checked against the nearest
 * `tsconfig.json`: the Worker's at the package root, each page's in its own directory.
 */
import { nodeIsomorphic } from '@filter-enginez/eslint/config';
import globals from 'globals';

export default [
	{
		ignores: ['.wrangler/**', 'dist/**'],
	},
	...nodeIsomorphic,
	{
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	{
		files: ['src/compare/**/*.ts', 'src/home/**/*.ts', 'src/how-it-works/**/*.ts'],
		languageOptions: {
			globals: {
				...globals.browser,
			},
		},
		rules: {
			'@filter-enginez/no-browser-api-in-core': 'off',
		},
	},
];
