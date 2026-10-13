<script lang="ts">
	/**
	 * `<BrainSynapse>` — the Svelte port of the SIGNATURE loader.
	 *
	 * @remarks
	 * The third brand loader, and the one reserved for the rare "we are fetching your data" hero
	 * moment: wide-aspect 660×220, locked to brand cyan (no theme prop — this IS the brand identity in
	 * motion), on its own dark radial stage. The React dataset boot screen uses it at `width={520}`.
	 *
	 * The distinction between the three is a real one, not a palette choice:
	 *   - `<SynapticOrbit>` — ambient idle.
	 *   - `<NeuralCluster>` — active recomputation (phosphor).
	 *   - `<BrainSynapse>` — the cold-start fetch. This one.
	 *
	 * So a boot screen uses this one, never `<NeuralCluster>`: that is the RECOMPUTING loader, and on a
	 * cold boot it would say "a filter is being applied" — the wrong vocabulary, and not the React screen.
	 *
	 * **Geometry and keyframes are byte-faithful to the React component**, including the 17 node
	 * positions, 18 edges, and 5 staggered pulse cascades. The animation names are scoped per instance
	 * exactly as React scopes them with `useId` — two loaders on one page would otherwise share
	 * keyframes and fire in lockstep.
	 *
	 * The `<style>` block lives inside the SVG `<defs>` rather than in a Svelte component style block:
	 * Svelte's CSS parser rejects the `drop-shadow` filter combined with these multi-keyframe rules,
	 * which is the same reason the other two loaders keep their animations in `ui-styles`. Here the
	 * rules are per-instance, so they travel with the markup.
	 *
	 * Respects `prefers-reduced-motion` — pulses freeze, nodes hold their lit state.
	 */

	import {
		BRAIN_SYNAPSE_EDGES,
		BRAIN_SYNAPSE_FIRING_NODES,
		BRAIN_SYNAPSE_INTRINSIC_HEIGHT,
		BRAIN_SYNAPSE_INTRINSIC_WIDTH,
		BRAIN_SYNAPSE_NODE_RADIUS,
		BRAIN_SYNAPSE_PULSE_INDICES,
		BRAIN_SYNAPSE_QUIET_NODES,
		BRAIN_SYNAPSE_VIEW_BOX,
		buildBrainSynapseCss,
	} from '@filter-enginez/brand/loaders/brain-synapse-geometry';

	const {
		ariaLabel = 'Loading',
		width = 660,
	}: {
		ariaLabel?: string;
		width?: number;
	} = $props();

	const height = $derived((width * BRAIN_SYNAPSE_INTRINSIC_HEIGHT) / BRAIN_SYNAPSE_INTRINSIC_WIDTH);

	// Per-instance scope, mirroring React's `useId`. `$props.id()` is Svelte's equivalent and is
	// SSR-stable, so the server and client markup agree.
	const instanceId = $props.id();
	const scope = `bs-${instanceId.replace(/\W/gu, '')}`;

	// Split so the literal closing sequence never appears in this file's markup OR as one token.
	// A literal `</style>` inside a `{@html}` template closes the surrounding block as far as Svelte's
	// tokenizer is concerned — it reports "`<script>` was left open", pointing nowhere near the cause.
	const OPEN_TAG = '<sty' + 'le>';
	const CLOSE_TAG = '</sty' + 'le>';

	/** The instance-scoped rule set, assembled here rather than inline in the markup (see above). */
	const styleTag = $derived(`${OPEN_TAG}${buildBrainSynapseCss(scope)}${CLOSE_TAG}`);
</script>

<div
	role="img"
	aria-label={ariaLabel}
	class="fe-boot-loader"
	style="
		background: radial-gradient(ellipse at center, #151412 0%, #0B0A09 80%);
		border-radius: 12px;
		height: {height}px;
		overflow: hidden;
		position: relative;
		width: {width}px;
	"
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		viewBox={BRAIN_SYNAPSE_VIEW_BOX}
		preserveAspectRatio="xMidYMid slice"
		style="display: block; height: 100%; width: 100%;"
	>
		<defs>
			<!--
				The content is a template literal built entirely from module constants and this
				component's own generated instance id. No user input, no props, nothing from the corpus
				reaches it. The rules cannot live in a Svelte style block: its CSS parser rejects
				`drop-shadow` combined with these keyframes — the same reason the other two loaders keep
				theirs in ui-styles.
			-->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- static, instance-scoped CSS only -->
			{@html styleTag}
		</defs>

		{#each BRAIN_SYNAPSE_EDGES as edge (`${edge.x1}-${edge.y1}-${edge.x2}-${edge.y2}`)}
			<line class="{scope}-edge" x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} />
		{/each}

		{#each BRAIN_SYNAPSE_FIRING_NODES as node (`${node.cx}-${node.cy}`)}
			<circle
				class="{scope}-node {scope}-node-fire"
				cx={node.cx}
				cy={node.cy}
				r={BRAIN_SYNAPSE_NODE_RADIUS}
				style="animation-delay: {node.delay}"
			/>
		{/each}

		{#each BRAIN_SYNAPSE_QUIET_NODES as node (`${node.cx}-${node.cy}`)}
			<circle class="{scope}-node" cx={node.cx} cy={node.cy} r={BRAIN_SYNAPSE_NODE_RADIUS} />
		{/each}

		{#each BRAIN_SYNAPSE_PULSE_INDICES as index (index)}
			<circle class="{scope}-pulse {scope}-p{index}" cx="0" cy="0" r={BRAIN_SYNAPSE_NODE_RADIUS} />
		{/each}
	</svg>
</div>
