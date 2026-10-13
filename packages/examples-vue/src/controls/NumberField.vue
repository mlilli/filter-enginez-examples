<script setup lang="ts">
/**
 * `<NumberField>` — a numeric input over the shared `fe-number-field` class.
 *
 * @remarks
 * The Vue counterpart to react-ui's and SvelteKit's `<NumberField>`. Styling is entirely `ui-styles`
 * (`.fe-number-field`); this component contributes markup and a commit rule and nothing else.
 *
 * **Commits on `change`, never `input`.** A number field emits an event per keystroke, and mid-typing
 * values are usually nonsense — typing "95" passes through "9" first, which would fire a filter for
 * scores above nine and briefly show the whole corpus. `change` fires on blur or Enter, when the
 * number the user meant is actually there. On the worker tier that difference is not cosmetic: each
 * intermediate value is a full round trip against 130k records.
 *
 * **A non-numeric or empty field is ignored rather than coerced.** `Number('')` is `0`, which would
 * silently become a real threshold the moment someone cleared the box to retype — a points filter of
 * "≥ 0" looks exactly like no filter at all while being a live rule.
 *
 * **`fieldLabel`, not `ariaLabel`.** This app names accessible-name props for their role
 * (`listLabel` / `groupLabel` / `sliderLabel` / `selectLabel` / `inputLabel`) because a prop literally
 * called `ariaLabel` resolves against the global `AriaAttributes` typing on a generic component and
 * reports the failure at every call site. This component is not generic, so it would survive the
 * name — but the convention is worth more than the exception, and the next control someone copies
 * this into may well be.
 */

defineProps<{
	/** Accessible name for the input. Not `ariaLabel` — see the docblock. */
	fieldLabel: string;
	max?: number;
	min?: number;
	step?: number;
	value: number;
}>();

const emit = defineEmits<{
	/** Emitted on commit — blur or Enter — and only when the field parses to a finite number. */
	change: [next: number];
}>();

/**
 * Parse and forward a committed value, dropping anything that is not a real number.
 *
 * @param event - The input's `change` event.
 */
function handleChange(event: Event): void {
	const input = event.currentTarget as HTMLInputElement;
	const next = Number.parseFloat(input.value);

	if (Number.isFinite(next)) {
		emit('change', next);
	}
}
</script>

<template>
	<input
		class="fe-number-field"
		type="number"
		:aria-label="fieldLabel"
		:max="max"
		:min="min"
		:step="step ?? 1"
		:value="value"
		@change="handleChange"
	/>
</template>
