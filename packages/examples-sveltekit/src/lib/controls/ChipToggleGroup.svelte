<script lang="ts">
	/**
	 * `<ChipToggleGroup>` — reusable chip-toggle set for InSet-style filters with exclusion-aware
	 * disabling. The Svelte port of `react-ui`'s `ChipToggleGroup`, reusing the `fe-chip*` classes
	 * verbatim.
	 *
	 * **Exclusion-aware disabling:** when an `exclusion` map is supplied, chips whose addition would
	 * empty the result set are subdued (`fe-chip--unavailable`) + `disabled`, telling the user "this
	 * would give zero matches" before they click. Selected chips always stay clickable so the user can
	 * deselect to escape. With `showCount`, unselected chips show the projected result count.
	 *
	 * The label and its badge sit on one line with nothing between them: Svelte keeps one space where a
	 * line break separates two nodes, and a chip's text reads `red(86,914)` in every app
	 * (`tests/tooling/filterPanelMarkupParity.test.ts`).
	 */

	import type { ExclusionMap } from '@filter-enginez/examples-shared/bundle-readers';

	interface Props {
		/** All candidate values to render as chips, in display order. */
		readonly options: readonly string[];
		/** Currently-selected values. */
		readonly selected: readonly string[];
		/** Called when a chip is clicked. Caller toggles the underlying rule. */
		readonly onToggle: (value: string) => void;
		/** Optional exclusion data. Chips whose addition would yield zero results are disabled + subdued. */
		readonly exclusion?: ExclusionMap;
		/** If `true` and exclusion is provided, show projected-count badges on unselected chips. */
		readonly showCount?: boolean;
		/** Optional per-chip label formatter. Defaults to identity. */
		readonly formatLabel?: (value: string) => string;
		/**
		 * Cap the group's height and scroll it, for facets with a long vocabulary.
		 *
		 * @remarks
		 * Wine's varietal facet renders 60 chips; uncapped it pushes the eight sections below it off the
		 * panel. The cap is `.fe-chip-toggle--capped` in `ui-styles`, shared with the Vue app and named
		 * for the component rather than the dataset.
		 */
		readonly scrollable?: boolean;
	}

	const {
		exclusion,
		formatLabel = (value: string) => value,
		onToggle,
		options,
		scrollable = false,
		selected,
		showCount = false,
	}: Props = $props();
</script>

<div class="fe-chip-toggle" class:fe-chip-toggle--capped={scrollable}>
	{#each options as option (option)}
		{@const isSelected = selected.includes(option)}
		{@const exclusionData = exclusion?.get(option)}
		{@const isUnavailable = (exclusionData?.wouldBeEmpty ?? false) && !isSelected}
		<button
			type="button"
			class="fe-chip"
			class:fe-chip--selected={isSelected}
			class:fe-chip--unavailable={isUnavailable}
			disabled={isUnavailable}
			aria-pressed={isSelected}
			onclick={() => onToggle(option)}
			title={isUnavailable
				? `No matches for ${formatLabel(option)} given your other filters`
				: showCount && exclusionData
					? `${exclusionData.projectedCount.toLocaleString()} would match`
					: undefined}
		>
			{formatLabel(option)}{#if showCount && exclusionData && !isSelected}<span class="fe-chip__count" class:fe-chip__count--unavailable={isUnavailable}>({exclusionData.projectedCount.toLocaleString()})</span>{/if}
		</button>
	{/each}
</div>
