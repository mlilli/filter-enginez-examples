/**
 * The Vue `id → figure` registry for the About page — the Vue counterpart to the React `ABOUT_FIGURES`
 * map and the SvelteKit `figureRegistry`.
 *
 * @remarks
 * The narrative content model (`@filter-enginez/examples-shared/about-core`) is framework-free and keys
 * figures by `AboutSection.id`; this registry binds those ids to the ported `.vue` figure components,
 * so the About page can look each one up by `section.id`.
 */

import type { Component } from 'vue';

import BayesianSuggestFigure from './figures/BayesianSuggestFigure.vue';
import BloomFilterFigure from './figures/BloomFilterFigure.vue';
import ExclusionGraphFigure from './figures/ExclusionGraphFigure.vue';
import MemoizedSimulationFigure from './figures/MemoizedSimulationFigure.vue';
import RoaringBitmapsFigure from './figures/RoaringBitmapsFigure.vue';
import RTreeFigure from './figures/RTreeFigure.vue';
import SimilarityFigure from './figures/SimilarityFigure.vue';
import TextIndexFigure from './figures/TextIndexFigure.vue';

/** Maps an `AboutSection.id` to its prop-less Vue figure component. */
export const ABOUT_FIGURES: Record<string, Component> = {
	bayesian: BayesianSuggestFigure,
	bloom: BloomFilterFigure,
	exclusion: ExclusionGraphFigure,
	memoization: MemoizedSimulationFigure,
	roaring: RoaringBitmapsFigure,
	rtree: RTreeFigure,
	similarity: SimilarityFigure,
	textindex: TextIndexFigure,
};
