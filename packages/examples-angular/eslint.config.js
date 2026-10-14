/**
 * eslint.config.js
 * Location: packages/examples-angular
 *
 * Three layers, mirroring how the Vue app stacks `base` + `eslint-plugin-vue` and the SvelteKit app
 * stacks `base` + `eslint-plugin-svelte`:
 *
 *   1. the shared `base` preset (repo-wide TypeScript correctness + style),
 *   2. `angular-eslint`'s `tsRecommended` for the `.ts` — component/directive naming, lifecycle
 *      correctness, and the `inject()`-era best practices,
 *   3. `angular-eslint`'s `templateRecommended` + `templateAccessibility` for `.html` templates.
 *
 * The a11y template rules matter here: every other vertical gets its accessibility gate from
 * `eslint-plugin-jsx-a11y` (React), `eslint-plugin-vue` or `eslint-plugin-svelte`. Angular templates
 * would otherwise be the one surface in the monorepo with no lint gate at all, and the Playwright axe
 * assertions are a last line of defense, not a first one.
 *
 * Component/directive selector prefix is `fe` (Filter EngineZ), matching `angular.json`'s `prefix`.
 * Components select by kebab-case element (`fe-books-page`) or, where the host must be a native
 * element, by kebab-case attribute (`nav[fe-app-header-brand]`).
 *
 * ## Why `base` is re-scoped to `.ts` here
 *
 * `angular.processInlineTemplates` extracts each component's inline `template:` into a VIRTUAL file
 * with an `.html` extension (`app.component.ts/1_inline-template-….component.html`) so the template
 * rules can lint it. Several of the `base` preset's blocks are deliberately unscoped — they carry no
 * `files` key, so flat config applies them to *every* file ESLint sees, including those virtual
 * templates. Pointing a JavaScript formatting rule at an Angular template AST doesn't produce a lint
 * error; it produces a hard crash (`@stylistic/indent` calling `getFirstToken` on a node that has no
 * tokens).
 *
 * The fix is to say out loud what `base` already means: it is a TypeScript preset. Any of its blocks
 * that would otherwise apply universally gets scoped to `.ts`. This is done by transformation rather
 * than by editing the shared preset, because narrowing `base` at the source would silently change how
 * `.vue` and `.svelte` files lint in the other verticals — a much larger blast radius than this app.
 *
 * Global-ignores blocks (`ignores` only, no `rules`/`languageOptions`) are left alone: attaching
 * `files` to one would demote it from a global ignore to a scoped config and quietly stop it ignoring.
 */
import { base } from '@filter-enginez/eslint/config';
import angular from 'angular-eslint';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** `base`, with every otherwise-universal block pinned to TypeScript files. See the note above. */
const typescriptScopedBase = base.map((config) =>
	config.files === undefined && (config.rules !== undefined || config.languageOptions !== undefined)
		? { ...config, files: ['**/*.ts'] }
		: config,
);

export default [
	{
		ignores: ['dist/**', '.angular/**', '.wrangler/**'],
	},
	...typescriptScopedBase,
	{
		files: ['src/**/*.ts'],
		languageOptions: {
			// The app is browser-only, so it gets the browser globals the `base` preset withholds from
			// isomorphic code.
			globals: {
				...globals.browser,
			},
		},
		processor: angular.processInlineTemplates,
		rules: {
			// An Angular component/directive is a decorated class, and a root shell or a purely
			// declarative component legitimately has no members — the decorator IS the behavior. The rule
			// assumes a class with no members is a namespace in disguise, which doesn't hold here.
			'@typescript-eslint/no-extraneous-class': 'off',
			// Attribute selectors too, for a component whose host must be a native element: the header
			// brand is `nav[fe-app-header-brand]`, so the shared header markup's `<nav>` is the host
			// itself rather than a child of a custom element the header's flex row would lay out.
			'@angular-eslint/component-selector': [
				'error',
				{ prefix: 'fe', style: 'kebab-case', type: ['element', 'attribute'] },
			],
			'@angular-eslint/directive-selector': [
				'error',
				{ prefix: 'fe', style: 'camelCase', type: 'attribute' },
			],
		},
	},
	...angular.configs.tsRecommended.map((config) => ({ ...config, files: ['src/**/*.ts'] })),
	...angular.configs.templateRecommended.map((config) => ({ ...config, files: ['src/**/*.html'] })),
	...angular.configs.templateAccessibility.map((config) => ({ ...config, files: ['src/**/*.html'] })),
	{
		files: ['src/**/*.html'],
		languageOptions: {
			parser: angular.templateParser,
		},
	},
	{
		// Specs need no `parserOptions.project`: the shared `base` preset uses typescript-eslint's
		// `projectService`, which resolves each file to its owning tsconfig automatically — and setting
		// both is a hard parse error ("Enabling 'project' does nothing when 'projectService' is
		// enabled"). `tsconfig.json` includes `src/**/*.ts`, so specs already land in a real program.
		files: ['src/**/*.spec.ts'],
		plugins: {
			'@typescript-eslint': tseslint.plugin,
		},
		rules: {
			// A spec's throwaway host component legitimately has no members beyond its signals, and
			// TestBed fixtures are typed `any` at the seams by Angular's own API.
			'@typescript-eslint/no-extraneous-class': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
		},
	},
];
