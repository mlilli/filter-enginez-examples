/**
 * Package-local Vitest config — component tests need the Svelte compiler in the transform pipeline
 * (the root workspace vitest config doesn't carry the svelte plugin), plus jsdom + the browser export
 * conditions so `@testing-library/svelte` mounts real components. The `$lib` alias mirrors SvelteKit's
 * own so route/lib components (which import via `$lib/...`) resolve under test.
 *
 * SvelteKit's `$app/*` modules come from its own Vite plugin, which this config does not load, so
 * `$app/stores` is mapped to `test/appStores.ts`: a `page` store over jsdom's location, so a component
 * that reads `$page.url` (the header brand, the Compare button, the hub and error routes) mounts in a
 * test exactly as written. No other `$app/*` module is mapped; the app reads none in a component.
 */
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [svelte({ hot: false })],
	resolve: {
		alias: {
			'$app/stores': fileURLToPath(new URL('./test/appStores.ts', import.meta.url)),
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
		},
		conditions: ['browser'],
	},
	test: {
		environment: 'jsdom',
		globals: false,
	},
});
