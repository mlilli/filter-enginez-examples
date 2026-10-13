<script lang="ts">
	/**
	 * `<ComputingIndicator>` — engine status pill mirroring `react-ui`'s `ComputingIndicator`, reusing
	 * the `fe-computing-indicator*` classes (dual-accent semantic: acid idle, phosphor computing). Swaps
	 * between the two brand loaders exactly like the React version: the ambient acid `<SynapticOrbit>`
	 * (slow orbit) while idle, and the phosphor `<NeuralCluster>` (dense firing graph) while the engine
	 * is recomputing — a distinct animation TYPE per state, not just a recolor.
	 */

	import NeuralCluster from '$lib/brand/NeuralCluster.svelte';
	import SynapticOrbit from '$lib/brand/SynapticOrbit.svelte';

	interface Props {
		/** Whether the engine is currently recomputing. */
		readonly isComputing: boolean;
	}

	const { isComputing }: Props = $props();
</script>

<span
	aria-live="polite"
	aria-label={isComputing ? 'Engine computing' : 'Engine idle'}
	class="fe-computing-indicator"
	class:fe-computing-indicator--computing={isComputing}
>
	<span aria-hidden="true" class="fe-computing-indicator__icon">
		{#if isComputing}
			<NeuralCluster size={30} />
		{:else}
			<SynapticOrbit size={30} />
		{/if}
	</span>
	<span class="fe-computing-indicator__label" class:fe-computing-indicator__label--computing={isComputing}>
		engine <span class="fe-computing-indicator__sep">·</span> {isComputing ? 'computing' : 'idle'}
	</span>
</span>
