<script lang="ts">
	/**
	 * `<NumberField>` — a numeric input over the shared `fe-number-field` class.
	 *
	 * @remarks
	 * The Svelte counterpart to react-ui's `<NumberField />`. Styling is entirely `ui-styles`.
	 *
	 * Commits on `change` rather than `input`. A number field emits an event per keystroke, and mid-typing
	 * values are usually nonsense — typing "95" passes through "9" first, which would fire a filter for
	 * scores above nine and briefly show the whole corpus. `change` fires on blur or Enter, when the
	 * number the user meant is actually there.
	 *
	 * A non-numeric or empty field is ignored rather than coerced: `Number('')` is 0, which would silently
	 * become a real threshold the moment someone cleared the box to retype.
	 */

	const {
		ariaLabel,
		max,
		min,
		onChange,
		step = 1,
		value,
	}: {
		ariaLabel: string;
		max?: number;
		min?: number;
		onChange: (next: number) => void;
		step?: number;
		value: number;
	} = $props();
</script>

<input
	type="number"
	class="fe-number-field"
	aria-label={ariaLabel}
	{max}
	{min}
	{step}
	{value}
	onchange={(event) => {
		const next = Number.parseFloat(event.currentTarget.value);

		if (Number.isFinite(next)) {
			onChange(next);
		}
	}}
/>
