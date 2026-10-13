<script setup lang="ts">
/**
 * `<BloomFilterFigure>` — Vue port of the `BloomMembershipRule` illustration.
 *
 * Two membership tests over a bit-array: the top query's k hash probes all hit set bits ("probably
 * yes"); the bottom query has a probe on an unset bit ("definitely not"), rejected in a few bit
 * checks. The probes are phosphor (engine checking); the bits + verdicts are cyan/gray (data).
 * Geometry is verbatim from the React figure; the `fe-fig-bloom__*` animation CSS lives in
 * `@filter-enginez/ui-styles`.
 */

import { vInView } from '../vInView.js';

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

/**
 * Class for a bit cell (replaces the Svelte template's `{@const litSet}` / `{@const probeSet}` /
 * `{@const isProbeMiss}` and the nested-ternary class binding).
 */
function bitClass(lane: BloomLane, index: number): string {
	if (lane.lit.includes(index)) {
		return 'fe-fig-bloom__bit is-set';
	}

	if (lane.probes.includes(index) && !lane.lit.includes(index)) {
		return 'fe-fig-bloom__bit is-miss';
	}

	return 'fe-fig-bloom__bit';
}
</script>

<template>
	<div
		v-in-view
		class="fe-fig fe-fig-bloom"
		role="img"
		aria-label="Two membership tests over a bit array: one query's hash probes all hit set bits (probably yes), another has a probe hitting an unset bit (definitely not)."
	>
		<svg viewBox="0 0 460 210" xmlns="http://www.w3.org/2000/svg" class="fe-fig__svg fe-fig-bloom__svg">
			<template v-for="lane in LANES" :key="lane.query">
				<g :class="lane.verdict ? 'fe-fig-bloom__lane is-yes' : 'fe-fig-bloom__lane is-no'">
					<!-- Query chip -->
					<rect :x="12" :y="lane.cy - 16" :width="84" :height="32" :rx="6" class="fe-fig-bloom__query" />
					<text :x="54" :y="lane.cy" class="fe-fig-bloom__query-label">{{ lane.query }}</text>

					<!-- Bit array -->
					<rect
						v-for="index in CELLS"
						:key="index"
						:x="GRID_LEFT + index * CELL_STEP"
						:y="lane.cy - 9"
						:width="CELL_WIDTH"
						:height="18"
						:rx="2"
						:class="bitClass(lane, index)"
					/>

					<!-- Hash probes (phosphor) -->
					<line
						v-for="(index, order) in lane.probes"
						:key="index"
						:x1="54"
						:y1="lane.cy - 16"
						:x2="cellCenter(index)"
						:y2="lane.cy - 11"
						class="fe-fig-bloom__probe"
						:style="{ animationDelay: `${300 + order * 220}ms` }"
					/>

					<!-- Verdict -->
					<text :x="366" :y="lane.cy" class="fe-fig-bloom__verdict">
						{{ lane.verdict ? 'probably yes' : 'definitely not' }}
					</text>
				</g>
			</template>
		</svg>
	</div>
</template>
