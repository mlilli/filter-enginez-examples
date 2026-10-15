/**
 * The algorithm catalog as documentation data — the acceleration stack + the "beyond filtering"
 * capabilities. Each entry drives one `/docs/algorithms/:id` page and renders the animated
 * illustration from `docs/illustrations` — drawn over the same `fe-fig-*` classes as the framework-free
 * figure on filterenginez.com/how-it-works, so each figure looks and moves the same in both places.
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
} from '../illustrations/index.js';
import { ALGORITHM_TEXTS, type AlgorithmId } from './algorithmsText.js';
import { type AlgorithmDoc } from './types.js';

/** Each algorithm's animated illustration. Keyed by every {@link AlgorithmId}, so none can be missing. */
const ALGORITHM_FIGURES: Readonly<Record<AlgorithmId, React.ComponentType>> = {
	'bayesian-suggestions': BayesianSuggestFigure,
	'bloom-filter': BloomFilterFigure,
	'inverted-text-index': TextIndexFigure,
	'memoized-simulation': MemoizedSimulationFigure,
	'minhash-lsh': SimilarityFigure,
	'mutual-exclusion-graph': ExclusionGraphFigure,
	'r-tree': RTreeFigure,
	'roaring-bitmaps': RoaringBitmapsFigure,
};

/**
 * Every documented algorithm, in sidebar order (the four acceleration layers, then "beyond"): the words
 * from `./algorithmsText.ts` with each one's illustration.
 */
export const ALGORITHM_DOCS: readonly AlgorithmDoc[] = ALGORITHM_TEXTS.map((text) => ({ ...text, Figure: ALGORITHM_FIGURES[text.id] }));

/** Look up an algorithm doc by its route id. */
export function findAlgorithmDoc(id: string | undefined): AlgorithmDoc | undefined {
	return ALGORITHM_DOCS.find((algorithm) => algorithm.id === id);
}
