<script lang="ts">
	/**
	 * `<WineNotesSection>` — a typo-tolerant `FuzzySearchRule` over a wine's tasting notes.
	 *
	 * @remarks
	 * The copy, the searched fields and the Fuse threshold are `WINE_SEARCHES.notes`, and the rule is
	 * `wineSearchRule('notes', query)`, both shared with every app's wine panel. The threshold is looser
	 * than the winery search's: a tasting note is a sentence rather than a short proper noun.
	 *
	 * **`description`, with `tastingNotes` as a secondary key.** There is no `tastingNotesText` field on
	 * `Wine`; extracting one would silently yield `undefined` for every row, which reads as "fuzzy
	 * search is just bad" rather than as a broken field name.
	 *
	 * **The field's timing is `<TypeaheadSearch>`'s**: a debounced commit while typing, an immediate
	 * one on blur, Enter or the clear button, and nothing committed when the query has not changed. An
	 * empty query REMOVES the rule rather than committing a permissive one, the panel's contract for
	 * every facet.
	 *
	 * The rule query comes off the PER-RULE store rather than the whole `activeRules` map, so a sibling
	 * facet's commit does not wake this field.
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
	const copy = WINE_SEARCHES.notes;

	/** This facet's own rule store. The engine never changes for a mounted section. */
	// svelte-ignore state_referenced_locally
	const ruleStore = createEngineStores(engine).rule('notes');

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
				clearRule(engine, 'notes');

				return;
			}
			commitRule(engine, 'notes', wineSearchRule('notes', query));
		}}
	/>
</section>
