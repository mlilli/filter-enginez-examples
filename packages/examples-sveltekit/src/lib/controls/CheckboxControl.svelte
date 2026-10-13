<script lang="ts">
	/**
	 * `<CheckboxControl>` — the shared single-checkbox row for the books boolean / exists toggle
	 * sections. The Svelte port of `examples-shared`'s `CheckboxControl`: a ≥44px touch target, accent
	 * tick, and disabled/subdued treatment when turning it on would empty the result set. Layout is a
	 * small scoped style (ui-styles has no dedicated class for this row; the React original inlines the
	 * same rules).
	 */

	interface Props {
		/** Whether the box is checked. */
		readonly isChecked: boolean;
		/** When `true`, the box is disabled + subdued (turning it on would empty the result set). */
		readonly isDisabled?: boolean;
		/** Checkbox label. */
		readonly label: string;
		/** Change handler — receives the new checked state. */
		readonly onToggle: (checked: boolean) => void;
	}

	const { isChecked, isDisabled = false, label, onToggle }: Props = $props();
</script>

<label
	class="fe-books-checkbox"
	class:fe-books-checkbox--disabled={isDisabled}
	title={isDisabled ? 'No matches given your other filters' : undefined}
>
	<input
		type="checkbox"
		checked={isChecked}
		disabled={isDisabled}
		onchange={(event) => onToggle(event.currentTarget.checked)}
	/>
	{label}
</label>
