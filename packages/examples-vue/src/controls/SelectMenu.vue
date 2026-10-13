<script setup lang="ts">
/**
 * `<SelectMenu>` — a labelled `<select>` over the shared `fe-select` classes.
 *
 * @remarks
 * The Vue counterpart to react-ui's and Svelte's `<SelectMenu>`. All styling comes from
 * `@filter-enginez/ui-styles` — the chrome, the focus ring, the suppressed native arrow and the drawn
 * one — so this component contributes markup and nothing else.
 *
 * The placeholder is a real `<option value="">`, not a `disabled` one: for these filters "no
 * selection" is a legitimate state meaning "this facet is off", so the user has to be able to return
 * to it. A disabled placeholder would make the filter one-way.
 */
defineProps<{
	/** Accessible name for the select. Not `ariaLabel` — see `<ResultGrid>`'s `listLabel`. */
	selectLabel: string;
	/** The selectable options, in display order. */
	options: readonly { readonly label: string; readonly value: string }[];
	/** Optional "no selection" label. Omit it and the facet has no off switch. */
	placeholder?: string;
	/** The selected value, or `''` for the placeholder. */
	value: string;
}>();

const emit = defineEmits<{
	/** Emitted with the newly-chosen value. The caller owns the underlying rule. */
	change: [next: string];
}>();

/** Read the new value off the native event, so the template stays free of casts. */
function handleChange(event: Event): void {
	emit('change', (event.target as HTMLSelectElement).value);
}
</script>

<template>
	<div class="fe-select">
		<select class="fe-select__field" :aria-label="selectLabel" :value="value" @change="handleChange">
			<option v-if="placeholder !== undefined" value="">{{ placeholder }}</option>
			<option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
		</select>
		<!--
			`fe-select__chevron`, not a text glyph. ui-styles positions THIS class (absolute, right: 10px);
			a made-up class name renders unstyled and lands flush against the border. Geometry copied from
			React's `<SelectMenu />` so the two match.
		-->
		<svg
			class="fe-select__chevron"
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="m6 9 6 6 6-6" />
		</svg>
	</div>
</template>
