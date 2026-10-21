<script lang="ts">
	/**
	 * `<ResultsHeader>` — the strip between the filter sidebar and the result grid: active-filter chips
	 * above, result count below.
	 *
	 * @remarks
	 * Structure matched to react-ui's `<ResultsHeaderView>` rather than invented: the active-filter bar
	 * renders FIRST, the count row second, and the status pill sits INSIDE the count row as a snippet
	 * rather than beside it. DOM order there is deliberate — number, label, delta, total, status — so on
	 * a phone the count identity stays on line one, "filtered from N total" lands directly beneath it,
	 * and the engine status takes the third line instead of being pushed off screen.
	 *
	 * ### One header, three datasets
	 *
	 * Books, wine and real estate all render this one component, so the chip ×, its `aria-label`, the
	 * empty-state sentence and the count roll (`<ResultCount>`) each have exactly one spelling.
	 *
	 * It is prop-driven because that is the shape that composes: a header that reads the engine from
	 * context can only ever serve the dataset whose busy-tracker module it imports. Callers that want
	 * the context-driven convenience wrap this — see `books/ResultsHeader.svelte`, which is that wrapper
	 * and nothing else.
	 */

	import type { Readable } from 'svelte/store';

	import { RESULT_COPY, type ResultDataset } from '@filter-enginez/examples-shared/verticals';
	import ComputingIndicator from '$lib/brand/ComputingIndicator.svelte';
	import ResultCount from '$lib/brand/ResultCount.svelte';

	/** One removable chip. Shape-compatible with every dataset's `buildRuleSummaries` output. */
	export interface ActiveFilterSummary {
		/**
		 * Whether the value is a numeric range, so it can be set in the mono face.
		 *
		 * @remarks
		 * Optional: wine's summarizer does not report it, and a chip without it simply renders in the
		 * body face — which is what wine already looked like.
		 */
		readonly isNumeric?: boolean;
		/** The facet's name, e.g. `Price`. */
		readonly label: string;
		/** The rule to remove when the × is pressed. */
		readonly ruleId: string;
		/** The constraint, e.g. `$400,000 — $900,000`. */
		readonly value: string;
	}

	interface Props {
		/** The chips to render, in engine rule order. */
		readonly activeFilters: readonly ActiveFilterSummary[];
		/**
		 * Which dataset the header counts: its noun beside the count (`bottles`, `results`, `listings`)
		 * is `RESULT_COPY[dataset].noun`, the same word every app uses.
		 */
		readonly dataset: ResultDataset;
		/** Busy store — OR'd with the count roll so the indicator stays lit for the whole transition. */
		readonly isBusy: Readable<boolean>;
		/** Drop every filter. */
		readonly onClearAll: () => void;
		/** Drop one filter. */
		readonly onRemove: (ruleId: string) => void;
		/** The most recently changed rule, briefly highlighted so a change is locatable. */
		readonly recentRuleId?: string | null;
		/** The current result count. */
		readonly resultCount: number;
		/** The unfiltered corpus size. */
		readonly totalCount: number;
	}

	const {
		activeFilters,
		dataset,
		isBusy,
		onClearAll,
		onRemove,
		recentRuleId = null,
		resultCount,
		totalCount,
	}: Props = $props();

	let isTicking = $state(false);

	// Lit while the engine is busy OR the count is still rolling. Both halves matter: on a main-thread
	// engine a recompute resolves within the frame, so `isBusy` alone would flash for one tick and the
	// indicator would look broken rather than fast.
	const isComputing = $derived($isBusy || isTicking);

	/** The word after the count. */
	const noun = $derived(RESULT_COPY[dataset].noun);
</script>

<div class="fe-results-header">
	{#if activeFilters.length === 0}
		<div class="fe-active-filters__empty">No filters active — showing the full corpus.</div>
	{:else}
		<div class="fe-active-filters">
			<span class="fe-active-filters__count">
				{activeFilters.length}
				{activeFilters.length === 1 ? 'filter' : 'filters'}
			</span>
			<div class="fe-active-filters__chips">
				{#each activeFilters as filter (filter.ruleId)}
					<span class="fe-filter-chip" class:fe-filter-chip--recent={filter.ruleId === recentRuleId}>
						<span aria-hidden="true" class="fe-filter-chip__dot"></span>
						<span class="fe-filter-chip__label">{filter.label}</span>
						<span
							class="fe-filter-chip__value"
							class:fe-filter-chip__value--numeric={filter.isNumeric ?? false}
						>
							{filter.value}
						</span>
						<!-- The label reads `Remove {label} filter`, matching React, Angular, Vue and the
						     vanilla app. The wine header said "Remove the … filter" — the only one of the five
						     that did — and merging the two Svelte headers is what surfaced it: the books parity
						     test names this exact string, and failed. -->
						<button
							type="button"
							class="fe-filter-chip__remove"
							aria-label="Remove {filter.label} filter"
							onclick={() => {
								onRemove(filter.ruleId);
							}}
						>
							<!-- A drawn ×, not the character: the glyph's optical weight and baseline vary by
							     font, so it sat low and thin next to the chip's text. Matches React's. -->
							<svg
								viewBox="0 0 24 24"
								width="12"
								height="12"
								fill="none"
								stroke="currentColor"
								stroke-width="1.75"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M18 6 6 18M6 6l12 12" />
							</svg>
						</button>
					</span>
				{/each}
				<button type="button" class="fe-active-filters__clear" onclick={onClearAll}>Clear all</button>
			</div>
		</div>
	{/if}

	<ResultCount
		count={resultCount}
		{isComputing}
		{noun}
		onTickingChange={(next) => {
			isTicking = next;
		}}
		{totalCount}
	>
		{#snippet status()}
			<ComputingIndicator {isComputing} />
		{/snippet}
	</ResultCount>
</div>
