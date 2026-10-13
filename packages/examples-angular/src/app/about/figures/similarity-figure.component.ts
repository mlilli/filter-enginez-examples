/**
 * `<fe-similarity-figure>` — the MinHash + LSH "find similar" illustration.
 *
 * @remarks
 * A query item is reduced to a compact MinHash signature; LSH banding buckets items whose signatures
 * agree, so "find similar" is a bucket lookup, not an all-pairs scan. The signature scan pulses
 * phosphor (engine working); the signature, bucket, and neighbors are cyan (data). Geometry is
 * verbatim from the React / Vue figures; the `fe-fig-sim__*` animation CSS lives in
 * `@filter-enginez/ui-styles`.
 *
 * As in the Bloom figure, the signature cells and neighbor rows are resolved once into rendered
 * tables rather than recomputed by template helpers; the emitted SVG is identical.
 *
 * **Do not add component styles to this file** — see the note on the Bayesian figure.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';

import { InViewDirective } from '../in-view.directive.js';

/** One signature cell, resolved to its box and value anchors. */
interface RenderedCell {
	readonly textX: number;
	readonly value: string;
	readonly x: number;
}

/** One neighbor row, resolved to its Y and stagger delay. */
interface RenderedNeighbor {
	readonly delayMs: number;
	readonly label: string;
	readonly score: number;
	readonly textY: number;
	readonly y: number;
}

/** The MinHash signature values (illustrative min-hashes). */
const SIGNATURE = ['3', '7', '1', '9', '2', '5', '8', '4'] as const;

/** Nearest neighbors surfaced from the shared bucket, with match scores. */
const NEIGHBORS: readonly { label: string; score: number }[] = [
	{ label: 'malbec', score: 94 },
	{ label: 'syrah', score: 89 },
	{ label: 'tempranillo', score: 82 },
];

const CELL_STEP = 19;
const SIG_LEFT = 128;
const SIG_Y = 56;

/** The signature strip, resolved. */
const RENDERED_CELLS: readonly RenderedCell[] = SIGNATURE.map((value, index) => ({
	textX: SIG_LEFT + index * CELL_STEP + 8,
	value,
	x: SIG_LEFT + index * CELL_STEP,
}));

/** The neighbor rows, resolved. */
const RENDERED_NEIGHBORS: readonly RenderedNeighbor[] = NEIGHBORS.map((neighbor, index) => ({
	delayMs: 900 + index * 200,
	label: neighbor.label,
	score: neighbor.score,
	textY: 78 + index * 36 + 14,
	y: 78 + index * 36,
}));

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [InViewDirective],
	selector: 'fe-similarity-figure',
	template: `
		<div
			feInView
			class="fe-fig fe-fig-sim"
			role="img"
			aria-label="A query item is reduced to a MinHash signature; LSH banding buckets similar items, and the nearest neighbors light up."
		>
			<svg viewBox="0 0 460 214" xmlns="http://www.w3.org/2000/svg" class="fe-fig__svg fe-fig-sim__svg">
				<!-- Query item -->
				<rect x="14" y="82" width="92" height="48" rx="6" class="fe-fig-sim__query" />
				<text x="60" y="106" class="fe-fig-sim__query-label">this wine</text>

				<!-- MinHash signature -->
				<text [attr.x]="sigLeft" y="44" class="fe-fig-sim__eyebrow">MinHash signature</text>
				@for (cell of cells; track cell.value) {
					<g>
						<rect [attr.x]="cell.x" [attr.y]="sigY" width="16" height="22" rx="2" class="fe-fig-sim__cell" />
						<text [attr.x]="cell.textX" [attr.y]="cellTextY" class="fe-fig-sim__cell-value">{{ cell.value }}</text>
					</g>
				}
				<!-- Phosphor compute scan across the signature -->
				<rect class="fe-fig-sim__scan" [attr.x]="scanX" [attr.y]="scanY" width="2.5" height="28" rx="1.25" />

				<!-- LSH bucket -->
				<rect x="296" y="44" width="150" height="150" rx="6" class="fe-fig-sim__bucket" />
				<text x="371" y="62" class="fe-fig-sim__eyebrow is-centered">LSH bucket</text>
				@for (neighbor of neighbors; track neighbor.label) {
					<g class="fe-fig-sim__neighbor" [style.animation-delay.ms]="neighbor.delayMs">
						<rect x="308" [attr.y]="neighbor.y" width="126" height="28" rx="4" class="fe-fig-sim__neighbor-box" />
						<text x="318" [attr.y]="neighbor.textY" class="fe-fig-sim__neighbor-label">{{ neighbor.label }}</text>
						<text x="426" [attr.y]="neighbor.textY" class="fe-fig-sim__neighbor-score">{{ neighbor.score }}%</text>
					</g>
				}
			</svg>
		</div>
	`,
})
export class SimilarityFigureComponent {
	/** The resolved signature cells, exposed for the template. */
	protected readonly cells = RENDERED_CELLS;

	/** Baseline of the digit inside a signature cell. */
	protected readonly cellTextY = SIG_Y + 11;

	/** The resolved neighbor rows, exposed for the template. */
	protected readonly neighbors = RENDERED_NEIGHBORS;

	/** Resting X of the compute scanline, just left of the signature. */
	protected readonly scanX = SIG_LEFT - 2;

	/** Y of the compute scanline. */
	protected readonly scanY = SIG_Y - 3;

	/** Left edge of the signature strip. */
	protected readonly sigLeft = SIG_LEFT;

	/** Y of the signature strip. */
	protected readonly sigY = SIG_Y;
}
