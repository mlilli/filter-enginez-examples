<script lang="ts">
	/**
	 * `<WinerySearchSection>` — a typo-tolerant `FuzzySearchRule` over a wine's winery.
	 *
	 * @remarks
	 * The copy and the Fuse threshold are `WINE_SEARCHES.winery`, and the rule is
	 * `wineSearchRule('winery', query)`, both shared with every app's wine panel. The threshold is
	 * tighter than the tasting-note search's: a winery name is a short proper noun, and a loose
	 * threshold on short strings matches most of the corpus.
	 *
	 * The field's timing is `<TypeaheadSearch>`'s, and an empty query REMOVES the rule, exactly as the
	 * tasting-note search does — see `<WineNotesSection>`.
	 */

	import type { FuzzySearchRule } from '@filter-enginez/core';
	import type { Wine } from '@filter-enginez/mock-data/wine';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { WINE_SEARCHES, wineSearchRule } from '@filter-enginez/examples-shared/wine-domain';
	import { createEngineStores } from '@filter-enginez/svelte-signals';
	import SectionHeader from '$lib/controls/SectionHeader.svelte';
	import TypeaheadSearch from '$lib/controls/TypeaheadSearch.svelte';

	import { clearRule, commitRule } from '../wineCommit.js';

	const {
		engine,
		leaveExpressionMode,
	}: {
		engine: SignalsEngine<Wine>;
		leaveExpressionMode: () => void;
	} = $props();

	/** This field's copy. */
	const copy = WINE_SEARCHES.winery;

	/** This facet's own rule store. The engine never changes for a mounted section. */
	// svelte-ignore state_referenced_locally
	const ruleStore = createEngineStores(engine).rule('winery');

	/** The committed query; `''` when this facet carries no rule. */
	const ruleQuery = $derived(($ruleStore as FuzzySearchRule | undefined)?.config.query ?? '');
</script>

<section>
	<SectionHeader label={copy.label} />
	<TypeaheadSearch
		ariaLabel={copy.ariaLabel}
		placeholder={copy.placeholder}
		{ruleQuery}
		commit={(query: string) => {
			leaveExpressionMode();
			if (query === '') {
				clearRule(engine, 'winery');

				return;
			}
			commitRule(engine, 'winery', wineSearchRule('winery', query));
		}}
	/>
</section>
