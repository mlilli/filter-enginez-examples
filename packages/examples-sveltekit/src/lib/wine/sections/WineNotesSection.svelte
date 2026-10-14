<script lang="ts">
	/**
	 * `<WineNotesSection>` — a typo-tolerant `FuzzySearchRule` over a wine's tasting notes.
	 *
	 * @remarks
	 * The looser sibling of `<WinerySearchSection>` (0.45 vs 0.35), matching React. A tasting note is a
	 * sentence rather than a short proper noun, so the same threshold that reads as tuned on a winery
	 * name reads as "fuzzy search finds nothing" here.
	 *
	 * **`description`, with `tastingNotes` as a secondary key.** There is no `tastingNotesText` field on
	 * `Wine`; extracting one would silently yield `undefined` for every row, which reads as "fuzzy
	 * search is just bad" rather than as a broken field name.
	 *
	 * **Typing alone does not filter.** On the worker tier every keystroke would be a round trip over
	 * 150k rows, so the rule commits on blur / Enter instead. An empty query REMOVES the rule rather
	 * than committing a permissive one — the panel's contract for every facet.
	 *
	 * ### A writable `$derived`, not a mirror and not a plain `$state`
	 *
	 * The same idiom `<RealEstateFilterPanel>` and `<BooksFilterPanel>` use for their search boxes, and
	 * the right answer for a control holding UNCOMMITTED keystrokes. Fully derived state would fight
	 * the user's typing, because the rule lags every keystroke until they blur; a plain `$state` would
	 * never hear about an external change. A writable `$derived` is both — reassignable while typing,
	 * and it snaps back to the committed query whenever that changes from outside, which is what makes
	 * a `?f` restore, a clear-all, a removed chip and a preset takeover all reach the text box.
	 *
	 * Off the PER-RULE store rather than the whole `activeRules` map, which matters more here than on
	 * the chip facets: a map-wide derivation re-evaluates when any sibling facet commits, and would
	 * discard keystrokes the user had not blurred yet.
	 */

	import type { Wine } from '@filter-enginez/mock-data/wine';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { fuzzy, type FuzzySearchRule } from '@filter-enginez/core';
	import { createEngineStores } from '@filter-enginez/svelte-signals';
	import SearchInput from '$lib/controls/SearchInput.svelte';
	import SectionHeader from '$lib/controls/SectionHeader.svelte';

	import { clearRule, commitRule } from '../wineCommit.js';

	const {
		engine,
		leaveExpressionMode,
	}: {
		engine: SignalsEngine<Wine>;
		leaveExpressionMode: () => void;
	} = $props();

	/** This facet's own rule store. The engine never changes for a mounted section. */
	// svelte-ignore state_referenced_locally
	const ruleStore = createEngineStores(engine).rule('notes');

	/** What the input displays — see the docblock. */
	let query = $derived(($ruleStore as FuzzySearchRule | undefined)?.config.query ?? '');
</script>

<section>
	<SectionHeader label="Tasting notes search" />
	<SearchInput
		value={query}
		placeholder="cherry, oak, tannin…"
		ariaLabel="Search tasting notes"
		onChange={(next: string) => {
			query = next;
		}}
		onCommit={(next: string) => {
			leaveExpressionMode();
			// No local write: the writable `$derived` re-reads the committed rule, so the input ends up
			// showing the TRIMMED query the engine actually holds rather than the raw keystrokes.
			if (next.trim().length === 0) {
				clearRule(engine, 'notes');

				return;
			}
			commitRule(engine, 'notes', fuzzy('description', {
				keys: ['description', 'tastingNotes'],
				query: next.trim(),
				threshold: 0.45,
			}));
		}}
	/>
</section>
