/**
 * Barrel for the eight algorithm illustrations the documentation's `/docs/algorithms/:id` pages render.
 *
 * @remarks
 * Each is a self-contained, prop-less, browser-only React component rendering hand-authored inline
 * SVG over the `fe-fig-*` classes in `@filter-enginez/ui-styles/figures.css` — the same classes the
 * framework-free figures on filterenginez.com/how-it-works render over, so both animate identically. They honor the brand's cyan (data) / phosphor (compute) contract and
 * degrade to a legible static frame under `prefers-reduced-motion`.
 *
 * @packageDocumentation
 */

export { BayesianSuggestFigure } from './BayesianSuggestFigure.js';
export { BloomFilterFigure } from './BloomFilterFigure.js';
export { ExclusionGraphFigure } from './ExclusionGraphFigure.js';
export { MemoizedSimulationFigure } from './MemoizedSimulationFigure.js';
export { RoaringBitmapsFigure } from './RoaringBitmapsFigure.js';
export { RTreeFigure } from './RTreeFigure.js';
export { SimilarityFigure } from './SimilarityFigure.js';
export { TextIndexFigure } from './TextIndexFigure.js';
