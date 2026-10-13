/**
 * `@filter-enginez/examples-shared/wine-core` — the React-FREE slice of the wine example.
 *
 * @remarks
 * The wine barrel (`./wine`) mixes engine orchestration with sixteen React components, so importing
 * it drags React in. This subpath exposes only the orchestration, mirroring `./books-core`.
 *
 * ### It is bundler-neutral
 *
 * A `?worker` import at module scope would make this subpath impossible for Angular to import. That is
 * a BUILD-time constraint, not a runtime one: esbuild resolves every static import it sees, whether or
 * not the code path runs, so no amount of conditionality helps. The import lives alone in
 * `./wine-worker-spawn`, and `bootWineEngine` takes both bundler-specific inputs as options:
 *
 *   - **Vite verticals** (both React apps, SvelteKit, Vue, vanilla) pass `spawnWineWorker` from
 *     `@filter-enginez/examples-shared/wine-worker-spawn` and let `datasetSize` default to the
 *     `VITE_WINE_TIER` reading.
 *   - **Angular** supplies its own worker spawn and its own `datasetSize`, because `@angular/build`
 *     defines none of Vite's `import.meta.env` constants either.
 *
 * The worker tier THROWS when `spawnWorker` is missing rather than falling back to the main thread —
 * a silent 130k main-thread boot works, freezes the tab, and retires the point of the vertical.
 *
 * ### Under SvelteKit, import it DYNAMICALLY
 *
 * The app's `vite.config.ts` sets `ssr.noExternal: [/^@filter-enginez\//]`, so an import of this
 * module at page-module scope is evaluated during SSR — where there is no `Worker` constructor and
 * the `?worker` default export does not exist. `import()` it inside `onMount`, the way
 * `/books-server` does for its comlink graph. That is not a style preference: a static import
 * is a hard SSR failure, not a no-op.
 *
 * @packageDocumentation
 */

export { buildWineEngine } from './buildWineEngine.js';
export {
	describeWineCorpusTier,
	EXPECTED_FULL_CORPUS_SIZE,
	loadWineCorpus,
	PROGRESS_REPORT_EVERY,
	type WineCorpusSource,
	type WineWorkerCallbacks,
} from './wineCorpusLoader.js';
export {
	bootWineAsyncEngine,
	bootWineEngine,
	describeBootedWineCorpusTier,
	getWineBootProgressSnapshot,
	subscribeWineBootProgress,
	type WineAsyncEngineBundle,
	type WineBootOptions,
	type WineBootProgress,
	type WineEngineBundle,
} from './wineEngine.js';
