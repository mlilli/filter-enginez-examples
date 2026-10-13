<script setup lang="ts">
/**
 * `<ChipToggleGroup>` — reusable chip-toggle set for InSet-style filters with exclusion-aware
 * disabling. The Vue port of `react-ui`'s `ChipToggleGroup`, reusing the `fe-chip*` classes verbatim.
 *
 * **Exclusion-aware disabling:** when an `exclusion` map is supplied, chips whose addition would empty
 * the result set are subdued (`fe-chip--unavailable`) + `disabled`, telling the user "this would give
 * zero matches" before they click. Selected chips always stay clickable so the user can deselect to
 * escape. With `showCount`, unselected chips show the projected result count.
 */
import type { ChipExclusion, ExclusionMap } from '@filter-enginez/examples-shared/bundle-readers';

const props = withDefaults(
	defineProps<{
		/** All candidate values to render as chips, in display order. */
		options: readonly string[];
		/** Currently-selected values. */
		selected: readonly string[];
		/** Optional exclusion data. Chips whose addition would yield zero results are disabled + subdued. */
		exclusion?: ExclusionMap;
		/** If `true` and exclusion is provided, show projected-count badges on unselected chips. */
		showCount?: boolean;
		/** Optional per-chip label formatter. Defaults to identity. */
		formatLabel?: (value: string) => string;
		/**
		 * Cap the group's height and scroll it, for facets with a long vocabulary.
		 *
		 * @remarks
		 * Wine's varietal facet renders 60 chips; uncapped, it pushes the eight sections below it off
		 * the panel. Expressed as a modifier on this element rather than a wrapper `<div>` so opting in
		 * costs a prop rather than a change of markup shape.
		 */
		scrollable?: boolean;
	}>(),
	{
		exclusion: undefined,
		formatLabel: (value: string) => value,
		scrollable: false,
		showCount: false,
	},
);

const emit = defineEmits<{
	/** Emitted when a chip is clicked. Caller toggles the underlying rule. */
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

function titleFor(option: string): string | undefined {
	const data = exclusionData(option);

	if (isUnavailable(option)) {
		return `No matches for ${props.formatLabel(option)} given your other filters`;
	}
	if (props.showCount && data) {
		return `${data.projectedCount.toLocaleString()} would match`;
	}

	return undefined;
}
</script>

<template>
	<div class="fe-chip-toggle" :class="{ 'fe-chip-toggle--capped': scrollable }">
		<button
			v-for="option in options"
			:key="option"
			type="button"
			class="fe-chip"
			:class="{ 'fe-chip--selected': isSelected(option), 'fe-chip--unavailable': isUnavailable(option) }"
			:disabled="isUnavailable(option)"
			:aria-pressed="isSelected(option)"
			:title="titleFor(option)"
			@click="emit('toggle', option)"
		>
			{{ formatLabel(option) }}
			<span
				v-if="showCount && exclusionData(option) && !isSelected(option)"
				class="fe-chip__count"
				:class="{ 'fe-chip__count--unavailable': isUnavailable(option) }"
			>
				({{ exclusionData(option)!.projectedCount.toLocaleString() }})
			</span>
		</button>
	</div>
</template>
