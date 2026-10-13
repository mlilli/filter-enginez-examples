/**
 * eslint.config.js
 * Location: packages/examples-sveltekit
 *
 * The shared `base` preset lints the app's `.ts` (component tests + ambient shims); `eslint-plugin-svelte`
 * lints the `.svelte` components (style + Svelte best-practices, with `<script lang="ts">` parsed by the
 * TS parser). Type-aware `.svelte` checking is left to `svelte-check` (the `typecheck` script) — the
 * `.svelte` ESLint pass here is syntax/style only, so it stays fast + avoids the typed-lint
 * `projectService` needing every `.svelte` in a tsconfig program.
 *
 * Ignores SvelteKit-generated output (`.svelte-kit/`, `build/`) + the root config files (outside the
 * app's tsconfig program, so the typed-lint `projectService` can't attribute them).
 */
import { base } from '@filter-enginez/eslint/config';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';
import tseslint from 'typescript-eslint';

export default [
	{
		ignores: ['.svelte-kit/**', '.wrangler/**', 'build/**', 'static/**', 'svelte.config.js', 'vite.config.ts', 'vitest.config.ts'],
	},
	...base,
	...svelte.configs.recommended,
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			// The `.svelte` components are browser-only (the DOM-facing tier of the app), so they get the
			// browser globals the `base` preset withholds from isomorphic code — the same treatment the
			// shared `react` preset gives its browser components.
			globals: {
				...globals.browser,
			},
			parser: svelteParser,
			parserOptions: {
				// Parse `<script lang="ts">` with the TS parser, but WITHOUT a project (syntax-only — no
				// type-aware rules on `.svelte`; `svelte-check` owns type correctness).
				extraFileExtensions: ['.svelte'],
				parser: tseslint.parser,
				project: false,
				projectService: false,
			},
		},
		plugins: {
			// Register the typescript-eslint plugin for `.svelte` so its (type-info-free) `no-unused-vars`
			// can replace the base rule — the base one false-positives on interface method-signature param
			// names (which are type positions, not real bindings).
			'@typescript-eslint': tseslint.plugin,
		},
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			// Defer to the TS-aware unused-vars rule (see the plugin note above); the base one mis-flags
			// callback-prop param names in `interface Props` type declarations.
			'no-unused-vars': 'off',
			// This app deploys at the domain root (no SvelteKit `base` path), so plain internal `href`s
			// are correct + safe. The rule guards subpath deploys — off to keep the demo's nav links clean.
			'svelte/no-navigation-without-resolve': 'off',
		},
	},
];
