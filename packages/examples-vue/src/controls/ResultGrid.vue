<script setup lang="ts" generic="T">
/**
 * `<ResultGrid>` — the infinite-scroll card grid over the current result set, for every dataset.
 *
 * @remarks
 * Render `results.slice(0, renderLimit)`, grow the limit when an `IntersectionObserver` reports the
 * bottom sentinel entering the scroller, stop at the cap, and reset to the first batch whenever the
 * result set's identity changes. The window is the shared `RESULT_GRID_WINDOW` (60 cards, 60 more per
 * scroll, 1,500 at most) through `nextRenderLimit` and `isRenderCapped`, and every word the grid
 * shows (the empty state, the list and scroller names, the cap notice) is `RESULT_COPY[dataset]` and
 * `resultCapNotice`, so all three datasets' grids page and read the same as in every other app.
 *
 * ### Why a scoped slot rather than one grid per dataset
 *
 * A `generic="T"` component with an `#item` scoped slot lets books render `<BookCard>`, real estate
 * `<ListingCard>` and wine `<WineCard>` over ONE copy of the paging logic. That logic is four
 * interacting pieces — a render limit, a cap, an observer whose callback closes over the current
 * length, and a reset keyed on result identity — and a second copy would be the one that keeps a stale
 * `total` after a filter change.
 *
 * All styling is `fe-result-grid*` from `@filter-enginez/ui-styles`, shared with every framework and
 * every dataset; this component contributes markup and nothing else.
 */
import {
	isRenderCapped,
	nextRenderLimit,
	RESULT_COPY,
	RESULT_GRID_WINDOW,
	resultCapNotice,
	type ResultDataset,
} from '@filter-enginez/examples-shared/verticals';
import { computed, ref, watch, watchEffect } from 'vue';

// A BARE `defineProps` — not `withDefaults`, and not a reactive destructure. Both of those erase the
// `generic="T"` inference: `T` resolves to `unknown`, `itemKey` widens to `(item: unknown) => string`,
// and every call site fails to typecheck with an error that points at the CALLER rather than here.
// For the same reason no prop is named `ariaLabel`: a template `:aria-label` binding resolves against
// the global HTML aria typing rather than against the prop, which collapses `T` the same way. The
// accessible names come from `RESULT_COPY` instead.
const props = defineProps<{
	/** Whose results these are; picks the copy from `RESULT_COPY`. */
	dataset: ResultDataset;
	/** Stable key for a result, so Vue can reuse card DOM across renders. */
	itemKey: (item: T) => string;
	/** The current filtered result set. */
	results: readonly T[];
}>();

/** The dataset's results-column copy. */
const copy = computed(() => RESULT_COPY[props.dataset]);

const renderLimit = ref<number>(RESULT_GRID_WINDOW.initial);
const scrollerEl = ref<HTMLDivElement | null>(null);
const sentinelEl = ref<HTMLDivElement | null>(null);

const renderedCount = computed(() => Math.min(renderLimit.value, props.results.length, RESULT_GRID_WINDOW.cap));
const visible = computed(() => props.results.slice(0, renderedCount.value));
const isCapped = computed(() => isRenderCapped(renderedCount.value, props.results.length));
const capNotice = computed(() => resultCapNotice(renderedCount.value, props.results.length));

// Reset the render limit + scroll to top whenever the result set's identity changes (a filter change
// flips `results` to a fresh array); the user should see the new first batch.
watch(
	() => props.results,
	() => {
		renderLimit.value = RESULT_GRID_WINDOW.initial;
		if (scrollerEl.value !== null) {
			scrollerEl.value.scrollTop = 0;
		}
	},
);

// Bottom-sentinel intersection — grows `renderLimit` when the user scrolls near the rendered tail.
// Guarded for environments without `IntersectionObserver` (jsdom). Re-runs when the result set
// changes so its callback closes over a fresh length, or when the refs mount.
watchEffect((onCleanup) => {
	const total = props.results.length;
	const sentinel = sentinelEl.value;
	const scroller = scrollerEl.value;

	if (sentinel === null || scroller === null || typeof IntersectionObserver === 'undefined') {
		return;
	}
	const observer = new IntersectionObserver(
		(entries) => {
			const entry = entries[0];

			if (entry === undefined || !entry.isIntersecting) {
				return;
			}
			renderLimit.value = nextRenderLimit(renderLimit.value, total);
		},
		{ root: scroller, rootMargin: '200px', threshold: 0 },
	);

	observer.observe(sentinel);

	onCleanup(() => {
		observer.disconnect();
	});
});
</script>

<template>
	<div v-if="results.length === 0" class="fe-result-grid__empty">
		<p class="fe-result-grid__empty-title">{{ copy.emptyTitle }}</p>
		<p class="fe-result-grid__empty-hint">{{ copy.emptyHint }}</p>
	</div>
	<!--
		`role="group"` + `tabindex="0"` on the scroller: a scrollable region holding no focusable element
		is unreachable by keyboard, so a keyboard user cannot page through the results at all. The cards
		are articles, not links or buttons — there is deliberately nothing tabbable inside — so the
		container itself has to be the stop. This is what react-ui's `<ScrollRegion>` wraps.

		A nonnegative tabindex on a non-widget role is usually a mistake — making decorative content
		focusable adds a stop that announces nothing. It is not a mistake when the element SCROLLS, which
		is why WCAG 2.1.1 requires exactly this, and why the shared eslint preset carries a standing
		jsx-a11y allowance for `role="group"`. `aria-label` gives the stop something to announce, so it is
		not a silent tab stop either.
	-->
	<div
		v-else
		ref="scrollerEl"
		class="fe-result-grid__scroller"
		role="group"
		:aria-label="copy.scrollerLabel"
		tabindex="0"
	>
		<div role="list" :aria-label="copy.listLabel(results.length)" class="fe-result-grid">
			<slot v-for="item in visible" :key="itemKey(item)" name="item" :item="item" />
		</div>
		<div ref="sentinelEl" aria-hidden="true" style="height: 1px" />
		<p v-if="isCapped" class="fe-result-grid__cap-notice">
			Showing
			<span class="fe-result-grid__cap-shown">{{ capNotice.rendered }}</span>
			of
			<span class="fe-result-grid__cap-total">{{ capNotice.total }}</span>
			{{ capNotice.suffix }}
		</p>
	</div>
</template>
