<script lang="ts">
	/**
	 * `<SingleColorSection>` — an exact-match `ValueRule` over a wine's color.
	 *
	 * @remarks
	 * Sits directly beneath the color CHIPS, which are an `InSetRule` over the same field. The
	 * adjacency is the point: the demo exists to contrast the two rule types, and that contrast only
	 * reads if they are neighbors.
	 *
	 * The selection is a WRITABLE `$derived` off this facet's rule, like every other facet in the panel
	 * — see `<WineChipSection>` for why the derivation has to be writable on a worker-backed route.
	 * `ValueRule` is the one rule whose `config` IS its value rather than an object wrapping it, so an
	 * absent rule and a cleared one both read back as the empty placeholder.
	 */

	import type { Wine } from '@filter-enginez/mock-data/wine';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { value, type ValueRule } from '@filter-enginez/core';
	import { createEngineStores } from '@filter-enginez/svelte-signals';
	import SectionHeader from '$lib/controls/SectionHeader.svelte';
	import SelectMenu from '$lib/controls/SelectMenu.svelte';

	import { clearRule, commitRule } from '../wineCommit.js';

	const {
		engine,
		leaveExpressionMode,
		options,
	}: {
		engine: SignalsEngine<Wine>;
		leaveExpressionMode: () => void;
		options: readonly string[];
	} = $props();

	/** This facet's own rule store. The engine never changes for a mounted section. */
	// svelte-ignore state_referenced_locally
	const ruleStore = createEngineStores(engine).rule('color-value');

	/** The committed color — a WRITABLE `$derived`; `''` when this facet carries no rule. */
	let selected = $derived(($ruleStore as ValueRule<string> | undefined)?.config ?? '');
</script>

<section>
	<SectionHeader label="Single color (exact)" />
	<SelectMenu
		options={options.map((entry) => ({ label: entry, value: entry }))}
		value={selected}
		placeholder="— any color —"
		ariaLabel="Filter by exact wine color"
		onChange={(next) => {
			leaveExpressionMode();
			selected = next;
			if (next === '') {
				clearRule(engine, 'color-value');

				return;
			}
			commitRule(engine, 'color-value', value<string>('color', next));
		}}
	/>
</section>
