<script lang="ts">
/**
 * One removable chip. Shape-compatible with every dataset's `buildRuleSummaries` output.
 *
 * @remarks
 * Declared here rather than imported from a dataset slice, deliberately. Each domain emits its own
 * `FilterSummary` and they do not agree in full — wine's summarizer reports no `isNumeric` — so this
 * is the CONSUMER's contract: the narrowest shape the header actually reads. Every dataset's output
 * satisfies it structurally, and a domain that grows a field does not drag the header along.
 */
export interface ActiveFilterSummary {
	/**
	 * Whether the value is a numeric range, so it can be set in the mono face.
	 *
	 * @remarks
	 * Optional: wine's summarizer does not report it, and a chip without it simply renders in the body
	 * face — which is what wine already looks like.
	 */
	readonly isNumeric?: boolean;
	/** The facet's name, e.g. `Price`. */
	readonly label: string;
	/** The rule to remove when the × is pressed. */
	readonly ruleId: string;
	/** The constraint, e.g. `$400,000 — $900,000`. */
	readonly value: string;
}
</script>

<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * `<ResultsHeader>` — the strip between the filter sidebar and the result grid: active-filter chips
 * above, result count below.
 *
 * @remarks
 * The Vue counterpart to `$lib/controls/ResultsHeader.svelte`, and prop-driven for the same reason: a
 * header that reads the engine out of context can only ever serve the dataset whose busy-tracker
 * module it imports, and this app serves three datasets. Callers wanting the context-driven
 * convenience wrap this — see `books/ResultsHeader.vue`, which is that wrapper and nothing else.
 *
 * Structure matched to react-ui's `<ResultsHeaderView>`: the active-filter bar renders FIRST, the
 * count row second, and the status pill sits INSIDE the count row rather than beside it. DOM order
 * there is deliberate — number, label, delta, total, status — so on a phone the count identity stays
 * on line one, "filtered from N total" lands directly beneath it, and the engine status takes the
 * third line instead of being pushed off screen.
 *
 * The count roll is delegated to `<ResultCount>` rather than reimplemented, so every dataset rolls
 * its count the same way.
 */
import ResultCount from '../brand/ResultCount.vue';

const props = withDefaults(
	defineProps<{
		/** The chips to render, in engine rule order. */
		activeFilters: readonly ActiveFilterSummary[];
		/** Whether the engine is mid-recompute — OR'd with the count roll. */
		isBusy: boolean;
		/** Label beside the count — `results`, `bottles`, `listings`. */
		noun?: string;
		/** The most recently changed rule, briefly highlighted so a change is locatable. */
		recentRuleId?: string | null;
		/** The current result count. */
		resultCount: number;
		/** The unfiltered corpus size. */
		totalCount: number;
	}>(),
	{
		noun: 'results',
		recentRuleId: null,
	},
);

const emit = defineEmits<{
	/** Drop every filter. */
	clearAll: [];
	/** Drop one filter. */
	remove: [ruleId: string];
}>();

const isTicking = ref(false);

// Lit while the engine is busy OR the count is still rolling. Both halves matter: on a main-thread
// engine a recompute resolves within the frame, so `isBusy` alone would flash for one tick and the
// indicator would look broken rather than fast.
const isComputing = computed(() => props.isBusy || isTicking.value);
</script>

<template>
	<div class="fe-results-header">
		<div v-if="activeFilters.length === 0" class="fe-active-filters__empty">
			No filters active — showing the full corpus.
		</div>
		<div v-else class="fe-active-filters">
			<span class="fe-active-filters__count">
				{{ activeFilters.length }}
				{{ activeFilters.length === 1 ? 'filter' : 'filters' }}
			</span>
			<div class="fe-active-filters__chips">
				<span
					v-for="filter in activeFilters"
					:key="filter.ruleId"
					class="fe-filter-chip"
					:class="{ 'fe-filter-chip--recent': filter.ruleId === recentRuleId }"
				>
					<span aria-hidden="true" class="fe-filter-chip__dot" />
					<span class="fe-filter-chip__label">{{ filter.label }}</span>
					<span class="fe-filter-chip__value" :class="{ 'fe-filter-chip__value--numeric': filter.isNumeric ?? false }">
						{{ filter.value }}
					</span>
					<!-- `Remove {label} filter` — the phrasing shared by React, Angular, Svelte and the
					     vanilla app, and named verbatim by the books parity tests. -->
					<button
						type="button"
						class="fe-filter-chip__remove"
						:aria-label="`Remove ${filter.label} filter`"
						@click="emit('remove', filter.ruleId)"
					>
						<!-- A drawn ×, not the character: the glyph's optical weight and baseline vary by font,
						     so it sits low and thin next to the chip's text. Matches React's. -->
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
				<button type="button" class="fe-active-filters__clear" @click="emit('clearAll')">Clear all</button>
			</div>
		</div>

		<ResultCount
			:count="resultCount"
			:is-computing="isComputing"
			:noun="noun"
			:total-count="totalCount"
			@ticking-change="isTicking = $event"
		>
			<template #status>
				<slot name="status" :is-computing="isComputing" />
			</template>
		</ResultCount>
	</div>
</template>
