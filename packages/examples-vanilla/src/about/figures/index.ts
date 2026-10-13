/**
 * `about/figures` — the barrel over the eight animated About-page algorithm figures plus the shared
 * in-view gate.
 *
 * @remarks
 * Each builder is a pure `() => HTMLElement` returning the figure root (`.fe-fig .fe-fig-*` with
 * `role="img"` and the same `aria-label` every other vertical ships). Builders deliberately do NOT
 * observe themselves — the About page maps its figures through {@link observeInView} once and keeps
 * the teardowns, so a single unmount tears every observer down.
 *
 * The figures are split one-per-module purely to stay under the repo's 500-line `max-lines` cap; this
 * barrel is the import surface.
 *
 * @packageDocumentation
 */

export { createBayesianSuggestFigure } from './bayes.js';
export { createBloomFilterFigure } from './bloom.js';
export { createExclusionGraphFigure } from './exclusion.js';
export { observeInView } from './inView.js';
export { createMemoizedSimulationFigure } from './memoized.js';
export { createRoaringBitmapsFigure } from './roaring.js';
export { createRTreeFigure } from './rtree.js';
export { createSimilarityFigure } from './similarity.js';
export { createTextIndexFigure } from './textIndex.js';
