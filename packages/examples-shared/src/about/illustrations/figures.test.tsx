/**
 * Render tests for the eight About-page illustrations — each mounts without throwing and produces an
 * accessible `role="img"` SVG figure with its scoped class hook.
 *
 * @remarks
 * jsdom render via `@testing-library/react`. `useInView` guards on a missing `IntersectionObserver`
 * (absent in jsdom) and latches visible, so the figures render their `.is-playing` state here.
 *
 * @packageDocumentation
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
	BayesianSuggestFigure,
	BloomFilterFigure,
	ExclusionGraphFigure,
	MemoizedSimulationFigure,
	RoaringBitmapsFigure,
	RTreeFigure,
	SimilarityFigure,
	TextIndexFigure,
} from './index.js';

afterEach(cleanup);

const FIGURES: readonly (readonly [React.ComponentType, string])[] = [
	[RoaringBitmapsFigure, 'fe-fig-roaring'],
	[ExclusionGraphFigure, 'fe-fig-excl'],
	[MemoizedSimulationFigure, 'fe-fig-memo'],
	[RTreeFigure, 'fe-fig-rtree'],
	[BayesianSuggestFigure, 'fe-fig-bayes'],
	[SimilarityFigure, 'fe-fig-sim'],
	[BloomFilterFigure, 'fe-fig-bloom'],
	[TextIndexFigure, 'fe-fig-text'],
];

describe('about illustrations', () => {
	for (const [Figure, marker] of FIGURES) {
		it(`renders ${marker} as an accessible svg figure`, () => {
			const { container } = render(<Figure />);
			const figure = container.querySelector(`.${marker}`);

			expect(figure).not.toBeNull();
			expect(figure?.getAttribute('role')).toBe('img');
			expect(figure?.getAttribute('aria-label')).toBeTruthy();
			expect(container.querySelector('svg')).not.toBeNull();
		});
	}
});
