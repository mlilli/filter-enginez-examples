/**
 * Vite configuration for `@filter-enginez/examples-vanilla`.
 *
 * @remarks
 * The framework-less vertical: **no framework plugin at all** — the entire UI is hand-written DOM over
 * the engine's reactive surface. Workspace `@filter-enginez/*` packages resolve via pnpm symlinks (their
 * `.ts` sources compile through Vite directly; a client build needs no `ssr.noExternal`).
 *
 * `@preact/signals-core` is DEDUPED: the engine's internal signals and this app's direct
 * `.subscribe`/`.value` reads must share ONE copy, or cross-instance boundaries silently break (the same
 * load-bearing rule the Vue + Svelte verticals document). This app is the one place that matters most,
 * since it subscribes to the raw signals with no adapter in between.
 *
 * A dedicated port so it runs alongside every other vertical — Angular 24610, RTK 24611, SvelteKit 24612,
 * plain React 24613, Vue 24614. The canonical port map lives in `playwright.config.ts`.
 */

import { defineConfig } from 'vite';

import { fontPreloadsPlugin } from '../../scripts/lib/font-preloads.mjs';

export default defineConfig({
	build: {
		sourcemap: true,
		target: 'es2022',
	},
	// Some transitive CJS deps probe `process.env` / `global` at module top; inline the browser-safe
	// substitutions (same rationale as the other example apps' configs).
	define: {
		global: 'globalThis',
		'process.env': '{}',
		'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] ?? 'development'),
	},
	// Leaflet is pre-bundled deliberately. It arrives through a DYNAMIC import (the geo section loads
	// the shared radius-map controller on demand), so without this Vite discovers it mid-session,
	// re-optimizes, and forces a full page reload — which presents as "the map crashed the first time
	// and worked after".
	// The wine worker's corpus generator is pre-bundled for the same reason. The worker is a separate
	// module graph (`?worker`), so the scan at server start never sees its imports: the first visit to
	// /wine discovers `@filter-enginez/mock-data/wine/generator`, re-optimizes, and reloads EVERY open
	// page of this app mid-session. tests/tooling/wineWorkerPrebundle.test.ts keeps this list in step
	// with the worker's imports.
	optimizeDeps: {
		include: ['leaflet', '@filter-enginez/mock-data/wine/generator'],
	},
	// Preload the first screen's two brand fonts from the built index.html, so they download beside the
	// startup script instead of after the stylesheet (scripts/lib/font-preloads.mjs).
	plugins: [fontPreloadsPlugin()],
	resolve: {
		// ONE @preact/signals-core instance across the engine + this app's direct subscriptions.
		dedupe: ['@preact/signals-core'],
	},
	server: {
		host: '127.0.0.1',
		port: 24615,
		/**
		 * Proxy `/api/*` to the `@filter-enginez/examples-server` Node process (start it with
		 * `pnpm --filter @filter-enginez/examples-server serve:api`).
		 *
		 * @remarks
		 * This is what powers `/wine-server`: the browser calls same-origin `/api/query`, Vite forwards
		 * it to `http://localhost:24618/query`, so there is no CORS and the base URL stays a dev-server
		 * concern rather than something baked into a bundle. Copied deliberately from
		 * `examples-react-rtk`'s `/books-server` arrangement rather than invented — the two routes are
		 * the same transport over different datasets.
		 *
		 * **`pnpm dev` does not start that process**, so the proxy erroring is the ordinary local case
		 * rather than an exotic one, and `/wine-server` renders a named offline state for it.
		 */
		proxy: {
			'/api': {
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, ''),
				target: 'http://localhost:24618',
			},
		},
		strictPort: true,
	},
	/**
	 * Worker chunk configuration — required by `/wine`, and it fails ONLY in a production build.
	 *
	 * @remarks
	 * `wine.worker.ts` reaches `@filter-enginez/mock-data/wine`, whose `data.ts` opens with a
	 * TOP-LEVEL AWAIT (`export const wines = await loadDefaultWines()`). Vite defaults workers to the
	 * `iife` output format, which cannot express that, so `vite build` stops with
	 * `[UNSUPPORTED_FEATURE] Top-level await is currently not supported with the 'iife' output format`.
	 *
	 * **The dev server does not reproduce it.** Vite serves workers as ES modules in dev, so `/wine`
	 * looks entirely healthy there — this is one of the failures only a production build can see.
	 *
	 * The two React apps and Vue carry the same block for the same route. Comlink also needs real
	 * module workers to import its own graph, so `'es'` is load-bearing twice over.
	 */
	worker: {
		format: 'es',
	},
});
