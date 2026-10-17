/**
 * `how-it-works/benchmarkEngine` — the half of the live benchmark that needs the engine, loaded on
 * demand.
 *
 * @remarks
 * The workload builds a real engine (`@filter-enginez/core`, with the WebAssembly bitmap library, the
 * fuzzy-search and R-tree libraries it carries: about 350 kB minified) and runs it over the 10,000-wine
 * corpus. None of that is needed to read the page, and the widget shows the committed reference
 * numbers until a live measurement replaces them. So the widget imports this module with a dynamic
 * `import()` when it nears the viewport or is used (`benchmarkWidget.ts`), and the build puts the
 * engine in a chunk of its own that no page loads at startup. The build checks that it stays out of
 * every page's startup graph (`src/startupGraph.ts`).
 *
 * Everything the widget imports statically — the timing arithmetic, the reference numbers, the
 * formatting — comes from the same subpath without the engine: `vite.config.ts` tells the bundler
 * those modules and the engine run nothing at import, so an import that uses none of the engine's
 * exports does not load it.
 *
 * @packageDocumentation
 */

export { loadWineCorpus, measureConfig } from '@filter-enginez/examples-shared/how-it-works';
