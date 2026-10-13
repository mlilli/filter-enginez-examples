/**
 * `about/figures/rtree` — framework-less port of the R-tree spatial-index illustration.
 *
 * @remarks
 * A map of listings in nested bounding boxes with an off-center cyan search circle. Boxes that can't
 * intersect the circle (and their dots) sink to gray (pruned); only the dots inside the circle ignite
 * cyan. Geometry is verbatim from the React figure; the `fe-fig-rtree__*` animation CSS lives in
 * `@filter-enginez/ui-styles`.
 *
 * @packageDocumentation
 */

import { el, svg } from '../../dom.js';
import { svgText } from './svgText.js';

/** A dot (listing) on the map. */
type Dot = readonly [x: number, y: number];

/** Dots inside the search circle — ignite cyan. */
const RESULT_DOTS: readonly Dot[] = [
	[285, 120],
	[320, 140],
	[300, 170],
	[340, 158],
	[270, 148],
	[315, 112],
	[298, 192],
	[343, 185],
];
/** Dots inside the intersecting box but outside the circle — stay mid-gray. */
const NEUTRAL_DOTS: readonly Dot[] = [
	[232, 64],
	[392, 72],
	[388, 150],
	[228, 182],
];
/** Dots inside the top-left pruned box. */
const PRUNED_A_DOTS: readonly Dot[] = [
	[60, 60],
	[112, 50],
	[150, 92],
	[82, 112],
	[132, 120],
];
/** Dots inside the bottom-left pruned box. */
const PRUNED_C_DOTS: readonly Dot[] = [
	[60, 205],
	[112, 192],
	[152, 232],
	[82, 252],
	[122, 256],
];

/**
 * Build a run of pruned dots (gray, inside a pruned box).
 *
 * @param dots - The dot coordinates.
 * @returns The `<circle>` elements.
 */
function prunedDots(dots: readonly Dot[]): SVGElement[] {
	return dots.map(([x, y]) => svg('circle', { class: 'fe-fig-rtree__dot is-pruned', cx: x, cy: y, r: 3.5 }));
}

/**
 * Build the R-tree spatial-index figure.
 *
 * @returns The figure root — pass it to `observeInView` to gate its animation.
 */
export function createRTreeFigure(): HTMLElement {
	return el('div', {
		attrs: {
			'aria-label':
				"A map of listings in nested bounding boxes with a search circle. Boxes that can't overlap the circle dim to gray along with their points; only points inside the circle light up.",
			role: 'img',
		},
		children: [
			svg(
				'svg',
				{ class: 'fe-fig__svg fe-fig-rtree__svg', viewBox: '0 0 440 322', xmlns: 'http://www.w3.org/2000/svg' },
				[
					svg('rect', { class: 'fe-fig-rtree__panel', height: 284, rx: 8, width: 424, x: 8, y: 8 }),
					// Pruned root box A (top-left) + its dots
					svg('g', { class: 'fe-fig-rtree__box is-pruned', style: 'animation-delay: 0ms' }, [
						svg('rect', { class: 'fe-fig-rtree__box-rect', height: 115, rx: 4, width: 155, x: 30, y: 30 }),
						...prunedDots(PRUNED_A_DOTS),
					]),
					// Pruned root box C (bottom-left) + its dots
					svg('g', { class: 'fe-fig-rtree__box is-pruned', style: 'animation-delay: 260ms' }, [
						svg('rect', { class: 'fe-fig-rtree__box-rect', height: 100, rx: 4, width: 155, x: 30, y: 175 }),
						...prunedDots(PRUNED_C_DOTS),
					]),
					// Visited root box B (right) with two children
					svg('g', { class: 'fe-fig-rtree__box is-visited' }, [
						svg('rect', { class: 'fe-fig-rtree__box-rect', height: 170, rx: 4, width: 210, x: 205, y: 42 }),
					]),
					svg('g', { class: 'fe-fig-rtree__box is-child', style: 'animation-delay: 0ms' }, [
						svg('rect', { class: 'fe-fig-rtree__box-rect', height: 130, rx: 3, width: 92, x: 222, y: 58 }),
					]),
					svg('g', { class: 'fe-fig-rtree__box is-child', style: 'animation-delay: 180ms' }, [
						svg('rect', { class: 'fe-fig-rtree__box-rect', height: 120, rx: 3, width: 84, x: 322, y: 64 }),
					]),
					// Neutral dots (visited box, outside circle)
					...NEUTRAL_DOTS.map(([x, y]) =>
						svg('circle', { class: 'fe-fig-rtree__dot is-neutral', cx: x, cy: y, r: 3.5 }),
					),
					// Search circle (cyan query)
					svg('circle', { class: 'fe-fig-rtree__circle', cx: 305, cy: 150, r: 80 }),
					svgText({ class: 'fe-fig-rtree__circle-label', x: 305, y: 150 }, 'within 5 mi'),
					// Result dots (cyan, ignite)
					...RESULT_DOTS.map(([x, y], index) =>
						svg('circle', {
							class: 'fe-fig-rtree__dot is-result',
							cx: x,
							cy: y,
							r: 4,
							style: `animation-delay: ${index * 55}ms`,
						}),
					),
					// Readout
					svgText({ class: 'fe-fig-rtree__count', x: 12, y: 312 }, '8 results'),
					svgText({ class: 'fe-fig-rtree__pruned', x: 104, y: 312 }, '· 2 branches pruned'),
				],
			),
		],
		className: 'fe-fig fe-fig-rtree',
	});
}
