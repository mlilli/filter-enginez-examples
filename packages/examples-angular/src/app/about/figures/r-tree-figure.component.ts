/**
 * `<fe-r-tree-figure>` — the R-tree spatial-index illustration.
 *
 * @remarks
 * A map of listings in nested bounding boxes with an off-center cyan search circle. Boxes that can't
 * intersect the circle (and their dots) sink to gray (pruned); only the dots inside the circle ignite
 * cyan. Geometry is verbatim from the React / Vue figures; the `fe-fig-rtree__*` animation CSS lives
 * in `@filter-enginez/ui-styles`.
 *
 * **Do not add component styles to this file** — see the note on the Bayesian figure.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';

import { InViewDirective } from '../in-view.directive.js';

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

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [InViewDirective],
	selector: 'fe-r-tree-figure',
	template: `
		<div
			feInView
			class="fe-fig fe-fig-rtree"
			role="img"
			aria-label="A map of listings in nested bounding boxes with a search circle. Boxes that can't overlap the circle dim to gray along with their points; only points inside the circle light up."
		>
			<svg viewBox="0 0 440 322" xmlns="http://www.w3.org/2000/svg" class="fe-fig__svg fe-fig-rtree__svg">
				<rect x="8" y="8" width="424" height="284" rx="8" class="fe-fig-rtree__panel" />

				<!-- Pruned root box A (top-left) + its dots -->
				<g class="fe-fig-rtree__box is-pruned" style="animation-delay: 0ms">
					<rect x="30" y="30" width="155" height="115" rx="4" class="fe-fig-rtree__box-rect" />
					@for (dot of prunedADots; track dot) {
						<circle [attr.cx]="dot[0]" [attr.cy]="dot[1]" r="3.5" class="fe-fig-rtree__dot is-pruned" />
					}
				</g>

				<!-- Pruned root box C (bottom-left) + its dots -->
				<g class="fe-fig-rtree__box is-pruned" style="animation-delay: 260ms">
					<rect x="30" y="175" width="155" height="100" rx="4" class="fe-fig-rtree__box-rect" />
					@for (dot of prunedCDots; track dot) {
						<circle [attr.cx]="dot[0]" [attr.cy]="dot[1]" r="3.5" class="fe-fig-rtree__dot is-pruned" />
					}
				</g>

				<!-- Visited root box B (right) with two children -->
				<g class="fe-fig-rtree__box is-visited">
					<rect x="205" y="42" width="210" height="170" rx="4" class="fe-fig-rtree__box-rect" />
				</g>
				<g class="fe-fig-rtree__box is-child" style="animation-delay: 0ms">
					<rect x="222" y="58" width="92" height="130" rx="3" class="fe-fig-rtree__box-rect" />
				</g>
				<g class="fe-fig-rtree__box is-child" style="animation-delay: 180ms">
					<rect x="322" y="64" width="84" height="120" rx="3" class="fe-fig-rtree__box-rect" />
				</g>

				<!-- Neutral dots (visited box, outside circle) -->
				@for (dot of neutralDots; track dot) {
					<circle [attr.cx]="dot[0]" [attr.cy]="dot[1]" r="3.5" class="fe-fig-rtree__dot is-neutral" />
				}

				<!-- Search circle (cyan query) -->
				<circle cx="305" cy="150" r="80" class="fe-fig-rtree__circle" />
				<text x="305" y="150" class="fe-fig-rtree__circle-label">within 5 mi</text>

				<!-- Result dots (cyan, ignite) -->
				@for (dot of resultDots; track dot) {
					<circle
						[attr.cx]="dot[0]"
						[attr.cy]="dot[1]"
						r="4"
						class="fe-fig-rtree__dot is-result"
						[style.animation-delay.ms]="$index * 55"
					/>
				}

				<!-- Readout -->
				<text x="12" y="312" class="fe-fig-rtree__count">8 results</text>
				<text x="104" y="312" class="fe-fig-rtree__pruned">· 2 branches pruned</text>
			</svg>
		</div>
	`,
})
export class RTreeFigureComponent {
	/** Dots in the visited box but outside the circle. */
	protected readonly neutralDots = NEUTRAL_DOTS;

	/** Dots in the top-left pruned box. */
	protected readonly prunedADots = PRUNED_A_DOTS;

	/** Dots in the bottom-left pruned box. */
	protected readonly prunedCDots = PRUNED_C_DOTS;

	/** Dots inside the search circle. */
	protected readonly resultDots = RESULT_DOTS;
}
