/**
 * Package-local Vitest config — component tests need `@vitejs/plugin-vue` in the transform pipeline
 * (the root workspace vitest config doesn't carry the Vue plugin), plus jsdom + the browser export
 * conditions so `@vue/test-utils` mounts real components against the workspace `@filter-enginez/*`
 * sources. Mirrors `examples-sveltekit/vitest.config.ts` (minus the SvelteKit `$lib` alias — the Vue
 * app imports by relative path).
 */
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

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
	},
});
