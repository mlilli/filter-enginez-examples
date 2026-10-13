<script lang="ts">
	/**
	 * `<WinerySearchSection>` — a typo-tolerant `FuzzySearchRule` over a wine's winery.
	 *
	 * @remarks
	 * Tighter threshold than the tasting-note search (0.35 vs 0.45), matching React. A winery name is
	 * a short proper noun, and a loose threshold on short strings matches most of the corpus — which
	 * reads as "fuzzy search is broken" rather than as a tuning choice.
	 *
	 * What the input displays is a writable `$derived` off this facet's own rule store — see
	 * `<WineNotesSection>` for why that is the right shape for a control holding uncommitted
	 * keystrokes, and why the store has to be per-rule rather than the whole `activeRules` map.
	 *
	 * **Unlike the tasting-note search, an empty query still commits a rule here**, and the
	 * active-filter chips the e2e specs assert reflect that rule.
	 */

	import type { Wine } from '@filter-enginez/mock-data/wine';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { fuzzy, type FuzzySearchRule } from '@filter-enginez/core';
	import { createEngineStores } from '@filter-enginez/svelte-signals';
	import SearchInput from '$lib/controls/SearchInput.svelte';
	import SectionHeader from '$lib/controls/SectionHeader.svelte';

	import { commitRule } from '../wineCommit.js';

	const {
		engine,
		leaveExpressionMode,
	}: {
		engine: SignalsEngine<Wine>;
		leaveExpressionMode: () => void;
	} = $props();

	/** This facet's own rule store. The engine never changes for a mounted section. */
	// svelte-ignore state_referenced_locally
	const ruleStore = createEngineStores(engine).rule('winery');

	/** What the input displays — a writable `$derived`; see the docblock. */
	let query = $derived(($ruleStore as FuzzySearchRule | undefined)?.config.query ?? '');
</script>

<section>
	<SectionHeader label="Winery (typo-tolerant)" />
	<SearchInput
		value={query}
		placeholder="Vandermark, Caruso, Hartmann..."
		ariaLabel="Search wineries with typo tolerance"
		onChange={(next) => {
			query = next;
		}}
		onCommit={(next) => {
			leaveExpressionMode();
			commitRule(engine, 'winery', fuzzy('winery', { query: next.trim(), threshold: 0.35 }));
		}}
	/>
</section>
