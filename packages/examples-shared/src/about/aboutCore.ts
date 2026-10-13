/**
 * `@filter-enginez/examples-shared/about-core` — the React-free heart of the About page, shared across
 * every framework vertical (React, SvelteKit, Vue, Angular and vanilla).
 *
 * @remarks
 * Re-exports the narrative content model (`aboutContent`) plus the benchmark's pure engine workload,
 * timing statistics, and reference data — all framework-agnostic. A non-React consumer imports
 * everything it needs to render the About page (copy, section order, figure ids) and drive the live
 * benchmark (measure + assess) from this one subpath, then supplies only its own figures + widget
 * markup. The exact shared-slice split as `notfound-core`.
 *
 * @packageDocumentation
 */

export * from './aboutContent.js';
export * from './benchmark/benchmarkTiming.js';
export * from './benchmark/benchmarkWorkload.js';
export * from './benchmark/referenceResults.js';
