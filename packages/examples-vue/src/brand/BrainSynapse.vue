<script setup lang="ts">
/**
 * `<BrainSynapse>` — the Vue port of the SIGNATURE loader.
 *
 * @remarks
 * The third brand loader, and the one reserved for the rare "we are fetching your data" hero moment:
 * wide-aspect 660×220, locked to brand cyan (no theme prop — this IS the brand identity in motion), on
 * its own dark radial stage. The wine boot screen uses it at `width={520}`.
 *
 * **The distinction between the three is a real one, not a palette choice:**
 *
 *   - `<SynapticOrbit>` — ambient idle.
 *   - `<NeuralCluster>` — active recomputation (phosphor).
 *   - `<BrainSynapse>` — the cold-start fetch. This one.
 *
 * A boot screen built on `<NeuralCluster>` would dress a cold boot in the animation that means "a filter
 * is being applied" — wrong vocabulary, and visibly unlike the React screen. Pick the loader by meaning,
 * not by whichever one this app already uses.
 *
 * ## Geometry is imported, not transcribed
 *
 * All 17 nodes, 18 edges and 5 pulse cascades come from
 * `@filter-enginez/brand/loaders/brain-synapse-geometry`, shared with the React and Svelte components.
 * Hand-copying them a third time is the alternative, and a mistyped `cx` is invisible to every gate in
 * the repo — nothing type-checks a coordinate, and the only instrument that reports a node in the wrong
 * place is an eye on a rendered page.
 *
 * ## Two things that look like style choices and are not
 *
 * **The rules go in the SVG's `<defs>` via `v-html`, not a `<style scoped>` block.** They must be
 * scoped per INSTANCE — two loaders on one page sharing keyframe names fire in lockstep instead of
 * independently — and Vue's scoped-style attribute selectors cannot rename a `@keyframes` the way this
 * needs. React scopes with `useId` and Svelte with `$props.id()`; `useId()` is Vue's equivalent.
 *
 * **`v-html` is safe here and only here.** Its content is a pure function of module constants and this
 * component's own generated id, sanitized to word characters below. No prop, no corpus value and no URL
 * reaches it.
 *
 * Respects `prefers-reduced-motion` — pulses freeze, nodes hold their lit state.
 */

import {
	BRAIN_SYNAPSE_EDGES,
	BRAIN_SYNAPSE_FIRING_NODES,
	BRAIN_SYNAPSE_NODE_RADIUS,
	BRAIN_SYNAPSE_PULSE_INDICES,
	BRAIN_SYNAPSE_QUIET_NODES,
	BRAIN_SYNAPSE_VIEW_BOX,
	brainSynapseStageStyle,
	buildBrainSynapseCss,
} from '@filter-enginez/brand/loaders/brain-synapse-geometry';
import { computed, useId } from 'vue';

const props = withDefaults(
	defineProps<{
		/** Accessible name for the loader. Not `ariaLabel` — see `<ResultGrid>`'s `listLabel`. */
		loaderLabel?: string;
		/** Rendered width in pixels; height follows the 660×220 aspect. */
		width?: number;
	}>(),
	{
		loaderLabel: 'Loading',
		width: 660,
	},
);

// Sanitized to word characters because it becomes part of a CSS selector and a keyframe name. Vue's
// `useId()` yields values like `v-0`, whose hyphen is legal in a class name but which is normalized
// here anyway so the three frameworks' scopes have one shape.
const scope = computed(() => `bs-${useId().replace(/\W/gu, '')}`);
const stageStyle = computed(() => brainSynapseStageStyle(props.width));
const styleTag = computed(() => `<style>${buildBrainSynapseCss(scope.value)}</style>`);
</script>

<template>
	<div class="fe-boot-loader" role="img" :aria-label="loaderLabel" :style="stageStyle">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			preserveAspectRatio="xMidYMid slice"
			:viewBox="BRAIN_SYNAPSE_VIEW_BOX"
			style="display: block; height: 100%; width: 100%"
		>
			<!-- eslint-disable-next-line vue/no-v-html -- instance-scoped CSS from module constants only -->
			<defs v-html="styleTag" />

			<line
				v-for="edge in BRAIN_SYNAPSE_EDGES"
				:key="`${edge.x1}-${edge.y1}-${edge.x2}-${edge.y2}`"
				:class="`${scope}-edge`"
				:x1="edge.x1"
				:y1="edge.y1"
				:x2="edge.x2"
				:y2="edge.y2"
			/>

			<circle
				v-for="node in BRAIN_SYNAPSE_FIRING_NODES"
				:key="`${node.cx}-${node.cy}`"
				:class="`${scope}-node ${scope}-node-fire`"
				:cx="node.cx"
				:cy="node.cy"
				:r="BRAIN_SYNAPSE_NODE_RADIUS"
				:style="{ animationDelay: node.delay }"
			/>

			<circle
				v-for="node in BRAIN_SYNAPSE_QUIET_NODES"
				:key="`${node.cx}-${node.cy}`"
				:class="`${scope}-node`"
				:cx="node.cx"
				:cy="node.cy"
				:r="BRAIN_SYNAPSE_NODE_RADIUS"
			/>

			<circle
				v-for="index in BRAIN_SYNAPSE_PULSE_INDICES"
				:key="index"
				:class="`${scope}-pulse ${scope}-p${index}`"
				cx="0"
				cy="0"
				:r="BRAIN_SYNAPSE_NODE_RADIUS"
			/>
		</svg>
	</div>
</template>
