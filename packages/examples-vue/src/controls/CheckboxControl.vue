<script setup lang="ts">
/**
 * `<CheckboxControl>` — the shared single-checkbox row for a panel's boolean / exists toggle sections.
 * The Vue port of `examples-shared`'s `CheckboxControl`: a ≥44px touch target, accent tick, and
 * disabled/subdued treatment when turning it on would empty the result set. Layout is a small scoped
 * style (ui-styles has no dedicated class for this row).
 */
withDefaults(
	defineProps<{
		/** Whether the box is checked. */
		isChecked: boolean;
		/** When `true`, the box is disabled + subdued (turning it on would empty the result set). */
		isDisabled?: boolean;
		/** Checkbox label. */
		label: string;
	}>(),
	{
		isDisabled: false,
	},
);

const emit = defineEmits<{
	/** Change handler — receives the new checked state. */
	toggle: [checked: boolean];
}>();

function onChange(event: Event): void {
	emit('toggle', (event.target as HTMLInputElement).checked);
}
</script>

<template>
	<label
		class="fe-books-checkbox"
		:class="{ 'fe-books-checkbox--disabled': isDisabled }"
		:title="isDisabled ? 'No matches given your other filters' : undefined"
	>
		<input type="checkbox" :checked="isChecked" :disabled="isDisabled" @change="onChange" />
		{{ label }}
	</label>
</template>
