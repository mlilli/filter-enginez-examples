<script setup lang="ts">
/**
 * `<WineSmartFilters>` — the expression-mode presets, and the only control in the panel that is not
 * backed by a rule.
 *
 * @remarks
 * Each preset commits a curated `CompositeRule` through `setExpression`, which is the whole point of
 * the facet: it is the one place in the app where a user drives the engine's expression algebra
 * rather than its flat-map mode.
 *
 * ## "Match any (OR)" is the section, not a garnish
 *
 * Single-select applies one canned expression; OR mode unions the selected presets into `or(...)`.
 * The expression is built by `buildSmartFilterExpression`, shared with React and SvelteKit — its
 * single-selection special case has to agree exactly with `deriveSelectedPresetIds`, which reads the
 * chips back, so the two live beside each other rather than in three panels.
 *
 * ## `isMulti` is seeded AND adopted, and the adopt is one-way
 *
 * More than one preset can only have been committed through OR mode, so a `?f` link carrying two must
 * restore the checkbox on — otherwise the chips come back multi-selected while the control claims
 * single-select, and the next click silently drops the others.
 *
 * The seed alone is not enough: `selected` derives off the engine's expression, and on the async tiers
 * `loadConfig` is fire-and-forget, so a restored expression can land a round trip AFTER this mounts.
 * Hence the watch — and it is deliberately **one-way**. Deriving `selected.length > 1` outright would
 * flip the checkbox off the moment a user in OR mode deselected down to one preset, silently changing
 * the mode they chose. Turning it ON when the selection proves it must already be on cannot be wrong.
 *
 * ## Applying a preset does not need to blank the manual controls
 *
 * `clearAllFacetRules` removes the flat rules and every facet section adopts its own rule's removal.
 * There is no reset handshake, and there was one until the sections started deriving.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import {
	commitSmartFilterSelection,
	exitExpressionMode,
	WINE_SMART_FILTERS,
} from '@filter-enginez/examples-shared/wine-domain';
import { computed, ref, watch } from 'vue';

import ChipToggleGroup from '../controls/ChipToggleGroup.vue';
import SectionHeader from '../controls/SectionHeader.vue';

const props = withDefaults(
	defineProps<{
		engine: SignalsEngine<Wine>;
		/** The lit preset ids, derived by the panel off the engine's expression. */
		selected?: readonly string[];
	}>(),
	{
		selected: () => [],
	},
);

const emit = defineEmits<{
	/** The panel paints this locally before the engine round trip confirms it. */
	selectedChange: [next: readonly string[]];
}>();

/** Whether "Match any (OR)" is on. Seeded, then adopted one-way — see the docblock. */
const isMulti = ref<boolean>(props.selected.length > 1);

watch(
	() => props.selected.length,
	(count) => {
		if (count > 1) {
			isMulti.value = true;
		}
	},
);

/** The chip vocabulary — preset ids, rendered through {@link labelFor}. */
const presetIds = computed(() => WINE_SMART_FILTERS.map((preset) => preset.id));

/**
 * The human label for a preset id.
 *
 * @param id - The preset id.
 * @returns Its label, or the id when unknown.
 */
function labelFor(id: string): string {
	return WINE_SMART_FILTERS.find((preset) => preset.id === id)?.label ?? id;
}

/**
 * Apply a selection as an expression, or clear it.
 *
 * @param next - The preset ids to apply.
 */
function apply(next: readonly string[]): void {
	emit('selectedChange', next);
	// The shared helper every vertical's preset row calls. A non-empty selection clears the flat facets
	// first: an expression AND a leftover flat rule would both be on the engine, the rule dormant behind
	// the expression and back the moment the preset is cleared. An empty selection only leaves
	// expression mode.
	commitSmartFilterSelection(props.engine, next);
}

/**
 * Toggle one preset, honoring the current combination mode.
 *
 * @param id - The preset clicked.
 */
function toggle(id: string): void {
	if (props.selected.includes(id)) {
		apply(props.selected.filter((entry) => entry !== id));

		return;
	}
	apply(isMulti.value ? [...props.selected, id] : [id]);
}

/**
 * Switch between single-select and OR, clearing the current selection.
 *
 * @param event - The checkbox's change event.
 */
function changeMode(event: Event): void {
	isMulti.value = (event.currentTarget as HTMLInputElement).checked;
	emit('selectedChange', []);
	exitExpressionMode(props.engine);
}
</script>

<template>
	<section class="fe-filter-panel__section--divided">
		<SectionHeader label="Smart filters" note="(expression mode)" />

		<label class="fe-wine-smart__mode">
			<input type="checkbox" :checked="isMulti" @change="changeMode" />
			<span>Match any (OR)</span>
		</label>

		<ChipToggleGroup
			:format-label="labelFor"
			:options="presetIds"
			:selected="selected"
			@toggle="toggle"
		/>

		<div v-if="selected.length > 0" class="fe-wine-smart__paused">
			<span>Manual filters are paused.</span>
			<button class="fe-wine-smart__clear" type="button" @click="apply([])">
				Clear smart filters
			</button>
		</div>
	</section>
</template>
