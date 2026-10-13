/**
 * eslint.config.js
 * Location: packages/examples-vanilla
 *
 * The shared `base` preset lints the whole app — there is no framework plugin to add, since this
 * vertical is deliberately framework-less (plain `.ts` building DOM by hand). That makes this the
 * simplest example-app lint config in the monorepo: `base` + browser globals.
 *
 * Ignores build output + the root config files (outside the app's tsconfig program, so the typed-lint
 * projectService can't attribute them).
 */
import { base } from '@filter-enginez/eslint/config';
import globals from 'globals';

export default [
	{
		ignores: ['.wrangler/**', 'dist/**', 'vite.config.ts', 'env.d.ts'],
	},
	...base,
	{
		// The whole app is browser-facing (it manipulates the DOM directly), so it gets the browser
		// globals the `base` preset withholds from isomorphic code.
		files: ['src/**/*.ts'],
		languageOptions: {
			globals: {
				...globals.browser,
			},
		},
	},
];
