/**
 * Vite configuration for `@filter-enginez/examples-react-plain`.
 *
 * @remarks
 * The plain app consumes the signals-surface workspace
 * packages (core + reactive-signals + react-signals + url-state-router + mock-data + brand) plus
 * the shared presentation (`react-ui` / `ui-styles`) and wine orchestration (`examples-shared`) —
 * NO Redux / redux-bridge (that's the RTK app's surface). Identical to the RTK config otherwise:
 * the same `comlink` dedupe (the wine worker boot crosses the postMessage boundary via
 * `examples-shared/wine`), the same `worker.format: 'es'`, and the same `process.env` shim.
 * Vite's workspace-aware resolver picks the linked packages up via pnpm symlinks; the
 * `@tailwindcss/vite` plugin handles Tailwind v4 inline.
 */

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { fontPreloadsPlugin } from '../../scripts/lib/font-preloads.mjs';

export default defineConfig({
	build: {
		sourcemap: true,
		// ESM target — Vite's default; we're explicit so any TC39-stage features we use stay
		// gated to runtimes that actually support them.
		target: 'es2022',
	},
	/**
	 * Inject Node-style globals that browser-side bundles otherwise reference at the top of
	 * CommonJS-flavored deps. Without these, the dev server runs but the page throws
	 * `ReferenceError: process is not defined` from the `debug` package (transitive dep of MSW,
	 * react-redux, and several radix-ui packages) on its first `process.env.DEBUG` read.
	 *
	 * The replacement values are inlined at bundle time — `process.env.NODE_ENV` becomes the
	 * string literal "development" / "production" depending on Vite mode. Other `process.env.X`
	 * reads land on the empty object stub and return `undefined`, which is the correct semantic
	 * for "no env var set" in a browser context.
	 *
	 * `global` → `globalThis` is the Node-vs-browser global-object alias; some older CJS deps
	 * reach for `global` directly when they probe their environment.
	 */
	define: {
		global: 'globalThis',
		'process.env': '{}',
		'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] ?? 'development'),
	},
	/**
	 * Optimization hints for the dev-server pre-bundle.
	 *
	 * **Workspace packages are deliberately NOT included.** When pnpm-linked workspace
	 * packages with `.ts` source exports (every `@filter-enginez/*` package) are placed in
	 * `optimizeDeps.include`, Vite snapshots them once on first server start and serves
	 * that pre-bundled snapshot on every subsequent request. Source-file changes inside
	 * those packages are NOT picked up until the `.vite/` cache is manually cleared — which
	 * looks like "I fixed the bug but my fix isn't taking effect" to anyone iterating on
	 * workspace internals. Vite's standard pipeline handles `.ts` source from workspace
	 * symlinks correctly without pre-bundling; the cost is a few extra module fetches on
	 * first page load, which is invisible at normal repo scale.
	 *
	 * **No transitive deps.** Listing transitive (non-direct-dep) packages in
	 * `optimizeDeps.include` produces a "Failed to resolve dependency" warning under
	 * Rolldown's stricter resolver. `debug` needs no entry because the top-level `define`
	 * block handles `process.env` at substitution time; `roaring-wasm` is core's dependency,
	 * loaded through `initializeBitmapAcceleration()` (inside `wine.worker.ts` for the wine
	 * worker tier, where Vite's worker-bundle pipeline resolves + ships the WASM asset).
	 *
	 * **No `esbuildOptions`.** Deprecated in favor of `rolldownOptions` since Vite 8 adopted
	 * Rolldown for the pre-bundle pass; the top-level `define` block already covers
	 * `global: 'globalThis'`.
	 */
	optimizeDeps: {
		include: [
			'react',
			'react-dom',
			'react-dom/client',
			// The geo-radius map uses Leaflet directly (aliased to its ESM build under `resolve.alias`)
			// through the shared `examples-shared/real-estate-map` controller. The controller calls
			// Leaflet's own API, so no React binding (`react-leaflet`) is needed.
			'leaflet',
			// The wine worker's corpus generator (an engine package, not workspace source). The worker is a
			// separate module graph (`?worker`), so the scan at server start never sees its imports: without
			// this the first visit to /wine discovers it, re-optimizes, and reloads EVERY open page of this
			// app mid-session. tests/tooling/wineWorkerPrebundle.test.ts keeps this in step with the worker.
			'@filter-enginez/mock-data/wine/generator',
		],
	},
	plugins: [
		// React 19 + new-JSX-transform support
		react(),
		// Tailwind v4 — replaces the v3 PostCSS plugin; reads `@import "tailwindcss"` directly
		// from the globals.css file and produces the on-demand utility set.
		tailwindcss(),
		// Preload the first screen's two brand fonts from the built index.html, so they download beside
		// the startup scripts instead of after the stylesheet (scripts/lib/font-preloads.mjs).
		fontPreloadsPlugin(),
	],
	// Workspace deps are linked via pnpm — Vite's deduplication keeps a single React copy.
	// Bitmap acceleration is provided by `roaring-wasm` (browser + Node + Deno via WASM);
	// no per-app shim is needed — core wires the WASM library directly via its `roaringInit`
	// adapter, and each engine boot awaits `initializeBitmapAcceleration()` until the WASM
	// module is ready.
	resolve: {
		// `comlink` deduplication is LOAD-BEARING for the worker-bridge. Comlink uses
		// `Symbol("Comlink.proxy")` (a private, per-module-instance symbol) to mark
		// callbacks that should be proxied across the postMessage boundary. If Vite emits
		// two chunks each importing comlink, each chunk has its own `proxyMarker` instance —
		// the proxy() call marks the function with chunk-A's symbol, wrapInWorker's
		// transfer handler checks for chunk-B's symbol, sees no mark, falls back to
		// structuredClone(fn) which throws "could not be cloned". Dedupe forces one copy.
		dedupe: ['react', 'react-dom', '@preact/signals-core', 'comlink'],
	},
	server: {
		// Plain HTTP on the loopback address; no TLS certificate or host alias is involved.
		//
		// **24613, not 5173.** With `strictPort: true`, two apps on one port means the second to
		// start dies, so the six verticals hold six distinct ports — see the port map in
		// `playwright.config.ts`.
		host: '127.0.0.1',
		port: 24613,
		/**
		 * Proxy `/api/*` to the `@filter-enginez/examples-server` Node server (run it with
		 * `pnpm --filter @filter-enginez/examples-server serve:api`). This is what powers the
		 * server-backed `/books-server` route: the browser calls same-origin `/api/query`, Vite
		 * forwards it to `http://localhost:24618/query`, so there's no CORS and the base URL stays a
		 * dev-server concern. If the API isn't running the proxy errors and the route shows its
		 * offline state. Mirrors the RTK app's proxy.
		 */
		proxy: {
			'/api': {
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, ''),
				target: 'http://localhost:24618',
			},
		},
		// Strict so two devs can't accidentally share the same port + cookies cross-app.
		strictPort: true,
	},
	/**
	 * Worker chunk configuration.
	 *
	 * @remarks
	 * `wine.worker.ts` uses the `new URL('./worker.ts', import.meta.url)`
	 * pattern that Vite recognizes and code-splits into separate worker chunks. The `format: 'es'`
	 * forces ES-module workers — Comlink + our import graph need ESM, and Chrome/Firefox/Safari
	 * have all shipped Module Worker support. Without this, Vite defaults to IIFE workers, which
	 * can't `import` other modules.
	 */
	worker: {
		format: 'es',
	},
});
