<script setup lang="ts">
/**
 * `<CheckboxList>` — scrollable checkbox list for high-cardinality InSet filters, with
 * exclusion-aware disabling and projected counts.
 *
 * @remarks
 * The Vue port of react-ui's and Svelte's `<CheckboxList>`, reusing the `fe-checkbox-list*` classes
 * verbatim.
 *
 * **Why not `ChipToggleGroup`.** Chips wrap and are scannable at a dozen or so values; a facet with a
 * hundred (real estate's school districts) becomes an unreadable wall that pushes every section below
 * it off screen. A capped, scrolling list keeps the facet browsable and the panel navigable.
 *
 * **Exclusion-aware disabling** matches `ChipToggleGroup` exactly, deliberately — the two controls
 * differ in layout, not in semantics. A row whose selection would empty the result set is subdued
 * (`--unavailable`) and disabled, so the user learns "zero matches" before clicking. Selected rows
 * always stay clickable, or a user who filtered themselves into a corner would have no way out.
 *
 * **`<label>`-wrapped input, not a `<button role="checkbox">`** — this is a plain binary choice, so
 * the native control carries the state, the keyboard behavior and the announcement for free. The
 * tri-state hierarchical picker needs the button treatment because `aria-checked="mixed"` has no
 * native equivalent; nothing here is mixed.
 */
import type { ChipExclusion, ExclusionMap } from '@filter-enginez/examples-shared/bundle-readers';

const props = withDefaults(
	defineProps<{
		/** Optional exclusion data. Rows whose selection would yield zero results are disabled + subdued. */
		exclusion?: ExclusionMap;
		/** Cap on the scroller's height, as a CSS length. Beyond this the list scrolls. */
		maxHeight?: string;
		/** All candidate values, in display order. */
		options: readonly string[];
		/** Currently-selected values. */
		selected: readonly string[];
		/** If `true` and exclusion is provided, show projected-count badges on unselected rows. */
		showCount?: boolean;
	}>(),
	{
		exclusion: undefined,
		maxHeight: '16rem',
		showCount: false,
	},
);

const emit = defineEmits<{
	/** Emitted when a row is toggled. The caller owns the underlying rule. */
	toggle: [value: string];
}>();

function isSelected(option: string): boolean {
	return props.selected.includes(option);
}

function exclusionData(option: string): ChipExclusion | undefined {
	return props.exclusion?.get(option);
}

function isUnavailable(option: string): boolean {
	return (exclusionData(option)?.wouldBeEmpty ?? false) && !isSelected(option);
}
</script>

<template>
	<div class="fe-checkbox-list" :style="{ maxHeight }">
		<label
			v-for="option in options"
			:key="option"
			class="fe-checkbox-list__row"
			:class="{
				'fe-checkbox-list__row--selected': isSelected(option),
				'fe-checkbox-list__row--unavailable': isUnavailable(option),
			}"
			:title="isUnavailable(option) ? `No matches for ${option} given your other filters` : undefined"
		>
			<span class="fe-checkbox-list__main">
				<input
					type="checkbox"
					class="fe-checkbox-list__box"
					:checked="isSelected(option)"
					:disabled="isUnavailable(option)"
					@change="emit('toggle', option)"
				/>
				<span class="fe-checkbox-list__label">{{ option }}</span>
			</span>
			<span
				v-if="showCount && exclusionData(option) && !isSelected(option)"
				class="fe-checkbox-list__count"
				:class="{ 'fe-checkbox-list__count--unavailable': isUnavailable(option) }"
			>
				{{ exclusionData(option)!.projectedCount.toLocaleString() }}
			</span>
		</label>
	</div>
</template>
