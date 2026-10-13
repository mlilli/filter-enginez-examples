/**
 * The React `id → figure` registry for the About page — maps each {@link AboutSection.id} to its
 * animated illustration.
 *
 * @remarks
 * The content model (`aboutContent.ts`) is React-free and keys figures by `id`; this registry binds
 * those ids to the React figure components. Each framework vertical supplies its own equivalent
 * registry (the SvelteKit port maps the same ids to `.svelte` figures), so the narrative lives once in
 * `about-core` and only the figure components differ per framework.
 *
 * @packageDocumentation
 */

import {
	BayesianSuggestFigure,
	BloomFilterFigure,
	ExclusionGraphFigure,
	MemoizedSimulationFigure,
	RoaringBitmapsFigure,
	RTreeFigure,
	SimilarityFigure,
	TextIndexFigure,
} from './illustrations/index.js';

/** Maps an `AboutSection.id` to its prop-less React figure component. */
export const ABOUT_FIGURES: Record<string, React.ComponentType> = {
	bayesian: BayesianSuggestFigure,
	bloom: BloomFilterFigure,
	exclusion: ExclusionGraphFigure,
	memoization: MemoizedSimulationFigure,
	roaring: RoaringBitmapsFigure,
	rtree: RTreeFigure,
	similarity: SimilarityFigure,
	textindex: TextIndexFigure,
};
