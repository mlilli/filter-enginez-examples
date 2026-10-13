<script setup lang="ts">
/**
 * `<ComputingIndicator>` — engine status pill mirroring `react-ui`'s `ComputingIndicator`, reusing the
 * `fe-computing-indicator*` classes (dual-accent semantic: acid idle, phosphor computing). Swaps
 * between the two brand loaders exactly like the React/Svelte version: the ambient acid
 * `<SynapticOrbit>` while idle, and the phosphor `<NeuralCluster>` while the engine is recomputing — a
 * distinct animation TYPE per state, not just a recolor.
 */
import NeuralCluster from './NeuralCluster.vue';
import SynapticOrbit from './SynapticOrbit.vue';

defineProps<{
	/** Whether the engine is currently recomputing. */
	isComputing: boolean;
}>();
</script>

<template>
	<span
		aria-live="polite"
		:aria-label="isComputing ? 'Engine computing' : 'Engine idle'"
		class="fe-computing-indicator"
		:class="{ 'fe-computing-indicator--computing': isComputing }"
	>
		<span aria-hidden="true" class="fe-computing-indicator__icon">
			<NeuralCluster v-if="isComputing" :size="30" />
			<SynapticOrbit v-else :size="30" />
		</span>
		<span class="fe-computing-indicator__label" :class="{ 'fe-computing-indicator__label--computing': isComputing }">
			engine
			<span class="fe-computing-indicator__sep">·</span>
			{{ isComputing ? 'computing' : 'idle' }}
		</span>
	</span>
</template>
