/**
 * The `id → figure builder` registry for the how-it-works page.
 *
 * @remarks
 * The narrative content model (`@filter-enginez/examples-shared/how-it-works`) is framework-free and
 * keys figures by `HowItWorksSection.id`; this registry binds those ids to the hand-built SVG builders,
 * so the page can mount each one into the placeholder its static markup left for it. A builder is a
 * plain `() => HTMLElement` — no component abstraction needed.
 *
 * @packageDocumentation
 */

import {
	createBayesianSuggestFigure,
	createBloomFilterFigure,
	createExclusionGraphFigure,
	createMemoizedSimulationFigure,
	createRoaringBitmapsFigure,
	createRTreeFigure,
	createSimilarityFigure,
	createTextIndexFigure,
} from './figures/index.js';

/**
 * Maps a `HowItWorksSection.id` to the builder that constructs its figure.
 *
 * @remarks
 * A `Map` rather than an object literal, because the key arrives from markup (`data-figure`): an object
 * lookup would also answer for inherited names such as `constructor`.
 */
export const HOW_IT_WORKS_FIGURES: ReadonlyMap<string, () => HTMLElement> = new Map([
	['bayesian', createBayesianSuggestFigure],
	['bloom', createBloomFilterFigure],
	['exclusion', createExclusionGraphFigure],
	['memoization', createMemoizedSimulationFigure],
	['roaring', createRoaringBitmapsFigure],
	['rtree', createRTreeFigure],
	['similarity', createSimilarityFigure],
	['textindex', createTextIndexFigure],
]);
