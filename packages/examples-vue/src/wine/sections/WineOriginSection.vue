<script setup lang="ts">
/**
 * `<WineOriginSection>` — the cascading country → province → region → subregion picker, over an
 * `InSetofSetsRule`.
 *
 * @remarks
 * The headline facet of the wine demo, and the only one whose rule is a set OF sets: selecting a
 * country commits the leaf ids beneath it, so one click covers a whole subtree without the rule
 * needing to understand hierarchy.
 *
 * ## Selection is COMPACT — the highest selected node per branch, never the closure
 *
 * `deriveOriginSelection` recovers that compact form from the committed leaf sets. Rendering the
 * closure instead would light every descendant of a selected country, and the next click would then
 * de-select one leaf rather than the country the user actually picked.
 *
 * `specs` is empty until the corpus lands, and `deriveOriginSelection` reads an empty spec list as an
 * empty selection. That is safe only because the route assigns the engine after filling the specs, so
 * this never mounts before them.
 *
 * ## The counts come from the engine, not the tree
 *
 * Both the disabled set and the per-node badges come from the bundle. Only the engine's projection
 * knows how many WINES a node covers; the tree knows its own shape, so a country with one leaf region
 * beneath it reads `1` while producing two hundred results.
 *
 * State is the panel's usual `ref` + one-way `watch`; see `<WineChipSection>`.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { inSetofSets, type InSetofSetsRule } from '@filter-enginez/core';
import {
	chipDisabledSet,
	chipProjectedCounts,
	commitSelection,
	deriveOriginSelection,
	EMPTY_SELECTION,
	type OriginNodeSpec,
	type PickerTreeNode,
} from '@filter-enginez/examples-shared/wine-domain';
import { useEngineRefs } from '@filter-enginez/vue-signals';
import { computed, ref, watch } from 'vue';

import HierarchicalPicker from '../../controls/HierarchicalPicker.vue';
import SectionHeader from '../../controls/SectionHeader.vue';
import { injectWineBundle } from '../wineBundle.js';

const props = defineProps<{
	engine: SignalsEngine<Wine>;
	leaveExpressionMode: () => void;
	/** The flattened tree — every node plus the leaf ids selecting it would activate. */
	specs: readonly OriginNodeSpec[];
	/** The tree itself, for the picker's cascade semantics. `null` until the corpus lands. */
	tree: PickerTreeNode | null;
}>();

const ruleRef = useEngineRefs(props.engine).rule('origin');

/** The compact node selection the engine's committed leaf sets imply. */
const committed = computed<readonly string[]>(() => {
	const rule = ruleRef.value as InSetofSetsRule<string> | undefined;

	return rule === undefined ? EMPTY_SELECTION : deriveOriginSelection(rule.config.set, props.specs);
});

/** The painted selection — written on click, re-adopted on settle. */
const selected = ref<readonly string[]>(committed.value);

watch(committed, (next) => {
	selected.value = next;
});

const bundleContext = injectWineBundle();
const bundle = computed(() => bundleContext?.current.value ?? null);

/** Nodes whose whole subtree would yield zero results. Empty until the first bundle — all enabled. */
const disabled = computed(() => chipDisabledSet(bundle.value, 'origin'));

/** Node id → projected wine count, for the row badges. See the docblock. */
const counts = computed(() => chipProjectedCounts(bundle.value, 'origin'));

/**
 * Commit a whole new selection.
 *
 * @remarks
 * The picker hands back the ENTIRE next selection rather than one toggled value: a single click can
 * select a subtree, or de-cascade an ancestor into its siblings, so "which id changed" is not
 * expressible.
 *
 * @param next - The compact selection after the click.
 */
function handleChange(next: readonly string[]): void {
	props.leaveExpressionMode();
	selected.value = next;
	commitSelection(props.engine, 'origin', next, (values) => {
		const sets = props.specs
			.filter((spec) => values.includes(spec.value))
			.map((spec) => spec.leafIds);

		return inSetofSets<string>('originId', sets);
	});
}
</script>

<template>
	<section>
		<SectionHeader label="Origin" />
		<HierarchicalPicker
			v-if="tree"
			:counts="counts"
			:disabled="disabled"
			group-label="Origin"
			:selected="selected"
			:tree="tree"
			@change="handleChange"
		/>
	</section>
</template>
