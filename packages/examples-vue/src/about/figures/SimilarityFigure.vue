<script setup lang="ts">
/**
 * `<SimilarityFigure>` — Vue port of the MinHash + LSH "find similar" illustration.
 *
 * A query item is reduced to a compact MinHash signature; LSH banding buckets items whose signatures
 * agree, so "find similar" is a bucket lookup, not an all-pairs scan. The signature scan pulses
 * phosphor (engine working); the signature, bucket, and neighbors are cyan (data). Geometry is
 * verbatim from the React figure; the `fe-fig-sim__*` animation CSS lives in `@filter-enginez/ui-styles`.
 */

import { vInView } from '../vInView.js';

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

/** Y of a neighbor row (replaces the Svelte template's `{@const y}`). */
function neighborY(index: number): number {
	return 78 + index * 36;
}
</script>

<template>
	<div
		v-in-view
		class="fe-fig fe-fig-sim"
		role="img"
		aria-label="A query item is reduced to a MinHash signature; LSH banding buckets similar items, and the nearest neighbors light up."
	>
		<svg viewBox="0 0 460 214" xmlns="http://www.w3.org/2000/svg" class="fe-fig__svg fe-fig-sim__svg">
			<!-- Query item -->
			<rect :x="14" :y="82" :width="92" :height="48" :rx="6" class="fe-fig-sim__query" />
			<text :x="60" :y="106" class="fe-fig-sim__query-label">this wine</text>

			<!-- MinHash signature -->
			<text :x="SIG_LEFT" :y="44" class="fe-fig-sim__eyebrow">MinHash signature</text>
			<template v-for="(value, index) in SIGNATURE" :key="value">
				<g>
					<rect
						:x="SIG_LEFT + index * CELL_STEP"
						:y="SIG_Y"
						:width="16"
						:height="22"
						:rx="2"
						class="fe-fig-sim__cell"
					/>
					<text :x="SIG_LEFT + index * CELL_STEP + 8" :y="SIG_Y + 11" class="fe-fig-sim__cell-value">{{ value }}</text>
				</g>
			</template>
			<!-- Phosphor compute scan across the signature -->
			<rect class="fe-fig-sim__scan" :x="SIG_LEFT - 2" :y="SIG_Y - 3" :width="2.5" :height="28" :rx="1.25" />

			<!-- LSH bucket -->
			<rect :x="296" :y="44" :width="150" :height="150" :rx="6" class="fe-fig-sim__bucket" />
			<text :x="371" :y="62" class="fe-fig-sim__eyebrow is-centered">LSH bucket</text>
			<template v-for="(neighbor, index) in NEIGHBORS" :key="neighbor.label">
				<g class="fe-fig-sim__neighbor" :style="{ animationDelay: `${900 + index * 200}ms` }">
					<rect :x="308" :y="neighborY(index)" :width="126" :height="28" :rx="4" class="fe-fig-sim__neighbor-box" />
					<text :x="318" :y="neighborY(index) + 14" class="fe-fig-sim__neighbor-label">{{ neighbor.label }}</text>
					<text :x="426" :y="neighborY(index) + 14" class="fe-fig-sim__neighbor-score">{{ neighbor.score }}%</text>
				</g>
			</template>
		</svg>
	</div>
</template>
