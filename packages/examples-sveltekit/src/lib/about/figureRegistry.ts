/**
 * The SvelteKit `id → figure` registry for the About page — the Svelte counterpart to the React
 * `ABOUT_FIGURES` map.
 *
 * @remarks
 * The narrative content model (`@filter-enginez/examples-shared/about-core`) is framework-free and keys
 * figures by {@link AboutSection.id}; this registry binds those ids to the ported `.svelte` figure
 * components, so the About page can look each one up by `section.id`.
 */

import type { Component } from 'svelte';

import BayesianSuggestFigure from './figures/BayesianSuggestFigure.svelte';
import BloomFilterFigure from './figures/BloomFilterFigure.svelte';
import ExclusionGraphFigure from './figures/ExclusionGraphFigure.svelte';
import MemoizedSimulationFigure from './figures/MemoizedSimulationFigure.svelte';
import RoaringBitmapsFigure from './figures/RoaringBitmapsFigure.svelte';
import RTreeFigure from './figures/RTreeFigure.svelte';
import SimilarityFigure from './figures/SimilarityFigure.svelte';
import TextIndexFigure from './figures/TextIndexFigure.svelte';

/** Maps an `AboutSection.id` to its prop-less Svelte figure component. */
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
