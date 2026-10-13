<script lang="ts">
	/**
	 * `<RoaringBitmapsFigure>` — Svelte port of the Roaring-Bitmap intersection illustration.
	 *
	 * Four horizontal bit-lanes over a fifth "AND" result lane; a phosphor scanline sweeps left→right and
	 * the result cells ignite cyan where all four lanes align. Geometry + the computed result set are
	 * copied verbatim from the React figure; the scoped animation CSS lives in `@filter-enginez/ui-styles`
	 * (`fe-fig-roaring__*`), and `use:inView` toggles `.is-playing` while on-screen.
	 */

	import { inView } from '../inView.js';

	/** Number of columns (items) drawn per lane. */
	const COLUMN_COUNT = 18;

	/** Geometry constants (SVG user units) — kept here so the markup stays declarative. */
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

	/** Column indices, for iteration. */
	const COLUMNS: readonly number[] = Array.from({ length: COLUMN_COUNT }, (_, column) => column);

	/** X coordinate of a column's cell. */
	function columnX(column: number): number {
		return GRID_LEFT + column * CELL_STEP;
	}

	const resultSet = new Set(RESULT_COLUMNS);
</script>

<div
	class="fe-fig fe-fig-roaring"
	role="img"
	aria-label="Four filter bitmaps stacked in lanes; a scanline sweeps across and the intersection lights up where all four align."
	use:inView
>
	<svg viewBox="0 0 470 232" xmlns="http://www.w3.org/2000/svg" class="fe-fig__svg fe-fig-roaring__svg">
		<!-- Source lanes -->
		{#each LANES as lane, laneIndex (lane.label)}
			{@const y = LANE_YS[laneIndex] ?? 0}
			{@const litSet = new Set(lane.lit)}
			<g>
				<text x={GRID_LEFT - 12} y={y + CELL_HEIGHT / 2} class="fe-fig-roaring__label">
					{lane.label}
				</text>
				{#each COLUMNS as column (column)}
					<rect
						x={columnX(column)}
						y={y}
						width={CELL_WIDTH}
						height={CELL_HEIGHT}
						rx={2}
						class={litSet.has(column) ? 'fe-fig-roaring__bit is-lit' : 'fe-fig-roaring__bit'}
					/>
				{/each}
			</g>
		{/each}

		<!-- Divider between source lanes and the AND result -->
		<line x1={GRID_LEFT - 88} y1={158} x2={columnX(COLUMN_COUNT - 1) + CELL_WIDTH} y2={158} class="fe-fig-roaring__divider" />

		<!-- Result lane -->
		<text x={GRID_LEFT - 12} y={RESULT_Y + CELL_HEIGHT / 2} class="fe-fig-roaring__label is-and">
			AND →
		</text>
		{#each COLUMNS as column (column)}
			{@const isResult = resultSet.has(column)}
			<rect
				x={columnX(column)}
				y={RESULT_Y}
				width={CELL_WIDTH}
				height={CELL_HEIGHT}
				rx={2}
				class={isResult ? 'fe-fig-roaring__result is-hit' : 'fe-fig-roaring__result'}
				style={isResult ? `animation-delay: ${(column / COLUMN_COUNT) * 2100}ms` : undefined}
			/>
		{/each}

		<!-- The phosphor scanline (the engine reading, transient) -->
		<rect class="fe-fig-roaring__scan" x={GRID_LEFT - 2} y={18} width={2.5} height={176} rx={1.25} />

		<!-- Caption -->
		<text x={GRID_LEFT} y={222} class="fe-fig-roaring__count">1,204 results</text>
		<text x={GRID_LEFT + 92} y={222} class="fe-fig-roaring__time">· 0.4 ms</text>
	</svg>
</div>
