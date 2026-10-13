/**
 * eslint.config.js
 * Location: packages/examples-vue
 *
 * The shared `base` preset lints the app's `.ts` (entry, router, tests + ambient shims);
 * `eslint-plugin-vue` (flat/recommended) lints the `.vue` components (template + Vue best-practices,
 * with `<script lang="ts">` parsed by the TS parser). Type-aware `.vue` checking is left to `vue-tsc`
 * (the `typecheck` script) — the `.vue` ESLint pass here is syntax/style only, so it stays fast + avoids
 * the typed-lint `projectService` needing every `.vue` in a tsconfig program. Mirrors how the SvelteKit
 * app wires `eslint-plugin-svelte` + `svelte-eslint-parser`.
 *
 * Ignores build output + the root config files (outside the app's tsconfig program, so the typed-lint
 * projectService can't attribute them).
 */
import { base } from '@filter-enginez/eslint/config';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
	{
		ignores: ['.wrangler/**', 'dist/**', 'vite.config.ts', 'vitest.config.ts', 'env.d.ts'],
	},
	...base,
	...vue.configs['flat/recommended'],
	{
		// The app's `.ts` (entry + router) is browser-facing, so it gets the browser globals the `base`
		// preset withholds from isomorphic code.
		files: ['src/**/*.ts'],
		languageOptions: {
			globals: {
				...globals.browser,
			},
		},
	},
	{
		files: ['**/*.vue'],
		languageOptions: {
			// The `.vue` components are browser-only (the DOM-facing tier of the app), so they get the
			// browser globals the `base` preset withholds from isomorphic code.
			globals: {
				...globals.browser,
			},
			parserOptions: {
				// Parse `<script lang="ts">` with the TS parser, but WITHOUT a project (syntax-only — no
				// type-aware rules on `.vue`; `vue-tsc` owns type correctness).
				extraFileExtensions: ['.vue'],
				parser: tseslint.parser,
				project: false,
				projectService: false,
			},
		},
		plugins: {
			// Register the typescript-eslint plugin for `.vue` so its (type-info-free) `no-unused-vars`
			// can replace the base rule — the base one false-positives on interface method-signature param
			// names (which are type positions, not real bindings).
			'@typescript-eslint': tseslint.plugin,
		},
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			// Defer to the TS-aware unused-vars rule (see the plugin note above).
			'no-unused-vars': 'off',
			// ─── Formatting rules delegated to Prettier ─────────────────────────────────────────────
			// Prettier owns `.vue` formatting (tabs, per the repo `.prettierrc`), so eslint-plugin-vue's
			// template-formatting rules are turned off to avoid a Prettier↔ESLint fight in `lint:fix`
			// (the same division of labor the base preset uses: `@stylistic`/Prettier own layout, ESLint
			// owns correctness). This is the `eslint-config-prettier`-for-Vue exclusion set, inlined
			// (that package isn't a workspace dep). Vue best-practice/correctness rules stay on.
			'vue/first-attribute-linebreak': 'off',
			'vue/html-closing-bracket-newline': 'off',
			'vue/html-closing-bracket-spacing': 'off',
			'vue/html-indent': 'off',
			'vue/html-quotes': 'off',
			'vue/html-self-closing': 'off',
			'vue/max-attributes-per-line': 'off',
			// Single-word `App.vue` is the conventional root component name; the other SFCs are multi-word.
			'vue/multi-word-component-names': 'off',
			'vue/multiline-html-element-content-newline': 'off',
			'vue/mustache-interpolation-spacing': 'off',
			'vue/no-multi-spaces': 'off',
			'vue/no-spaces-around-equal-signs-in-attribute': 'off',
			// Props are typed via `defineProps<T>()`; an optional prop legitimately defaults to `undefined`,
			// so a runtime default isn't required (vue-tsc validates the prop contract).
			'vue/require-default-prop': 'off',
			'vue/singleline-html-element-content-newline': 'off',
		},
	},
];
