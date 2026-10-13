/**
 * The `id → figure builder` registry for the About page — the framework-less counterpart to React's
 * `ABOUT_FIGURES` map and the Vue / SvelteKit figure registries.
 *
 * @remarks
 * The narrative content model (`@filter-enginez/examples-shared/about-core`) is framework-free and
 * keys figures by `AboutSection.id`; this registry binds those ids to the hand-built SVG builders, so
 * the page can look each one up by `section.id`. A builder is a plain `() => HTMLElement` — no
 * component abstraction needed.
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

/** Maps an `AboutSection.id` to the builder that constructs its figure. */
export const ABOUT_FIGURES: Record<string, (() => HTMLElement) | undefined> = {
	bayesian: createBayesianSuggestFigure,
	bloom: createBloomFilterFigure,
	exclusion: createExclusionGraphFigure,
	memoization: createMemoizedSimulationFigure,
	roaring: createRoaringBitmapsFigure,
	rtree: createRTreeFigure,
	similarity: createSimilarityFigure,
	textindex: createTextIndexFigure,
};
