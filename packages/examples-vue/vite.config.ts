/**
 * Vite configuration for `@filter-enginez/examples-vue`.
 *
 * @remarks
 * The Vue 3 SPA vertical. Workspace `@filter-enginez/*` packages resolve via pnpm symlinks (their
 * `.ts` sources compile through Vite directly — a client build needs no `ssr.noExternal`, unlike the
 * SvelteKit app). `@preact/signals-core` is DEDUPED: the engine's internal signals + the `vue-signals`
 * adapter must share one copy, or `.subscribe`/`.value` cross-instance boundaries silently break. A
 * dedicated port so it runs alongside every other vertical — RTK 24611, SvelteKit 24612, plain React
 * 24613. The canonical port map lives in `playwright.config.ts`.
 */

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		sourcemap: true,
		target: 'es2022',
	},
	// Some transitive CJS deps probe `process.env` / `global` at module top; inline the browser-safe
	// substitutions (same rationale as the React apps' config).
	define: {
		global: 'globalThis',
		'process.env': '{}',
		'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] ?? 'development'),
	},
	// Leaflet is pre-bundled deliberately. It arrives through a DYNAMIC import (the geo section is
	// loaded on demand), so without this Vite discovers it mid-session, re-optimizes, and forces a full
	// page reload — which presents as "the map crashed the first time and worked after".
	// The wine worker's corpus generator is pre-bundled for the same reason. The worker is a separate
	// module graph (`?worker`), so the scan at server start never sees its imports: the first visit to
	// /wine discovers `@filter-enginez/mock-data/wine/generator`, re-optimizes, and reloads EVERY open
	// page of this app mid-session. tests/tooling/wineWorkerPrebundle.test.ts keeps this list in step
	// with the worker's imports.
	optimizeDeps: {
		include: ['leaflet', '@filter-enginez/mock-data/wine/generator'],
	},
	plugins: [vue()],
	resolve: {
		// One @preact/signals-core instance across the engine + the vue-signals adapter (load-bearing).
		//
		// `comlink` is deduped for the same class of reason and a worse failure. Comlink marks
		// proxy-able callbacks with `Symbol('Comlink.proxy')` — a private, per-module-instance symbol.
		// Two chunks each importing comlink means two `proxyMarker` symbols: `proxy()` marks a callback
		// with chunk A's, `wrapInWorker`'s transfer handler looks for chunk B's, finds nothing, and falls
		// back to `structuredClone(fn)`, which throws "could not be cloned". The wine route's engine is
		// the worker-backed one here.
		dedupe: ['@preact/signals-core', 'comlink'],
	},
	server: {
		host: '127.0.0.1',
		port: 24614,
		strictPort: true,
	},
	/**
	 * Worker chunk configuration.
	 *
	 * @remarks
	 * `format: 'es'` forces ES-module workers. Comlink and the wine worker's import graph need ESM, and
	 * Vite's default is IIFE — which cannot `import` other modules at all, so the worker fails to load
	 * rather than misbehaving. Both React apps carry the identical block for the identical reason; here
	 * it serves `/wine`, this app's worker-backed engine.
	 *
	 * SvelteKit gets away without one because `@sveltejs/kit/vite` sets it; a plain Vue SPA does not.
	 */
	worker: {
		format: 'es',
	},
});
