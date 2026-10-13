/**
 * `how-it-works/figures/similarity` — framework-less port of the MinHash + LSH "find similar" illustration.
 *
 * @remarks
 * A query item is reduced to a compact MinHash signature; LSH banding buckets items whose signatures
 * agree, so "find similar" is a bucket lookup, not an all-pairs scan. The signature scan pulses
 * phosphor (engine working); the signature, bucket, and neighbors are cyan (data). Geometry is
 * verbatim from the docs’ React figure; the `fe-fig-sim__*` animation CSS lives in
 * `@filter-enginez/ui-styles/figures.css`.
 *
 * @packageDocumentation
 */

import { el, svg } from '@filter-enginez/examples-shared/dom';

import { svgText } from './svgText.js';

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

/**
 * Y of a neighbor row.
 *
 * @param index - The neighbor's index.
 * @returns The row's top edge in user units.
 */
function neighborY(index: number): number {
	return 78 + index * 36;
}

/**
 * Build the MinHash + LSH similarity figure.
 *
 * @returns The figure root — pass it to `observeInView` to gate its animation.
 */
export function createSimilarityFigure(): HTMLElement {
	const signatureCells = SIGNATURE.map((value, index) =>
		svg('g', {}, [
			svg('rect', {
				class: 'fe-fig-sim__cell',
				height: 22,
				rx: 2,
				width: 16,
				x: SIG_LEFT + index * CELL_STEP,
				y: SIG_Y,
			}),
			svgText({ class: 'fe-fig-sim__cell-value', x: SIG_LEFT + index * CELL_STEP + 8, y: SIG_Y + 11 }, value),
		]),
	);

	const neighbors = NEIGHBORS.map((neighbor, index) =>
		svg('g', { class: 'fe-fig-sim__neighbor', style: `animation-delay: ${900 + index * 200}ms` }, [
			svg('rect', {
				class: 'fe-fig-sim__neighbor-box',
				height: 28,
				rx: 4,
				width: 126,
				x: 308,
				y: neighborY(index),
			}),
			svgText({ class: 'fe-fig-sim__neighbor-label', x: 318, y: neighborY(index) + 14 }, neighbor.label),
			svgText({ class: 'fe-fig-sim__neighbor-score', x: 426, y: neighborY(index) + 14 }, `${neighbor.score}%`),
		]),
	);

	return el('div', {
		attrs: {
			'aria-label':
				'A query item is reduced to a MinHash signature; LSH banding buckets similar items, and the nearest neighbors light up.',
			role: 'img',
		},
		children: [
			svg(
				'svg',
				{ class: 'fe-fig__svg fe-fig-sim__svg', viewBox: '0 0 460 214', xmlns: 'http://www.w3.org/2000/svg' },
				[
					// Query item
					svg('rect', { class: 'fe-fig-sim__query', height: 48, rx: 6, width: 92, x: 14, y: 82 }),
					svgText({ class: 'fe-fig-sim__query-label', x: 60, y: 106 }, 'this wine'),
					// MinHash signature
					svgText({ class: 'fe-fig-sim__eyebrow', x: SIG_LEFT, y: 44 }, 'MinHash signature'),
					...signatureCells,
					// Phosphor compute scan across the signature
					svg('rect', { class: 'fe-fig-sim__scan', height: 28, rx: 1.25, width: 2.5, x: SIG_LEFT - 2, y: SIG_Y - 3 }),
					// LSH bucket
					svg('rect', { class: 'fe-fig-sim__bucket', height: 150, rx: 6, width: 150, x: 296, y: 44 }),
					svgText({ class: 'fe-fig-sim__eyebrow is-centered', x: 371, y: 62 }, 'LSH bucket'),
					...neighbors,
				],
			),
		],
		className: 'fe-fig fe-fig-sim',
	});
}
