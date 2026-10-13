/// <reference lib="webworker" />
/**
 * Angular's wine worker entry — one import, on purpose.
 *
 * @remarks
 * The worker's actual behavior (WASM init, the three-tier corpus fetch, the engine factory, the
 * `exposeFilterEngineWorker` registration) lives in `@filter-enginez/examples-shared/wine-worker` and
 * is shared verbatim with every Vite vertical. Importing it for its SIDE EFFECT is the whole file:
 * that module registers the `wineEngine` factory at load, which is what the main thread's
 * `wrapInWorker({ factoryName: 'wineEngine' })` picks up.
 *
 * ## Why Angular needs a file at all when Vite verticals do not
 *
 * Vite spells "make this a worker chunk" as a `?worker` query on the import. `@angular/build` has no
 * such syntax; it recognizes `new Worker(new URL('./x.worker', import.meta.url), { type: 'module' })`,
 * and that URL must resolve to a file **inside this app**. A `new URL()` pointing into another
 * workspace package is not the pattern the builder detects.
 *
 * So this exists to be that file. It is deliberately not a re-implementation — the factory it triggers
 * is the same one React, SvelteKit and Vue run, which is the point of `examples-shared` owning it.
 *
 * The triple-slash reference is required and is not decoration: `tsconfig.app.json` declares no
 * `WebWorker` lib, so without it `self` in the imported module has the DOM's type rather than a
 * worker's.
 *
 * @packageDocumentation
 */

import '@filter-enginez/examples-shared/wine-worker';
