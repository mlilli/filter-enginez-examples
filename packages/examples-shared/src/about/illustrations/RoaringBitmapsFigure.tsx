/**
 * `<RoaringBitmapsFigure />` — animated hero illustration for the Roaring-Bitmap intersection layer.
 *
 * @remarks
 * Four horizontal bit-lanes (one per active filter rule) stacked over a fifth "AND" result lane. A
 * phosphor scanline sweeps left→right; where all four source lanes are lit in the same column, the
 * result cell ignites cyan and stays lit. The visual thesis in one image: stack the filters, one
 * bitwise pass computes the intersection. Per the brand contract, the DATA (bits, runs, the result,
 * the count) is cyan; the ENGINE DOING WORK (the sweeping scanline) is phosphor and strictly
 * transient.
 *
 * Motion is authored so the BASE (un-animated) state is the completed, legible frame — lit result
 * lane, no scanline — so `prefers-reduced-motion` and off-screen idle both land on a clean static
 * figure with zero extra assets. Animation is added only under `no-preference` and only while the
 * figure is on-screen (`.is-playing`), keeping the page calm and cheap.
 *
 * @packageDocumentation
 */

import { useRef } from 'react';

import { useInView } from '../useInView.js';

/** Number of columns (items) drawn per lane. */
const COLUMN_COUNT = 18;

/** Geometry constants (SVG user units) — kept here so the JSX stays declarative. */
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
	{ label: 'vintage', lit: columnsFromRanges([[4, 6], [9, 11], [15, 16]]) },
	{ label: 'body', lit: columnsFromRanges([[1], [4, 6], [10, 11], [15]]) },
];

/** Columns lit in EVERY lane — the bitwise-AND result set. Computed, never hand-maintained. */
const RESULT_COLUMNS: readonly number[] = Array.from({ length: COLUMN_COUNT }, (_, column) => column).filter(
	(column) => LANES.every((lane) => lane.lit.includes(column)),
);

/** X coordinate of a column's cell. */
function columnX(column: number): number {
	return GRID_LEFT + column * CELL_STEP;
}

/**
 * The Roaring-Bitmap intersection figure.
 */
export const RoaringBitmapsFigure = (): React.ReactElement => {
	const rootRef = useRef<HTMLDivElement>(null);
	const isInView = useInView(rootRef, { threshold: 0.35 });
	const resultSet = new Set(RESULT_COLUMNS);

	return (
		<div
			ref={rootRef}
			className={`fe-fig fe-fig-roaring${isInView ? ' is-playing' : ''}`}
			role="img"
			aria-label="Four filter bitmaps stacked in lanes; a scanline sweeps across and the intersection lights up where all four align."
		>
			<svg viewBox="0 0 470 232" xmlns="http://www.w3.org/2000/svg" className="fe-fig__svg">
				{/* ── Source lanes ── */}
				{LANES.map((lane, laneIndex) => {
					const y = LANE_YS[laneIndex] ?? 0;
					const litSet = new Set(lane.lit);

					return (
						<g key={lane.label}>
							<text x={GRID_LEFT - 12} y={y + CELL_HEIGHT / 2} className="fe-fig-roaring__label">
								{lane.label}
							</text>
							{Array.from({ length: COLUMN_COUNT }, (_, column) => (
								<rect
									key={column}
									x={columnX(column)}
									y={y}
									width={CELL_WIDTH}
									height={CELL_HEIGHT}
									rx={2}
									className={litSet.has(column) ? 'fe-fig-roaring__bit is-lit' : 'fe-fig-roaring__bit'}
								/>
							))}
						</g>
					);
				})}

				{/* ── Divider between source lanes and the AND result ── */}
				<line x1={GRID_LEFT - 88} y1={158} x2={columnX(COLUMN_COUNT - 1) + CELL_WIDTH} y2={158} className="fe-fig-roaring__divider" />

				{/* ── Result lane ── */}
				<text x={GRID_LEFT - 12} y={RESULT_Y + CELL_HEIGHT / 2} className="fe-fig-roaring__label is-and">
					AND →
				</text>
				{Array.from({ length: COLUMN_COUNT }, (_, column) => {
					const isResult = resultSet.has(column);

					return (
						<rect
							key={column}
							x={columnX(column)}
							y={RESULT_Y}
							width={CELL_WIDTH}
							height={CELL_HEIGHT}
							rx={2}
							className={isResult ? 'fe-fig-roaring__result is-hit' : 'fe-fig-roaring__result'}
							style={isResult ? { animationDelay: `${(column / COLUMN_COUNT) * 2100}ms` } : undefined}
						/>
					);
				})}

				{/* ── The phosphor scanline (the engine reading, transient) ── */}
				<rect className="fe-fig-roaring__scan" x={GRID_LEFT - 2} y={18} width={2.5} height={176} rx={1.25} />

				{/* ── Caption ── */}
				<text x={GRID_LEFT} y={222} className="fe-fig-roaring__count">
					1,204 results
				</text>
				<text x={GRID_LEFT + 92} y={222} className="fe-fig-roaring__time">
					· 0.4 ms
				</text>
			</svg>
		</div>
	);
};
