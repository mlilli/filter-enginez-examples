<script lang="ts">
	/**
	 * `<RTreeFigure>` — Svelte port of the R-tree spatial-index illustration.
	 *
	 * A map of listings in nested bounding boxes with an off-center cyan search circle. Boxes that can't
	 * intersect the circle (and their dots) sink to gray (pruned); only the dots inside the circle ignite
	 * cyan. Geometry is verbatim from the React figure; the `fe-fig-rtree__*` animation CSS lives in
	 * `@filter-enginez/ui-styles`.
	 */

	import { inView } from '../inView.js';

	/** A dot (listing) on the map. */
	type Dot = readonly [x: number, y: number];

	/** Dots inside the search circle — ignite cyan. */
	const RESULT_DOTS: readonly Dot[] = [[285, 120], [320, 140], [300, 170], [340, 158], [270, 148], [315, 112], [298, 192], [343, 185]];
	/** Dots inside the intersecting box but outside the circle — stay mid-gray. */
	const NEUTRAL_DOTS: readonly Dot[] = [[232, 64], [392, 72], [388, 150], [228, 182]];
	/** Dots inside the top-left pruned box. */
	const PRUNED_A_DOTS: readonly Dot[] = [[60, 60], [112, 50], [150, 92], [82, 112], [132, 120]];
	/** Dots inside the bottom-left pruned box. */
	const PRUNED_C_DOTS: readonly Dot[] = [[60, 205], [112, 192], [152, 232], [82, 252], [122, 256]];
</script>

<div
	class="fe-fig fe-fig-rtree"
	role="img"
	aria-label="A map of listings in nested bounding boxes with a search circle. Boxes that can't overlap the circle dim to gray along with their points; only points inside the circle light up."
	use:inView
>
	<svg viewBox="0 0 440 322" xmlns="http://www.w3.org/2000/svg" class="fe-fig__svg fe-fig-rtree__svg">
		<rect x={8} y={8} width={424} height={284} rx={8} class="fe-fig-rtree__panel" />

		<!-- Pruned root box A (top-left) + its dots -->
		<g class="fe-fig-rtree__box is-pruned" style="animation-delay: 0ms">
			<rect x={30} y={30} width={155} height={115} rx={4} class="fe-fig-rtree__box-rect" />
			{#each PRUNED_A_DOTS as [x, y] (`${x}-${y}`)}
				<circle cx={x} cy={y} r={3.5} class="fe-fig-rtree__dot is-pruned" />
			{/each}
		</g>

		<!-- Pruned root box C (bottom-left) + its dots -->
		<g class="fe-fig-rtree__box is-pruned" style="animation-delay: 260ms">
			<rect x={30} y={175} width={155} height={100} rx={4} class="fe-fig-rtree__box-rect" />
			{#each PRUNED_C_DOTS as [x, y] (`${x}-${y}`)}
				<circle cx={x} cy={y} r={3.5} class="fe-fig-rtree__dot is-pruned" />
			{/each}
		</g>

		<!-- Visited root box B (right) with two children -->
		<g class="fe-fig-rtree__box is-visited">
			<rect x={205} y={42} width={210} height={170} rx={4} class="fe-fig-rtree__box-rect" />
		</g>
		<g class="fe-fig-rtree__box is-child" style="animation-delay: 0ms">
			<rect x={222} y={58} width={92} height={130} rx={3} class="fe-fig-rtree__box-rect" />
		</g>
		<g class="fe-fig-rtree__box is-child" style="animation-delay: 180ms">
			<rect x={322} y={64} width={84} height={120} rx={3} class="fe-fig-rtree__box-rect" />
		</g>

		<!-- Neutral dots (visited box, outside circle) -->
		{#each NEUTRAL_DOTS as [x, y] (`${x}-${y}`)}
			<circle cx={x} cy={y} r={3.5} class="fe-fig-rtree__dot is-neutral" />
		{/each}

		<!-- Search circle (cyan query) -->
		<circle cx={305} cy={150} r={80} class="fe-fig-rtree__circle" />
		<text x={305} y={150} class="fe-fig-rtree__circle-label">within 5 mi</text>

		<!-- Result dots (cyan, ignite) -->
		{#each RESULT_DOTS as [x, y], index (`${x}-${y}`)}
			<circle cx={x} cy={y} r={4} class="fe-fig-rtree__dot is-result" style={`animation-delay: ${index * 55}ms`} />
		{/each}

		<!-- Readout -->
		<text x={12} y={312} class="fe-fig-rtree__count">8 results</text>
		<text x={104} y={312} class="fe-fig-rtree__pruned">· 2 branches pruned</text>
	</svg>
</div>
