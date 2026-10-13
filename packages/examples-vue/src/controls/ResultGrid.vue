<script setup lang="ts" generic="T">
/**
 * `<ResultGrid>` — incremental "load more" card grid over the current result set, for any dataset.
 *
 * @remarks
 * Render `results.slice(0, renderLimit)`, expand the limit when an `IntersectionObserver` reports the
 * bottom sentinel entering the scroller, cap at `HARD_CAP_RENDER`, and reset to the first page
 * whenever the result set's identity changes. The Vue port of `examples-shared`'s `BooksResultGrid`.
 *
 * ### Why a scoped slot rather than one grid per dataset
 *
 * SvelteKit carries two of these — `books/ResultGrid.svelte` and `real-estate/RealEstateResultGrid.svelte`
 * — because Svelte makes generic item rendering awkward enough that duplicating the observer was the
 * lesser evil. Vue does not have that constraint: a `generic="T"` component with an `#item` scoped
 * slot lets books render `<BookCard>` and real estate render `<ListingCard>` over ONE copy of the
 * paging logic. Only the card and the empty-state wording differ between them, and both are inputs.
 *
 * That paging logic is the part worth not duplicating. It is four interacting pieces — a render limit,
 * a hard cap, an observer whose callback closes over the current length, and a reset keyed on result
 * identity — and a second copy would be the one that keeps a stale `total` after a filter change.
 *
 * All styling is `fe-result-grid*` from `@filter-enginez/ui-styles`, shared with every framework and
 * every dataset; this component contributes markup and nothing else.
 */
import { computed, ref, watch, watchEffect } from 'vue';

// A BARE `defineProps` — not `withDefaults`, and not a reactive destructure. Both of those erase the
// `generic="T"` inference: `T` resolves to `unknown`, `itemKey` widens to `(item: unknown) => string`,
// and every call site fails to typecheck with an error that points at the CALLER rather than here.
// The cost is that `noun`'s default lives in the template as `?? 'matches'` instead of in the
// signature, which is a small price for a component whose whole job is to be generic.
const props = defineProps<{
	/**
	 * Accessible name for the grid's `role="list"`, e.g. `'1,204 matching books'`.
	 *
	 * @remarks
	 * NOT named `ariaLabel`, and the reason is a trap worth knowing. On a `generic="T"` component a
	 * `:aria-label="..."` binding resolves against the global `AriaAttributes` HTML typing rather than
	 * against the prop of that name — which collapses `T` to `unknown`, widens `itemKey` to
	 * `(item: unknown) => string`, and reports the failure at every CALL SITE rather than here. The
	 * camelCase spelling `:ariaLabel` happens to dodge it, which makes the trap harder to see: the two
	 * spellings are interchangeable everywhere else in Vue, so an editor or a formatter normalizing one
	 * to the other reintroduces it silently. A name that cannot collide is the fix that stays fixed.
	 */
	listLabel: string;
	/** Hint shown beneath the empty-state title, naming a filter worth widening. */
	emptyHint: string;
	/** Empty-state headline, e.g. `'No books match the current filters.'` */
	emptyTitle: string;
	/** Stable key for a result, so Vue can reuse card DOM across renders. */
	itemKey: (item: T) => string;
	/** Plural record noun for the cap notice — `matches` reads well for every dataset. */
	noun?: string;
	/** The current filtered result set. */
	results: readonly T[];
	/**
	 * Accessible name for the SCROLLER, e.g. `'Book results'`.
	 *
	 * @remarks
	 * Required, not optional, because the scroll region is a WCAG 2.1.1 obligation rather than a nicety
	 * — and an optional label is one a call site can silently omit, leaving the scroller unnamed. See
	 * the comment on the scroller element.
	 */
	scrollRegionLabel: string;
}>();

/** First page of cards shown before the user scrolls. */
const INITIAL_BATCH = 60;
/** Page size for each subsequent "load more" trigger. */
const BATCH_INCREMENT = 60;
/** Hard cap on cards ever rendered at once — bounds worst-case DOM cost. */
const HARD_CAP_RENDER = 1500;

const renderLimit = ref(INITIAL_BATCH);
const scrollerEl = ref<HTMLDivElement | null>(null);
const sentinelEl = ref<HTMLDivElement | null>(null);

const renderedCount = computed(() => Math.min(renderLimit.value, props.results.length, HARD_CAP_RENDER));
const visible = computed(() => props.results.slice(0, renderedCount.value));
const isCappedShort = computed(() => renderedCount.value >= HARD_CAP_RENDER && props.results.length > HARD_CAP_RENDER);

// Reset the render limit + scroll to top whenever the result set's identity changes (a filter change
// flips `results` to a fresh array); the user should see the new first page.
watch(
	() => props.results,
	() => {
		renderLimit.value = INITIAL_BATCH;
		if (scrollerEl.value !== null) {
			scrollerEl.value.scrollTop = 0;
		}
	},
);

// Bottom-sentinel intersection — expands `renderLimit` when the user scrolls near the rendered tail.
// Guarded for non-DOM environments (jsdom / SSR) where `IntersectionObserver` is absent. Re-runs when
// the result set changes so its callback closes over a fresh length, or when the refs mount.
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
			renderLimit.value = Math.min(renderLimit.value + BATCH_INCREMENT, total, HARD_CAP_RENDER);
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
		<p class="fe-result-grid__empty-title">{{ emptyTitle }}</p>
		<p class="fe-result-grid__empty-hint">{{ emptyHint }}</p>
	</div>
	<!--
		`role="group"` + `tabindex="0"` on the scroller: a scrollable region holding no focusable element
		is unreachable by keyboard, so a keyboard user cannot page through the results at all. The cards
		are articles, not links or buttons — there is deliberately nothing tabbable inside — so the
		container itself has to be the stop. This is what react-ui's `<ScrollRegion>` wraps, and what the
		Svelte grids already carried; the Vue books grid did not, which the consolidation surfaced and
		this fixes for both datasets at once.

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
		:aria-label="scrollRegionLabel"
		tabindex="0"
	>
		<div role="list" :aria-label="listLabel" class="fe-result-grid">
			<slot v-for="item in visible" :key="itemKey(item)" name="item" :item="item" />
		</div>
		<div ref="sentinelEl" aria-hidden="true" style="height: 1px" />
		<p v-if="isCappedShort" class="fe-result-grid__cap-notice">
			Showing
			<span class="fe-result-grid__cap-shown">{{ renderedCount.toLocaleString() }}</span>
			of
			<span class="fe-result-grid__cap-total">{{ results.length.toLocaleString() }}</span>
			{{ noun ?? 'matches' }} · narrow your filters to surface the rest
		</p>
	</div>
</template>
