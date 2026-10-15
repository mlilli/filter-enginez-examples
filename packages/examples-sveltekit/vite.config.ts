/**
 * Vite configuration for `@filter-enginez/examples-sveltekit`.
 *
 * @remarks
 * The `sveltekit()` plugin wires routing, SSR, and the Svelte compiler. Workspace `@filter-enginez/*`
 * packages resolve via pnpm symlinks (their `.ts`/`.svelte` sources compile through Vite directly);
 * `optimizeDeps` is left default so source changes in those packages aren't snapshotted/stale.
 */

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// Leaflet is pre-bundled deliberately. It arrives through a DYNAMIC import (the geo section is
	// loaded on demand), so without this Vite discovers it mid-session, re-optimizes, and forces a full
	// page reload — which presents as "the map crashed the first time and worked after". The workspace
	// `@filter-enginez/examples-*` packages must stay out of this list, or Vite snapshots their source
	// once and serves it stale; engine packages are installed tarballs, so pre-bundling one is safe.
	//
	// The wine worker's corpus generator is pre-bundled for the same reason. The worker is a separate
	// module graph (`?worker`), so the scan at server start never sees its imports: the first visit to
	// /wine discovers `@filter-enginez/mock-data/wine/generator`, re-optimizes, and reloads EVERY open
	// page of this app mid-session. tests/tooling/wineWorkerPrebundle.test.ts keeps this list in step
	// with the worker's imports.
	optimizeDeps: {
		include: ['leaflet', '@filter-enginez/mock-data/wine/generator'],
	},
	plugins: [sveltekit()],
	server: {
		fs: {
			// The workspace `@filter-enginez/*` packages (and brand's `.ttf` fonts referenced by
			// `tokens.css`) live above the app dir; allow the workspace root so SSR + the dev server can
			// read + serve them.
			allow: ['../..'],
		},
		// A dedicated port so it runs alongside every other vertical. Canonical port map lives in
		// `playwright.config.ts`; RTK is 5191 and plain React is 5193.
		host: '127.0.0.1',
		port: 5192,
		strictPort: true,
	},
	ssr: {
		/**
		 * SvelteKit renders server-side, so it imports the workspace packages during SSR. Left external,
		 * Node's ESM loader resolves their SOURCE `.js`-extension imports (the nodenext convention —
		 * `import './rules/index.js'` where the file is `index.ts`) against the filesystem and fails
		 * ("Cannot find module .../rules/index.js"). Forcing `noExternal` makes Vite TRANSFORM them
		 * through its resolver instead (which maps `.js` → `.ts` for source packages), the same way the
		 * client build already does.
		 *
		 * `lz-string` (a transitive dep of `url-state-router`'s compact serializer) is a CommonJS module;
		 * left external, Node's ESM loader can't pull its NAMED exports during SSR
		 * (`decompressFromEncodedURIComponent`). `noExternal` makes Vite transform it + synthesize the
		 * named-export interop.
		 */
		/**
		 * `roaring-wasm` must stay EXTERNAL, and leaving it to the default is not enough.
		 *
		 * @remarks
		 * It is a CommonJS package whose Node entry calls `require('fs')` and `require('path')` at
		 * module scope. `noExternal` on `@filter-enginez/*` pulls `core` into the SSR bundle, and
		 * `core` imports this — so it came along and was CJS-shimmed by the bundler.
		 *
		 * **The shim rolldown emits for it is self-recursive**, which is a production-build-only
		 * infinite loop rather than a warning:
		 *
		 * ```js
		 * var __require = ((x) => "u" > typeof __require ? __require : new Proxy(x, {
		 *   get(a, b) { return ("u" > typeof __require ? __require : a)[b]; }
		 * }))(function (x) { … });
		 * ```
		 *
		 * Once `__require` IS the proxy, `typeof __require` is `'function'`, the guard passes, and the
		 * trap reads `__require[b]` — itself. The target's own `__require.apply(...)` is a property
		 * GET, so calling it recurses too. The build died with `RangeError: Maximum call stack size
		 * exceeded` and a stack of nothing but `Object.get`.
		 *
		 * Externalizing hands it back to Node, which loads CommonJS natively and needs no shim. The
		 * WASM binary is `readFileSync`'d from disk at runtime, which only works when the package is
		 * on disk rather than inlined — so external is also the semantically correct answer, not just
		 * the one that stops the crash.
		 */
		external: ['roaring-wasm'],
		noExternal: [/^@filter-enginez\//u, 'lz-string'],
	},
	/**
	 * Worker chunk configuration — required by `/wine`.
	 *
	 * @remarks
	 * `wine.worker.ts` reaches `@filter-enginez/mock-data/wine`, whose `data.ts` opens with a
	 * TOP-LEVEL AWAIT. Vite defaults workers to the `iife` output format, which cannot express that,
	 * so without `format: 'es'` `vite build` — this package's `build` script, which `pnpm build` runs
	 * through turbo — fails with `[UNSUPPORTED_FEATURE] Top-level await is currently not supported
	 * with the 'iife' output format`.
	 *
	 * **The dev server does not reproduce it.** Vite serves workers as ES modules in dev, so `/wine`
	 * works there either way; only the production build needs this block.
	 *
	 * Every Vite app that serves `/wine` carries the same block, and
	 * `tests/tooling/wineWorkerFormat.test.ts` pins all of them.
	 */
	worker: {
		format: 'es',
	},
});
