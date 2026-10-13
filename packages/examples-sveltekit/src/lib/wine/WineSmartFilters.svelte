<script lang="ts">
	/**
	 * `<WineSmartFilters>` — the expression-mode preset section.
	 *
	 * @remarks
	 * Its own component for the same reason React splits `SmartFilterPresets.tsx` out: it is the only
	 * section that does not commit a flat rule, and it owns two pieces of state (the selection and the
	 * combination mode) that nothing else touches. Extracting it also brought the panel back under the
	 * repo's 500-line file cap.
	 *
	 * **"Match any (OR)" is the point of the section.** Single-select applies one canned expression;
	 * OR mode unions the selected presets into `or(...)` — the only place in the app where the user
	 * composes an expression rather than picking one. Switching modes RESETS the selection, matching
	 * React: "this preset" and "any of these" mean different things, and carrying a selection across
	 * would change what the results mean without the user asking.
	 *
	 * While a preset is active the manual facets are dormant, so the section says so and offers a way
	 * back — otherwise the panel shows controls that do nothing with no explanation.
	 */

	import type { Wine } from '@filter-enginez/mock-data/wine';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { buildSmartFilterExpression, WINE_SMART_FILTERS } from '@filter-enginez/examples-shared/wine-domain';
	import ChipToggleGroup from '$lib/controls/ChipToggleGroup.svelte';
	import SectionHeader from '$lib/controls/SectionHeader.svelte';

	import { clearAllFacetRules, commitExpression } from './wineCommit.js';

	const {
		engine,
		onSelectedChange,
		selected = [],
	}: {
		engine: SignalsEngine<Wine>;
		onSelectedChange: (next: readonly string[]) => void;
		selected?: readonly string[];
	} = $props();

	/**
	 * Whether "Match any (OR)" is on.
	 *
	 * @remarks
	 * Seeded from the restored selection rather than starting `false`: more than one preset can only
	 * have been committed through OR mode, so a `?f` link carrying two would otherwise restore the chips
	 * multi-selected while the control claimed single-select — and the next click would silently drop
	 * the others.
	 *
	 * The seed alone is not sufficient, because `selected` is a derivation off the engine's
	 * expression: on the async tiers `loadConfig` is fire-and-forget, so a restored expression can land
	 * a round trip AFTER this component initializes, and the seed would read `[]`. Hence the effect,
	 * which is deliberately ONE-WAY. Deriving `selected.length > 1` outright would flip the checkbox
	 * off the moment a user in OR mode deselected down to a single preset, silently changing the mode
	 * they chose; turning it on when the selection proves it must already be on cannot be wrong.
	 */
	// svelte-ignore state_referenced_locally
	let isMulti = $state(selected.length > 1);

	// Reads `selected` only, never `isMulti`, so it wakes on an engine-side restore and not on a local
	// mode change.
	$effect(() => {
		if (selected.length > 1) {
			isMulti = true;
		}
	});

	/**
	 * Apply a selection as an expression, or clear it.
	 *
	 * @param next - The preset ids to apply.
	 */
	function apply(next: readonly string[]): void {
		onSelectedChange(next);

		if (next.length === 0) {
			commitExpression(engine, null);

			return;
		}

		// Clear the flat facets first. An expression AND a leftover flat rule would both apply, so the
		// results would be narrower than the preset describes with no control explaining why. Removing
		// the rules is the whole job: every facet section adopts its own rule's removal, so there is no
		// second call needed to blank the controls.
		clearAllFacetRules(engine);

		// The single-selection special case lives in `buildSmartFilterExpression`, beside the
		// `deriveSelectedPresetIds` that has to read it back. Open-coding it here is what made it a
		// second copy; three more verticals were about to make it five.
		commitExpression(engine, buildSmartFilterExpression(next));
	}

	/**
	 * Toggle one preset, honoring the current combination mode.
	 *
	 * @param id - The preset clicked.
	 */
	function toggle(id: string): void {
		if (selected.includes(id)) {
			apply(selected.filter((entry) => entry !== id));

			return;
		}
		apply(isMulti ? [...selected, id] : [id]);
	}

	/**
	 * Switch between single-select and OR.
	 *
	 * @param multi - Whether OR mode is on.
	 */
	function changeMode(multi: boolean): void {
		isMulti = multi;
		onSelectedChange([]);
		commitExpression(engine, null);
	}

	/**
	 * The human label for a preset id.
	 *
	 * @param id - The preset id.
	 * @returns Its label, or the id when unknown.
	 */
	function labelFor(id: string): string {
		return WINE_SMART_FILTERS.find((preset) => preset.id === id)?.label ?? id;
	}
</script>

<section class="fe-filter-panel__section--divided">
	<SectionHeader label="Smart filters" note="(expression mode)" />

	<label class="fe-wine-smart__mode">
		<input
			type="checkbox"
			checked={isMulti}
			onchange={(event) => {
				changeMode(event.currentTarget.checked);
			}}
		/>
		<span>Match any (OR)</span>
	</label>

	<ChipToggleGroup
		options={WINE_SMART_FILTERS.map((preset) => preset.id)}
		{selected}
		formatLabel={labelFor}
		onToggle={toggle}
	/>

	{#if selected.length > 0}
		<div class="fe-wine-smart__paused">
			<span>Manual filters are paused.</span>
			<button
				type="button"
				class="fe-wine-smart__clear"
				onclick={() => {
					apply([]);
				}}
			>
				Clear smart filters
			</button>
		</div>
	{/if}
</section>
