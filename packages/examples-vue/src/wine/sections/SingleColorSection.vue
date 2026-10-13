<script setup lang="ts">
/**
 * `<SingleColorSection>` — an exact-match `ValueRule` over a wine's color.
 *
 * @remarks
 * Sits directly beneath the color CHIPS, which are an `InSetRule` over the same field. The adjacency
 * is the point: the demo exists to contrast the two rule types, and that contrast only reads if they
 * are neighbors.
 *
 * The selection is a `ref` + one-way `watch` like every other facet in this panel — see
 * `<WineChipSection>` for why a read-only `computed` is wrong on a worker-backed route.
 *
 * **`ValueRule` is the one rule whose `config` IS its value** rather than an object wrapping it, so an
 * absent rule and a cleared one both read back as the empty placeholder.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { value, type ValueRule } from '@filter-enginez/core';
import { clearRule, commitRule } from '@filter-enginez/examples-shared/wine-domain';
import { useEngineRefs } from '@filter-enginez/vue-signals';
import { computed, ref, watch } from 'vue';

import SectionHeader from '../../controls/SectionHeader.vue';
import SelectMenu from '../../controls/SelectMenu.vue';

const props = defineProps<{
	engine: SignalsEngine<Wine>;
	leaveExpressionMode: () => void;
	options: readonly string[];
}>();

const ruleRef = useEngineRefs(props.engine).rule('color-value');

/** The committed color; `''` when this facet carries no rule. */
const committed = computed<string>(() => (ruleRef.value as ValueRule<string> | undefined)?.config ?? '');

/** The painted selection — written on change, re-adopted on settle. */
const selected = ref<string>(committed.value);

watch(committed, (next) => {
	selected.value = next;
});

/** The `<SelectMenu>` option list, derived from the corpus vocabulary. */
const menuOptions = computed(() => props.options.map((entry) => ({ label: entry, value: entry })));

/**
 * Commit an exact color, or clear the facet when the placeholder is chosen.
 *
 * @param next - The chosen color, or `''` for "any".
 */
function handleChange(next: string): void {
	props.leaveExpressionMode();
	selected.value = next;

	if (next === '') {
		clearRule(props.engine, 'color-value');

		return;
	}
	commitRule(props.engine, 'color-value', value<string>('color', next));
}
</script>

<template>
	<section>
		<SectionHeader label="Single color (exact)" />
		<SelectMenu
			:options="menuOptions"
			placeholder="— any color —"
			select-label="Filter by exact wine color"
			:value="selected"
			@change="handleChange"
		/>
	</section>
</template>
