<script setup lang="ts">
/**
 * `<ExclusionGraphFigure>` — Vue port of the Mutual-Exclusion-Graph illustration.
 *
 * Six rule-chips in a ring: a compatible spark crosses a solid edge (both endpoints settle cyan) and
 * an excluded spark strikes the `∅` marker on a dashed edge, dimming its target — the engine
 * short-circuits an impossible combination without computing. Geometry is verbatim from the React
 * figure; the `fe-fig-excl__*` animation CSS lives in `@filter-enginez/ui-styles`.
 */

import { vInView } from '../vInView.js';

/** A rule chip in the exclusion graph. */
interface GraphNode {
	readonly cx: number;
	readonly cy: number;
	/** Resting (completed-frame) state: the compatible pair is `lit`, the excluded target is `dim`. */
	readonly label: string;
	readonly state: 'dim' | 'lit' | 'neutral';
}

const NODE_WIDTH = 82;
const NODE_HEIGHT = 26;

/** Ring of six chips. Coordinates are pill centers in the 460×300 viewBox. */
const NODES = {
	napa: { cx: 300, cy: 250, label: 'napa', state: 'neutral' },
	price: { cx: 95, cy: 250, label: '≤ $15', state: 'lit' },
	red: { cx: 300, cy: 50, label: 'red', state: 'neutral' },
	reserve: { cx: 30, cy: 150, label: 'reserve', state: 'neutral' },
	sauvignon: { cx: 95, cy: 62, label: 'sauvignon', state: 'lit' },
	sparkling: { cx: 388, cy: 150, label: 'sparkling', state: 'dim' },
} satisfies Record<string, GraphNode>;

/** Plain structural edges (gray hairlines) sketching the graph. */
const EDGES: readonly (readonly [keyof typeof NODES, keyof typeof NODES])[] = [
	['sauvignon', 'red'],
	['red', 'sparkling'],
	['sparkling', 'napa'],
	['napa', 'price'],
	['price', 'reserve'],
	['reserve', 'sauvignon'],
];

/** Midpoint of two nodes. */
function midpoint(a: GraphNode, b: GraphNode): { x: number; y: number } {
	return { x: (a.cx + b.cx) / 2, y: (a.cy + b.cy) / 2 };
}

const compatFrom = NODES.sauvignon;
const compatTo = NODES.price;
const exclFrom = NODES.red;
const exclTo = NODES.sparkling;
const exclMid = midpoint(exclFrom, exclTo);
</script>

<template>
	<div
		v-in-view
		class="fe-fig fe-fig-excl"
		role="img"
		aria-label="A graph of filter rules. One spark crosses a valid edge and both rules light up; another spark hits a 'no' marker on a forbidden edge and the rule it points to goes dark."
	>
		<svg viewBox="0 0 460 300" xmlns="http://www.w3.org/2000/svg" class="fe-fig__svg fe-fig-excl__svg">
			<!-- Structural edges -->
			<line
				v-for="[fromId, toId] in EDGES"
				:key="`${fromId}-${toId}`"
				:x1="NODES[fromId].cx"
				:y1="NODES[fromId].cy"
				:x2="NODES[toId].cx"
				:y2="NODES[toId].cy"
				:class="fromId === 'red' && toId === 'sparkling' ? 'fe-fig-excl__edge is-exclusion' : 'fe-fig-excl__edge'"
			/>

			<!-- Compatible edge (emphasized, solid) -->
			<line
				:x1="compatFrom.cx"
				:y1="compatFrom.cy"
				:x2="compatTo.cx"
				:y2="compatTo.cy"
				class="fe-fig-excl__edge is-compat"
			/>

			<!-- The ∅ marker at the excluded edge midpoint -->
			<g class="fe-fig-excl__void" :transform="`translate(${exclMid.x}, ${exclMid.y})`">
				<circle :r="10" class="fe-fig-excl__void-ring" />
				<line :x1="-6" :y1="6" :x2="6" :y2="-6" class="fe-fig-excl__void-slash" />
			</g>

			<!-- Chips -->
			<g
				v-for="[id, node] in Object.entries(NODES)"
				:key="id"
				:class="`fe-fig-excl__node is-${node.state}`"
				:data-node="id"
			>
				<rect
					:x="node.cx - NODE_WIDTH / 2"
					:y="node.cy - NODE_HEIGHT / 2"
					:width="NODE_WIDTH"
					:height="NODE_HEIGHT"
					:rx="13"
					class="fe-fig-excl__chip"
				/>
				<text :x="node.cx" :y="node.cy" class="fe-fig-excl__chip-label">
					{{ node.label }}
				</text>
			</g>

			<!-- Sparks (phosphor, transient) -->
			<circle
				class="fe-fig-excl__spark is-compat"
				:cx="compatFrom.cx"
				:cy="compatFrom.cy"
				:r="3.5"
				:style="{ '--dx': `${compatTo.cx - compatFrom.cx}px`, '--dy': `${compatTo.cy - compatFrom.cy}px` }"
			/>
			<circle
				class="fe-fig-excl__spark is-excl"
				:cx="exclFrom.cx"
				:cy="exclFrom.cy"
				:r="3.5"
				:style="{ '--dx': `${exclMid.x - exclFrom.cx}px`, '--dy': `${exclMid.y - exclFrom.cy}px` }"
			/>

			<!-- Caption -->
			<text :x="230" :y="290" class="fe-fig-excl__caption">
				<tspan class="fe-fig-excl__caption-void">∅ precomputed</tspan>
				— selecting sparkling would yield 0 results
			</text>
		</svg>
	</div>
</template>
