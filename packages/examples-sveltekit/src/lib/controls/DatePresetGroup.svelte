<script lang="ts" generics="V extends string">
	/**
	 * `<DatePresetGroup>` — a SINGLE-select pill group with an explicit "any" escape, over the shared
	 * `fe-chip*` classes.
	 *
	 * **Why not `ChipToggleGroup`.** That control is multi-select and exclusion-driven; this one is
	 * neither. Relative date presets are mutually exclusive by nature — "last 7 days" and "this year"
	 * are not a set to union, they are one choice — so selecting one must deselect the rest, and the
	 * neutral state needs a real option rather than "nothing selected", which reads as broken. Forcing
	 * that through a multi-select control would mean fighting its semantics at every call site.
	 *
	 * **No predictive disable, deliberately.** Every other facet dims options that would empty the
	 * result set, but a `DateRangeRule` preset resolves against `Date.now()` at EVALUATION time — that
	 * is what keeps "last 7 days" meaning the last seven days rather than the seven before page load.
	 * A projected count computed at bundle-fetch time would therefore be describing a slightly
	 * different window than the one the rule will actually apply, so the honest thing is not to
	 * project at all. React's section makes the same call.
	 *
	 * `aria-pressed` carries the selection, not color alone — the group is a set of toggle buttons, and
	 * a user who cannot distinguish the cyan still needs to know which is active.
	 */

	interface Props {
		/** Label for the option that clears the filter, e.g. `'Any time'`. */
		readonly anyLabel: string;
		/** Accessible name for the group. */
		readonly ariaLabel: string;
		/** Called with the chosen value, or `null` for the "any" option. The caller owns the rule. */
		readonly onSelect: (value: V | null) => void;
		/** The selectable presets, in display order. */
		readonly presets: readonly { readonly label: string; readonly value: V }[];
		/** The active preset, or `null` when the filter is off. */
		readonly selected: V | null;
	}

	const { anyLabel, ariaLabel, onSelect, presets, selected }: Props = $props();
</script>

<div class="fe-chip-toggle" role="group" aria-label={ariaLabel}>
	<button
		type="button"
		class="fe-chip"
		class:fe-chip--selected={selected === null}
		aria-pressed={selected === null}
		onclick={() => onSelect(null)}
	>
		{anyLabel}
	</button>
	{#each presets as preset (preset.value)}
		{@const isActive = selected === preset.value}
		<button
			type="button"
			class="fe-chip"
			class:fe-chip--selected={isActive}
			aria-pressed={isActive}
			onclick={() => onSelect(preset.value)}
		>
			{preset.label}
		</button>
	{/each}
</div>
