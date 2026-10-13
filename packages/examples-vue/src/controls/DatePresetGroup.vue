<script setup lang="ts" generic="V extends string">
/**
 * `<DatePresetGroup>` — a SINGLE-select pill group with an explicit "any" escape, over the shared
 * `fe-chip*` classes.
 *
 * @remarks
 * **Why not `ChipToggleGroup`.** That control is multi-select and exclusion-driven; this one is
 * neither. Relative date presets are mutually exclusive by nature — "last 7 days" and "this year" are
 * not a set to union, they are one choice — so selecting one must deselect the rest, and the neutral
 * state needs a real option rather than "nothing selected", which reads as broken. Forcing that
 * through a multi-select control would mean fighting its semantics at every call site.
 *
 * **No predictive disable, deliberately.** Every other facet dims options that would empty the result
 * set, but a `DateRangeRule` preset resolves against `Date.now()` at EVALUATION time — that is what
 * keeps "last 7 days" meaning the last seven days rather than the seven before page load. A projected
 * count computed at bundle-fetch time would therefore describe a slightly different window than the
 * one the rule will actually apply, so the honest thing is not to project at all. React's and Svelte's
 * sections make the same call.
 *
 * `aria-pressed` carries the selection, not color alone — the group is a set of toggle buttons, and a
 * user who cannot distinguish the cyan still needs to know which is active.
 *
 * **`groupLabel`, not `ariaLabel`** — see the note on `<ResultGrid>`'s `listLabel`. On a generic
 * component a `:aria-label` binding resolves against the global HTML aria typing rather than the prop,
 * which silently collapses `V` to `unknown` and reports the failure at the call site.
 */
defineProps<{
	/** Label for the option that clears the filter, e.g. `'Any time'`. */
	anyLabel: string;
	/** Accessible name for the group. */
	groupLabel: string;
	/** The selectable presets, in display order. */
	presets: readonly { readonly label: string; readonly value: V }[];
	/** The active preset, or `null` when the filter is off. */
	selected: V | null;
}>();

const emit = defineEmits<{
	/** Emitted with the chosen value, or `null` for the "any" option. The caller owns the rule. */
	select: [value: V | null];
}>();
</script>

<template>
	<div class="fe-chip-toggle" role="group" :aria-label="groupLabel">
		<button
			type="button"
			class="fe-chip"
			:class="{ 'fe-chip--selected': selected === null }"
			:aria-pressed="selected === null"
			@click="emit('select', null)"
		>
			{{ anyLabel }}
		</button>
		<button
			v-for="preset in presets"
			:key="preset.value"
			type="button"
			class="fe-chip"
			:class="{ 'fe-chip--selected': selected === preset.value }"
			:aria-pressed="selected === preset.value"
			@click="emit('select', preset.value)"
		>
			{{ preset.label }}
		</button>
	</div>
</template>
