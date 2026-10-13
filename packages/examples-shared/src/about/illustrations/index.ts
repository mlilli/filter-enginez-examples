/**
 * Barrel for the four About-page hero algorithm illustrations.
 *
 * @remarks
 * Each is a self-contained, prop-less, browser-only React component rendering hand-authored inline
 * SVG with scoped CSS keyframes. They honor the brand's cyan (data) / phosphor (compute) contract and
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
