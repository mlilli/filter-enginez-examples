/**
 * `<fe-roaring-bitmaps-figure>` — the Roaring-Bitmap intersection illustration.
 *
 * @remarks
 * Four horizontal bit-lanes over a fifth "AND" result lane; a phosphor scanline sweeps left→right and
 * the result cells ignite cyan where all four lanes align. Geometry + the computed result set are
 * copied verbatim from the React / Vue figures; the scoped animation CSS lives in
 * `@filter-enginez/ui-styles` (`fe-fig-roaring__*`), and the `feInView` directive toggles
 * `.is-playing` while on-screen.
 *
 * As in the Bloom figure, per-cell coordinates and classes are resolved once into rendered tables
 * rather than recomputed by template helpers; the emitted SVG is identical.
 *
 * **Do not add component styles to this file** — see the note on the Bayesian figure.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';

import { InViewDirective } from '../in-view.directive.js';

/** One source lane: a human label + the set of lit columns (expressed as inclusive ranges/points). */
interface LaneSpec {
	readonly label: string;
	readonly lit: readonly number[];
}

/** One bit cell in a source lane, resolved. */
interface RenderedBit {
	readonly className: string;
	readonly x: number;
}

/** A source lane with its cells and label anchor resolved. */
interface RenderedLane {
	readonly cells: readonly RenderedBit[];
	readonly label: string;
	readonly labelY: number;
	readonly y: number;
}

/** One cell of the AND result lane, resolved. */
interface RenderedResultCell {
	readonly className: string;
	readonly delayMs: number | null;
	readonly x: number;
}

/** Number of columns (items) drawn per lane. */
const COLUMN_COUNT = 18;

/** Geometry constants (SVG user units) — kept here so the markup stays declarative. */
const CELL_STEP = 20;
const CELL_WIDTH = 18;
const CELL_HEIGHT = 16;
const GRID_LEFT = 100;
const LANE_YS = [30, 62, 94, 126] as const;
const RESULT_Y = 178;

/** Expand a list of inclusive `[from, to]` ranges (or single points `[n]`) into explicit columns. */
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
	{
		label: 'vintage',
		lit: columnsFromRanges([
			[4, 6],
			[9, 11],
			[15, 16],
		]),
	},
	{ label: 'body', lit: columnsFromRanges([[1], [4, 6], [10, 11], [15]]) },
];

/** Columns lit in EVERY lane — the bitwise-AND result set. Computed, never hand-maintained. */
const RESULT_COLUMNS: readonly number[] = Array.from({ length: COLUMN_COUNT }, (_, column) => column).filter(
	(column) => LANES.every((lane) => lane.lit.includes(column)),
);

/** Column indices, for iteration. */
const COLUMNS: readonly number[] = Array.from({ length: COLUMN_COUNT }, (_, column) => column);

/** The AND result set, as a lookup. */
const RESULT_SET = new Set(RESULT_COLUMNS);

/** X coordinate of a column's cell. */
function columnX(column: number): number {
	return GRID_LEFT + column * CELL_STEP;
}

/** The four source lanes, resolved to coordinates + per-cell classes. */
const RENDERED_LANES: readonly RenderedLane[] = LANES.map((lane, laneIndex) => {
	const y = LANE_YS[laneIndex] ?? 0;

	return {
		cells: COLUMNS.map((column) => ({
			className: lane.lit.includes(column) ? 'fe-fig-roaring__bit is-lit' : 'fe-fig-roaring__bit',
			x: columnX(column),
		})),
		label: lane.label,
		labelY: y + CELL_HEIGHT / 2,
		y,
	};
});

/** The AND result lane, resolved — hits carry the stagger delay that makes them ignite left→right. */
const RENDERED_RESULT_CELLS: readonly RenderedResultCell[] = COLUMNS.map((column) => ({
	className: RESULT_SET.has(column) ? 'fe-fig-roaring__result is-hit' : 'fe-fig-roaring__result',
	delayMs: RESULT_SET.has(column) ? (column / COLUMN_COUNT) * 2100 : null,
	x: columnX(column),
}));

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [InViewDirective],
	selector: 'fe-roaring-bitmaps-figure',
	template: `
		<div
			feInView
			class="fe-fig fe-fig-roaring"
			role="img"
			aria-label="Four filter bitmaps stacked in lanes; a scanline sweeps across and the intersection lights up where all four align."
		>
			<svg viewBox="0 0 470 232" xmlns="http://www.w3.org/2000/svg" class="fe-fig__svg fe-fig-roaring__svg">
				<!-- Source lanes -->
				@for (lane of lanes; track lane.label) {
					<g>
						<text [attr.x]="labelX" [attr.y]="lane.labelY" class="fe-fig-roaring__label">{{ lane.label }}</text>
						@for (cell of lane.cells; track $index) {
							<rect
								[attr.x]="cell.x"
								[attr.y]="lane.y"
								[attr.width]="cellWidth"
								[attr.height]="cellHeight"
								rx="2"
								[class]="cell.className"
							/>
						}
					</g>
				}

				<!-- Divider between source lanes and the AND result -->
				<line [attr.x1]="dividerX1" y1="158" [attr.x2]="dividerX2" y2="158" class="fe-fig-roaring__divider" />

				<!-- Result lane -->
				<text [attr.x]="labelX" [attr.y]="resultLabelY" class="fe-fig-roaring__label is-and">AND →</text>
				@for (cell of resultCells; track $index) {
					<rect
						[attr.x]="cell.x"
						[attr.y]="resultY"
						[attr.width]="cellWidth"
						[attr.height]="cellHeight"
						rx="2"
						[class]="cell.className"
						[style.animation-delay.ms]="cell.delayMs"
					/>
				}

				<!-- The phosphor scanline (the engine reading, transient) -->
				<rect class="fe-fig-roaring__scan" [attr.x]="scanX" y="18" width="2.5" height="176" rx="1.25" />

				<!-- Caption -->
				<text [attr.x]="gridLeft" y="222" class="fe-fig-roaring__count">1,204 results</text>
				<text [attr.x]="captionTimeX" y="222" class="fe-fig-roaring__time">· 0.4 ms</text>
			</svg>
		</div>
	`,
})
export class RoaringBitmapsFigureComponent {
	/** X of the timing caption, to the right of the result count. */
	protected readonly captionTimeX = GRID_LEFT + 92;

	/** Height of a bit cell. */
	protected readonly cellHeight = CELL_HEIGHT;

	/** Width of a bit cell. */
	protected readonly cellWidth = CELL_WIDTH;

	/** Left end of the divider rule. */
	protected readonly dividerX1 = GRID_LEFT - 88;

	/** Right end of the divider rule — flush with the last column. */
	protected readonly dividerX2 = columnX(COLUMN_COUNT - 1) + CELL_WIDTH;

	/** Left edge of the bit grid. */
	protected readonly gridLeft = GRID_LEFT;

	/** X anchor of the right-aligned lane labels. */
	protected readonly labelX = GRID_LEFT - 12;

	/** The four resolved source lanes, exposed for the template. */
	protected readonly lanes = RENDERED_LANES;

	/** The resolved AND result cells. */
	protected readonly resultCells = RENDERED_RESULT_CELLS;

	/** Baseline of the `AND →` label. */
	protected readonly resultLabelY = RESULT_Y + CELL_HEIGHT / 2;

	/** Y of the AND result lane. */
	protected readonly resultY = RESULT_Y;

	/** Resting X of the scanline, just left of the grid. */
	protected readonly scanX = GRID_LEFT - 2;
}
