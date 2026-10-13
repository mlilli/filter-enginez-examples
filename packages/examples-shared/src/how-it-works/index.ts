/**
 * `@filter-enginez/examples-shared/how-it-works` — the content and the live benchmark workload of the
 * "How the engine works" page at filterenginez.com/how-it-works.
 *
 * @remarks
 * React-free and DOM-free at import time: the band copy, the act-two divider and the lab links
 * (`content.ts`), plus the benchmark's engine workload, timing statistics and committed reference
 * numbers. The landing site (`packages/site`) renders the text into static HTML at build time from this
 * subpath and mounts its framework-free figures and benchmark widget over it in the browser. Pinned
 * React-free by `tests/tooling/reactFreeSubpaths.test.ts`.
 *
 * @packageDocumentation
 */

export * from './benchmark/benchmarkTiming.js';
export * from './benchmark/benchmarkWorkload.js';
export * from './benchmark/referenceResults.js';
export * from './content.js';
