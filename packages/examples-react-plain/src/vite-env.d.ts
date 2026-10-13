/**
 * Vite ambient type augmentations for the app.
 *
 * @remarks
 * Vite's `?worker` query is a build-time transform — at runtime the import resolves to a
 * `Worker` constructor class. tsc has no notion of this query suffix and rejects the import
 * specifier as an unknown module without this shim.
 *
 * Mirrors the official `vite/client` types (which we don't import wholesale because the
 * app has no need for the other shims in that bundle — `?url`, `?raw`, `?inline`,
 * `?svg-component`, etc.). Using more Vite query suffixes is the point at which to switch to
 * `/// <reference types="vite/client" />` here.
 *
 * @packageDocumentation
 */

/**
 * App-specific `import.meta.env` augmentation. We declare only what the app reads, rather
 * than pulling in all of `vite/client` (see the note above on why this file is a hand-rolled shim).
 */
interface ImportMetaEnv {
	/**
	 * Which wine dataset tier to boot.
	 *
	 *   - `'full'` (default when unset) — the full ~130k Kaggle corpus, streamed in a Web Worker.
	 *   - `'default'` — the bundled ~10k stratified tier, built on the main thread.
	 *
	 * Set at dev/build time, e.g. `pnpm dev:plain:default` (which sets `VITE_WINE_TIER=default`).
	 */
	readonly VITE_WINE_TIER?: 'default' | 'full';

	/** Vite's dev-vs-build flag. `true` under `vite dev`, `false` in a production build. */
	readonly DEV: boolean;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

/**
 * `?worker` import — Vite emits a separate worker chunk and exports a constructor.
 * `new WineWorker()` produces a fresh Web Worker instance.
 */
declare module '*?worker' {
	const workerConstructor: {
		new (options?: { name?: string }): Worker;
	};

	export default workerConstructor;
}

/**
 * `?worker&inline` — same as `?worker` but the worker payload is base64-inlined rather than
 * fetched as a separate chunk. Declared alongside `?worker` so either form typechecks.
 */
declare module '*?worker&inline' {
	const workerConstructor: {
		new (options?: { name?: string }): Worker;
	};

	export default workerConstructor;
}
