/**
 * `how-it-works/benchmarkEngine` — the half of the live benchmark that needs the engine, loaded on
 * demand.
 *
 * @remarks
 * The workload builds a real engine (`@filter-enginez/core`, with the fuzzy-search and R-tree libraries
 * it carries: about 100 kB minified) and runs it over the 10,000-wine corpus. None of that is needed to
 * read the page, and the widget shows the committed reference numbers until a live measurement
 * replaces them. So the widget imports this module with a dynamic `import()` when it nears the viewport
 * or is used (`benchmarkWidget.ts`), and the build puts the engine in a chunk of its own that no page
 * loads at startup.
 *
 * Before the first measurement, the loader awaits {@link prepareBitmapAcceleration}, which initializes
 * the engine's Roaring bitmaps: core fetches `roaring-wasm` (which the site declares, as the optional
 * peer it is) with an `import()` of its own, so the library is one more chunk fetched on demand. The
 * build checks that neither the engine nor the library is on any page's startup graph
 * (`src/startupGraph.ts`).
 *
 * Everything the widget imports statically — the timing arithmetic, the reference numbers, the
 * formatting, the status wording — comes from the same subpath without the engine: `vite.config.ts`
 * tells the bundler those modules and the engine run nothing at import, so an import that uses none of
 * the engine's exports does not load it.
 *
 * @packageDocumentation
 */

export { loadWineCorpus, measureConfig, prepareBitmapAcceleration } from '@filter-enginez/examples-shared/how-it-works';
