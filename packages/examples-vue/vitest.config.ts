/**
 * Package-local Vitest config — component tests need `@vitejs/plugin-vue` in the transform pipeline
 * (the root workspace vitest config doesn't carry the Vue plugin), plus jsdom + the browser export
 * conditions so `@vue/test-utils` mounts real components against the workspace `@filter-enginez/*`
 * sources. Mirrors `examples-sveltekit/vitest.config.ts` (minus the SvelteKit `$lib` alias — the Vue
 * app imports by relative path).
 */
import vue from '@vitejs/plugin-vue';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [vue()],
	resolve: {
		conditions: ['browser'],
		// One @preact/signals-core instance across the engine + the vue-signals adapter (load-bearing).
		dedupe: ['@preact/signals-core'],
	},
	test: {
		environment: 'jsdom',
		globals: false,
		// The async-wait and per-test budgets every unit-test runner here shares, and the test proving they
		// apply in this runner: `tests/setup/asyncWaits.ts` explains both.
		include: [...configDefaults.include, '../../tests/setup/asyncWaits.test.ts'],
		setupFiles: ['../../tests/setup/asyncWaits.ts'],
	},
});
