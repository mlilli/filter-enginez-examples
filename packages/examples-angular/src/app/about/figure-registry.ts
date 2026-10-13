/**
 * The Angular `id → figure` registry for the About page — the Angular counterpart to the React
 * `ABOUT_FIGURES` map, the Vue `figureRegistry` and the SvelteKit one.
 *
 * @remarks
 * The narrative content model (`@filter-enginez/examples-shared/about-core`) is framework-free and keys
 * figures by `AboutSection.id`; this registry binds those ids to the ported standalone figure
 * components, so the About page can look each one up by `section.id` and render it with
 * `NgComponentOutlet`.
 *
 * @packageDocumentation
 */

import type { Type } from '@angular/core';

import { BayesianSuggestFigureComponent } from './figures/bayesian-suggest-figure.component.js';
import { BloomFilterFigureComponent } from './figures/bloom-filter-figure.component.js';
import { ExclusionGraphFigureComponent } from './figures/exclusion-graph-figure.component.js';
import { MemoizedSimulationFigureComponent } from './figures/memoized-simulation-figure.component.js';
import { RTreeFigureComponent } from './figures/r-tree-figure.component.js';
import { RoaringBitmapsFigureComponent } from './figures/roaring-bitmaps-figure.component.js';
import { SimilarityFigureComponent } from './figures/similarity-figure.component.js';
import { TextIndexFigureComponent } from './figures/text-index-figure.component.js';

/** Maps an `AboutSection.id` to its prop-less standalone Angular figure component. */
export const ABOUT_FIGURES: Record<string, Type<unknown>> = {
	bayesian: BayesianSuggestFigureComponent,
	bloom: BloomFilterFigureComponent,
	exclusion: ExclusionGraphFigureComponent,
	memoization: MemoizedSimulationFigureComponent,
	roaring: RoaringBitmapsFigureComponent,
	rtree: RTreeFigureComponent,
	similarity: SimilarityFigureComponent,
	textindex: TextIndexFigureComponent,
};
