<script lang="ts">
	/**
	 * `<CheckboxList>` — scrollable checkbox list for high-cardinality InSet filters, with
	 * exclusion-aware disabling and projected counts. The Svelte port of `react-ui`'s `CheckboxList`,
	 * reusing the `fe-checkbox-list*` classes verbatim.
	 *
	 * **Why not `ChipToggleGroup`.** Chips wrap and are scannable at a dozen or so values; a facet with
	 * a hundred (real estate's school districts) becomes an unreadable wall that pushes every section
	 * below it off screen. A capped, scrolling list keeps the facet browsable and the panel navigable.
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

	import type { ExclusionMap } from '@filter-enginez/examples-shared/bundle-readers';

	interface Props {
		/** Optional exclusion data. Rows whose selection would yield zero results are disabled + subdued. */
		readonly exclusion?: ExclusionMap;
		/** Cap on the scroller's height, as a CSS length. Beyond this the list scrolls. */
		readonly maxHeight?: string;
		/** Called when a row is toggled. The caller owns the underlying rule. */
		readonly onToggle: (value: string) => void;
		/** All candidate values, in display order. */
		readonly options: readonly string[];
		/** Currently-selected values. */
		readonly selected: readonly string[];
		/** If `true` and exclusion is provided, show projected-count badges on unselected rows. */
		readonly showCount?: boolean;
	}

	const {
		exclusion,
		maxHeight = '16rem',
		onToggle,
		options,
		selected,
		showCount = false,
	}: Props = $props();
</script>

<div class="fe-checkbox-list" style="max-height: {maxHeight}">
	{#each options as option (option)}
		{@const isSelected = selected.includes(option)}
		{@const exclusionData = exclusion?.get(option)}
		{@const isUnavailable = (exclusionData?.wouldBeEmpty ?? false) && !isSelected}
		<label
			class="fe-checkbox-list__row"
			class:fe-checkbox-list__row--selected={isSelected}
			class:fe-checkbox-list__row--unavailable={isUnavailable}
			title={isUnavailable ? `No matches for ${option} given your other filters` : undefined}
		>
			<span class="fe-checkbox-list__main">
				<input
					type="checkbox"
					class="fe-checkbox-list__box"
					checked={isSelected}
					disabled={isUnavailable}
					onchange={() => onToggle(option)}
				/>
				<span class="fe-checkbox-list__label">{option}</span>
			</span>
			{#if showCount && exclusionData && !isSelected}
				<span
					class="fe-checkbox-list__count"
					class:fe-checkbox-list__count--unavailable={isUnavailable}
				>
					{exclusionData.projectedCount.toLocaleString()}
				</span>
			{/if}
		</label>
	{/each}
</div>
