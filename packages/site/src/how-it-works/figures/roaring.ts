/**
 * `how-it-works/figures/roaring` — framework-less port of the Roaring-Bitmap intersection illustration.
 *
 * @remarks
 * Four horizontal bit-lanes over a fifth "AND" result lane; a phosphor scanline sweeps left→right and
 * the result cells ignite cyan where all four lanes align. Geometry + the computed result set are
 * copied verbatim from the docs’ React figure; the scoped animation CSS lives in
 * `@filter-enginez/ui-styles/figures.css` (`fe-fig-roaring__*`), and `observeInView` toggles
 * `.is-playing` while the figure is on-screen.
 *
 * @packageDocumentation
 */

import { el, svg } from '@filter-enginez/examples-shared/dom';

import { svgText } from './svgText.js';

/** Number of columns (items) drawn per lane. */
const COLUMN_COUNT = 18;

/** Geometry constants (SVG user units) — kept here so the builder stays declarative. */
const CELL_STEP = 20;
const CELL_WIDTH = 18;
const CELL_HEIGHT = 16;
const GRID_LEFT = 100;
const LANE_YS = [30, 62, 94, 126] as const;
const RESULT_Y = 178;

/** One source lane: a human label + the set of lit columns (expressed as inclusive ranges/points). */
interface LaneSpec {
	readonly label: string;
	readonly lit: readonly number[];
}

/**
 * Expand a list of inclusive `[from, to]` ranges (or single points `[n]`) into explicit columns.
 *
 * @param ranges - Inclusive ranges or single points.
 * @returns Every column covered by the ranges, in order.
 */
function columnsFromRanges(ranges: readonly (readonly [number, number] | readonly [number])[]): number[] {
	const out: number[] = [];

	for (const range of ranges) {
		const from = range[0];
		const to = range.length === 2 ? range[1] : range[0];

		for (let column = from; column <= to; column += 1) {
			out.push(column);
		}
	}

	return out;
}

/** The four source lanes. Patterns are chosen so the AND yields a tidy {4,5,6,15} cluster. */
const LANES: readonly LaneSpec[] = [
	{ label: 'region', lit: columnsFromRanges([[2, 9], [13], [15]]) },
	{ label: 'price', lit: columnsFromRanges([[3, 6], [8, 11], [15]]) },
	{ label: 'vintage', lit: columnsFromRanges([[4, 6], [9, 11], [15, 16]]) },
	{ label: 'body', lit: columnsFromRanges([[1], [4, 6], [10, 11], [15]]) },
];

/** Columns lit in EVERY lane — the bitwise-AND result set. Computed, never hand-maintained. */
const RESULT_COLUMNS: readonly number[] = Array.from({ length: COLUMN_COUNT }, (_, column) => column).filter((column) =>
	LANES.every((lane) => lane.lit.includes(column)),
);

/** Column indices, for iteration. */
const COLUMNS: readonly number[] = Array.from({ length: COLUMN_COUNT }, (_, column) => column);

/** The result set, as a `Set` for O(1) hit tests while rendering the AND lane. */
const resultSet = new Set(RESULT_COLUMNS);

/**
 * X coordinate of a column's cell.
 *
 * @param column - The column index.
 * @returns The cell's left edge in user units.
 */
function columnX(column: number): number {
	return GRID_LEFT + column * CELL_STEP;
}

/**
 * Y coordinate of a source lane.
 *
 * @param laneIndex - The lane's index in {@link LANES}.
 * @returns The lane's top edge in user units.
 */
function laneY(laneIndex: number): number {
	/* v8 ignore next -- defensive: `noUncheckedIndexedAccess` fallback. Both call sites index by a
	   lane's own position in `LANES`, and `LANE_YS` is parallel to it, so the lookup never misses. */
	return LANE_YS[laneIndex] ?? 0;
}

/**
 * Build the Roaring-Bitmap intersection figure.
 *
 * @returns The figure root — pass it to `observeInView` to gate its animation.
 */
export function createRoaringBitmapsFigure(): HTMLElement {
	const laneGroups = LANES.map((lane, laneIndex) =>
		svg('g', {}, [
			svgText(
				{
					class: 'fe-fig-roaring__label',
					x: GRID_LEFT - 12,
					y: laneY(laneIndex) + CELL_HEIGHT / 2,
				},
				lane.label,
			),
			...COLUMNS.map((column) =>
				svg('rect', {
					class: lane.lit.includes(column) ? 'fe-fig-roaring__bit is-lit' : 'fe-fig-roaring__bit',
					height: CELL_HEIGHT,
					rx: 2,
					width: CELL_WIDTH,
					x: columnX(column),
					y: laneY(laneIndex),
				}),
			),
		]),
	);

	const resultCells = COLUMNS.map((column) => {
		const isHit = resultSet.has(column);

		return svg('rect', {
			class: isHit ? 'fe-fig-roaring__result is-hit' : 'fe-fig-roaring__result',
			height: CELL_HEIGHT,
			rx: 2,
			width: CELL_WIDTH,
			x: columnX(column),
			y: RESULT_Y,
			...(isHit ? { style: `animation-delay: ${(column / COLUMN_COUNT) * 2100}ms` } : {}),
		});
	});

	return el('div', {
		attrs: {
			'aria-label':
				'Four filter bitmaps stacked in lanes; a scanline sweeps across and the intersection lights up where all four align.',
			role: 'img',
		},
		children: [
			svg(
				'svg',
				{
					class: 'fe-fig__svg fe-fig-roaring__svg',
					viewBox: '0 0 470 232',
					xmlns: 'http://www.w3.org/2000/svg',
				},
				[
					// Source lanes
					...laneGroups,
					// Divider between source lanes and the AND result
					svg('line', {
						class: 'fe-fig-roaring__divider',
						x1: GRID_LEFT - 88,
						x2: columnX(COLUMN_COUNT - 1) + CELL_WIDTH,
						y1: 158,
						y2: 158,
					}),
					// Result lane
					svgText({ class: 'fe-fig-roaring__label is-and', x: GRID_LEFT - 12, y: RESULT_Y + CELL_HEIGHT / 2 }, 'AND →'),
					...resultCells,
					// The phosphor scanline (the engine reading, transient)
					svg('rect', { class: 'fe-fig-roaring__scan', height: 176, rx: 1.25, width: 2.5, x: GRID_LEFT - 2, y: 18 }),
					// Caption
					svgText({ class: 'fe-fig-roaring__count', x: GRID_LEFT, y: 222 }, '1,204 results'),
					svgText({ class: 'fe-fig-roaring__time', x: GRID_LEFT + 92, y: 222 }, '· 0.4 ms'),
				],
			),
		],
		className: 'fe-fig fe-fig-roaring',
	});
}
