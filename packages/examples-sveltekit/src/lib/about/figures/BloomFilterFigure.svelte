<script lang="ts">
	/**
	 * `<BloomFilterFigure>` — Svelte port of the `BloomMembershipRule` illustration.
	 *
	 * Two membership tests over a bit-array: the top query's k hash probes all hit set bits ("probably
	 * yes"); the bottom query has a probe on an unset bit ("definitely not"), rejected in a few bit
	 * checks. The probes are phosphor (engine checking); the bits + verdicts are cyan/gray (data).
	 * Geometry is verbatim from the React figure; the `fe-fig-bloom__*` animation CSS lives in
	 * `@filter-enginez/ui-styles`.
	 */

	import { inView } from '../inView.js';

	/** One membership-test lane. */
	interface BloomLane {
		/** Indices of the bits that are set in this lane's array (0–15). */
		readonly lit: readonly number[];
		/** The k hash-probe bit indices. */
		readonly probes: readonly number[];
		readonly query: string;
		/** `true` when every probe hits a set bit → "probably yes"; `false` → "definitely not". */
		readonly verdict: boolean;
	}

	const CELL_COUNT = 16;
	const CELL_STEP = 15;
	const CELL_WIDTH = 13;
	const GRID_LEFT = 112;

	/** The two lanes. Top: all probes hit set bits. Bottom: probe at 8 hits an unset bit. */
	const LANES: readonly ({ cy: number } & BloomLane)[] = [
		{ cy: 54, lit: [1, 2, 4, 7, 9, 12, 14], probes: [2, 7, 12], query: 'id 4417', verdict: true },
		{ cy: 150, lit: [0, 3, 5, 10, 13, 15], probes: [3, 8, 13], query: 'id 9902', verdict: false },
	];

	/** Bit-cell indices, for iteration. */
	const CELLS: readonly number[] = Array.from({ length: CELL_COUNT }, (_, index) => index);

	/** X center of a bit cell. */
	function cellCenter(index: number): number {
		return GRID_LEFT + index * CELL_STEP + CELL_WIDTH / 2;
	}
</script>

<div
	class="fe-fig fe-fig-bloom"
	role="img"
	aria-label="Two membership tests over a bit array: one query's hash probes all hit set bits (probably yes), another has a probe hitting an unset bit (definitely not)."
	use:inView
>
	<svg viewBox="0 0 460 210" xmlns="http://www.w3.org/2000/svg" class="fe-fig__svg fe-fig-bloom__svg">
		{#each LANES as lane (lane.query)}
			{@const litSet = new Set(lane.lit)}
			{@const probeSet = new Set(lane.probes)}
			<g class={lane.verdict ? 'fe-fig-bloom__lane is-yes' : 'fe-fig-bloom__lane is-no'}>
				<!-- Query chip -->
				<rect x={12} y={lane.cy - 16} width={84} height={32} rx={6} class="fe-fig-bloom__query" />
				<text x={54} y={lane.cy} class="fe-fig-bloom__query-label">{lane.query}</text>

				<!-- Bit array -->
				{#each CELLS as index (index)}
					{@const isProbeMiss = probeSet.has(index) && !litSet.has(index)}
					<rect
						x={GRID_LEFT + index * CELL_STEP}
						y={lane.cy - 9}
						width={CELL_WIDTH}
						height={18}
						rx={2}
						class={litSet.has(index)
							? 'fe-fig-bloom__bit is-set'
							: isProbeMiss
								? 'fe-fig-bloom__bit is-miss'
								: 'fe-fig-bloom__bit'}
					/>
				{/each}

				<!-- Hash probes (phosphor) -->
				{#each lane.probes as index, order (index)}
					<line
						x1={54}
						y1={lane.cy - 16}
						x2={cellCenter(index)}
						y2={lane.cy - 11}
						class="fe-fig-bloom__probe"
						style={`animation-delay: ${300 + order * 220}ms`}
					/>
				{/each}

				<!-- Verdict -->
				<text x={366} y={lane.cy} class="fe-fig-bloom__verdict">
					{lane.verdict ? 'probably yes' : 'definitely not'}
				</text>
			</g>
		{/each}
	</svg>
</div>
