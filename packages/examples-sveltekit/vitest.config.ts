/**
 * Package-local Vitest config — component tests need the Svelte compiler in the transform pipeline
 * (the root workspace vitest config doesn't carry the svelte plugin), plus jsdom + the browser export
 * conditions so `@testing-library/svelte` mounts real components. The `$lib` alias mirrors SvelteKit's
 * own so route/lib components (which import via `$lib/...`) resolve under test.
 */
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [svelte({ hot: false })],
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
		},
		conditions: ['browser'],
	},
	test: {
		environment: 'jsdom',
		globals: false,
	},
});
