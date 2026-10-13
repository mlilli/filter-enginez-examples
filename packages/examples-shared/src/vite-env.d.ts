/**
 * Vite ambient type augmentations for `@filter-enginez/examples-shared`.
 *
 * @remarks
 * This package holds the wine-domain orchestration shared by the example apps — including the
 * size-aware engine boot, which statically imports the worker via Vite's `?worker` query and reads
 * the dataset-tier env var. Both are build-time Vite transforms tsc has no notion of, so they're
 * declared here. Consuming apps process this package as source (workspace-linked, not pre-bundled),
 * so the `?worker` import resolves against each app's own Vite worker pipeline.
 *
 * @packageDocumentation
 */

/**
 * App-environment vars the shared orchestration reads. Apps set these at dev/build time.
 */
interface ImportMetaEnv {
	/**
	 * Which wine dataset tier to boot — `'full'` (default, ~130k, worker) or `'default'`
	 * (~10k bundled, main thread). See `wineEngine.ts` `resolveDatasetSize`.
	 */
	readonly VITE_WINE_TIER?: 'default' | 'full';
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

/**
 * `?worker` import — Vite emits a separate worker chunk and exports a constructor.
 */
declare module '*?worker' {
	const workerConstructor: {
		new (options?: { name?: string }): Worker;
	};

	export default workerConstructor;
}

/**
 * `?worker&inline` — same as `?worker` but base64-inlined rather than a separate chunk.
 */
declare module '*?worker&inline' {
	const workerConstructor: {
		new (options?: { name?: string }): Worker;
	};

	export default workerConstructor;
}

/**
 * Side-effect CSS imports (e.g. `import 'leaflet/dist/leaflet.css'`). Vite injects the stylesheet at
 * build time; tsc only needs the module to resolve. Consuming apps declare the same ambient.
 */
declare module '*.css';
