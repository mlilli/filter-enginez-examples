<script setup lang="ts">
/**
 * `<MemoizedSimulationFigure>` — Vue port of the Memoized-Simulation (LRU) illustration.
 *
 * Two lanes race the same what-if `simulate(+2015)` query: the top lane is a cache HIT (answer
 * returns instantly from the LRU shelf); the bottom lane is the MISS that computed once through the
 * engine block (which pulses phosphor). Same answer, wildly different work. Geometry is verbatim from
 * the React figure; the `fe-fig-memo__*` animation CSS lives in `@filter-enginez/ui-styles`.
 */

import { vInView } from '../vInView.js';

/** Y centers of the two lanes in the 460×236 viewBox. */
const HIT_Y = 70;
const MISS_Y = 166;
/** Horizontal track extents shared by both lanes. */
const TRACK_START = 132;
const TRACK_END = 372;

/** The two lanes rendered as a common diagram. */
const LANES = [
	{ id: 'hit', tag: 'cached', time: '0.01 ms', y: HIT_Y },
	{ id: 'miss', tag: 'computed once', time: '≈ 28 ms', y: MISS_Y },
] as const;

const trackDelta = `${TRACK_END - TRACK_START}px`;
</script>

<template>
	<div
		v-in-view
		class="fe-fig fe-fig-memo"
		role="img"
		aria-label="The same what-if query on two lanes: a cache hit returns an answer instantly from a shelf, while a cache miss computes it once through the engine. Both return the same count."
	>
		<svg viewBox="0 0 460 236" xmlns="http://www.w3.org/2000/svg" class="fe-fig__svg fe-fig-memo__svg">
			<template v-for="lane in LANES" :key="lane.id">
				<g>
					<!-- Track -->
					<line :x1="TRACK_START" :y1="lane.y" :x2="TRACK_END" :y2="lane.y" class="fe-fig-memo__track" />
					<!-- Lane tag -->
					<text :x="24" :y="lane.y - 26" class="fe-fig-memo__tag">{{ lane.tag }}</text>
					<!-- Question card -->
					<rect :x="20" :y="lane.y - 17" :width="110" :height="34" :rx="6" class="fe-fig-memo__card" />
					<text :x="75" :y="lane.y" class="fe-fig-memo__card-label">simulate(+2015)</text>
					<!-- Answer badge -->
					<rect :x="TRACK_END" :y="lane.y - 15" :width="54" :height="30" :rx="15" class="fe-fig-memo__answer" />
					<text :x="TRACK_END + 27" :y="lane.y" class="fe-fig-memo__answer-label">847</text>
					<!-- Timing tag -->
					<text :x="TRACK_END + 27" :y="lane.y + 32" class="fe-fig-memo__time">{{ lane.time }}</text>
				</g>
			</template>

			<!-- LRU shelf on the hit lane -->
			<g :transform="`translate(210, ${HIT_Y})`" class="fe-fig-memo__shelf">
				<rect :x="-30" :y="-24" :width="60" :height="48" :rx="5" class="fe-fig-memo__shelf-box" />
				<rect :x="-22" :y="-17" :width="44" :height="9" :rx="2" class="fe-fig-memo__shelf-slot is-active" />
				<rect :x="-22" :y="-4" :width="44" :height="9" :rx="2" class="fe-fig-memo__shelf-slot" />
				<rect :x="-22" :y="9" :width="44" :height="9" :rx="2" class="fe-fig-memo__shelf-slot" />
				<text :x="0" :y="38" class="fe-fig-memo__module-label">LRU</text>
			</g>

			<!-- Engine block on the miss lane -->
			<g :transform="`translate(214, ${MISS_Y})`" class="fe-fig-memo__engine">
				<line :x1="-12" :y1="-6" :x2="10" :y2="-8" class="fe-fig-memo__engine-link" />
				<line :x1="10" :y1="-8" :x2="0" :y2="12" class="fe-fig-memo__engine-link" />
				<line :x1="0" :y1="12" :x2="-12" :y2="-6" class="fe-fig-memo__engine-link" />
				<circle :cx="-12" :cy="-6" :r="7" class="fe-fig-memo__engine-node" />
				<circle :cx="10" :cy="-8" :r="7" class="fe-fig-memo__engine-node" />
				<circle :cx="0" :cy="12" :r="7" class="fe-fig-memo__engine-node" />
				<text :x="0" :y="38" class="fe-fig-memo__module-label">engine</text>
			</g>

			<!-- Traveling query tokens (cyan data in motion) -->
			<circle
				class="fe-fig-memo__token is-hit"
				:cx="TRACK_START"
				:cy="HIT_Y"
				:r="4.5"
				:style="{ '--dx': trackDelta }"
			/>
			<circle
				class="fe-fig-memo__token is-miss"
				:cx="TRACK_START"
				:cy="MISS_Y"
				:r="4.5"
				:style="{ '--dx': trackDelta }"
			/>
		</svg>
	</div>
</template>
