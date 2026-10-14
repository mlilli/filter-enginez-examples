<script setup lang="ts">
/**
 * `<WineView>` — the wine app shell.
 *
 * @remarks
 * Composes the filter panel, the results header and the wine grid over the engine the route hands
 * down. The engine arrives as a prop and is never reassigned — the route renders this only after boot
 * resolves — so the one-time `provideFilterEngine` / `useEngineRefs` reads are intended.
 *
 * ## This view owns the bundle; the thirteen sections read it
 *
 * Predictive disable needs one bundle per engine change and exactly one fetcher. A panel fetching its
 * own would re-request on every section's re-render, and each section fetching its own facet would
 * turn one round trip into thirteen — across a Comlink boundary, against 150k records. So the loop
 * lives here and the result is provided as a `shallowRef` the sections inject.
 *
 * A failed fetch keeps the PREVIOUS bundle. Predictive disable is an enhancement: slightly stale hints
 * beat a panel where every control blanks because one worker round trip failed.
 *
 * ## Two things wine's results header does that no other vertical's does
 *
 * **"Clear all" calls `clearAllWineFilters`, not `clearAllFacetRules`** — the flat rules AND the
 * expression, as one operation. Splitting them is how a clear-all comes to drop the facets while
 * leaving a preset driving the results, with every control blank.
 *
 * **`SMART_FILTER_CHIP_ID` is a synthetic chip, not a rule.** Its × exits expression mode, which is
 * the only way back to the flat facets once a preset is driving the results — and it clears the facets
 * too, deliberately. Dropping only the expression would let any flat rule that somehow survived the
 * takeover start filtering with nothing on screen explaining it.
 *
 * ## The chips describe the ENGINE, not the panel
 *
 * `activeFilters` derives from `activeRules`, never from the sections' local control state. On the
 * worker tier those differ for a round trip, and a chip for a rule the engine has not applied yet
 * would offer a remove button for a filter that is not on.
 *
 * ## There is no panel reset hook
 *
 * Every facet section derives its control from its own rule and adopts that rule's removal, so the
 * header clears the panel by writing the ENGINE. There is no second copy of the truth for a callback
 * to reach.
 */

import type { FilterBundle } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { type EngineTier } from '@filter-enginez/examples-shared/verticals';
import { DESKTOP_MEDIA_QUERY } from '@filter-enginez/examples-shared/viewport-core';
import {
	buildWineBundleQuery,
	buildWineRuleSummaries,
	clearAllWineFilters,
	createBundleFetcher,
	type NumericBounds,
	type OriginNodeSpec,
	type PickerTreeNode,
	removeFacet,
	type SliderFieldId,
	SMART_FILTER_CHIP_ID,
	type WineChipVocabularies,
} from '@filter-enginez/examples-shared/wine-domain';
import { provideFilterEngine, useBusy, useEngineRefs } from '@filter-enginez/vue-signals';
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';

import ComputingIndicator from '../brand/ComputingIndicator.vue';
import DevtoolsPanel from '../controls/DevtoolsPanel.vue';
import ResultsHeader from '../controls/ResultsHeader.vue';
import TimeTravelControls from '../controls/TimeTravelControls.vue';
import AppHeaderBrand from '../shell/AppHeaderBrand.vue';
import CompareLinkButton from '../url/CompareLinkButton.vue';
import CopyLinkButton from '../url/CopyLinkButton.vue';
import UrlFormatToggle from '../url/UrlFormatToggle.vue';
import { provideWineBundle } from './wineBundle.js';
import {
	captureCurrentVersion,
	markResolvedAtLeast,
	markUserAction,
	wineBusyTracker,
} from './wineBusy.js';
import WineFilterPanel from './WineFilterPanel.vue';
import WineResultGrid from './WineResultGrid.vue';

const props = withDefaults(
	defineProps<{
		baselines: Record<SliderFieldId, NumericBounds>;
		/** Which corpus tier booted — rendered in the footer beside the record count. */
		corpusTier?: string;
		engine: SignalsEngine<Wine>;
		originSpecs: readonly OriginNodeSpec[];
		originTree: PickerTreeNode | null;
		/** The engine tier the header's subtitle names (defaults to the worker tier). */
		engineTier?: EngineTier;
		vocabularies: WineChipVocabularies;
	}>(),
	{
		corpusTier: '',
		engineTier: 'worker',
	},
);

provideFilterEngine(props.engine);

const { activeRules, lastChange, mode, results, sourceData } = useEngineRefs(props.engine);

/** `useBusy` registers a scope teardown, so it must be called here in `setup()`. */
const isEngineBusy = useBusy(wineBusyTracker);

/** `shallowRef`: the bundle carries `Uint32Array` indices and `Float64Array` histogram edges. */
const bundle = shallowRef<FilterBundle | null>(null);

const fetcher = createBundleFetcher(props.engine, {
	captureVersion: captureCurrentVersion,
	onBundle: (next) => {
		bundle.value = next;
	},
	onError: (error) => {
		// Keep the previous bundle — see the docblock.
		console.error('[wine] bundle fetch failed:', error);
	},
	onSettled: markResolvedAtLeast,
});

// The route renders this only AFTER boot resolves, so `baselines` is already final and never
// reassigned — capturing it once is exactly intended.
provideWineBundle({ baselines: props.baselines, current: bundle });

// Re-fetch on every engine change. Watching `lastChange` is what registers the dependency; the value
// itself is unused, so the watch source looks pointless and is load-bearing.
watch(
	lastChange,
	() => {
		fetcher.request(buildWineBundleQuery(props.baselines, props.vocabularies, props.originSpecs));
	},
	{ immediate: true },
);

/** The removable chips. Derived from the ENGINE's rules — see the docblock. */
const activeFilters = computed(() => buildWineRuleSummaries(activeRules.value, mode.value === 'expression'));

const isExpressionMode = computed(() => mode.value === 'expression');

/** Devtools panel visibility. Hidden by default so a first visit gets a clean page. */
const isDevtoolsOpen = ref<boolean>(false);

// Mobile filter visibility. `matchMedia` is guarded so the component still renders under jsdom, where
// it is absent — there `isDesktop` stays `true` and the panel shows, which is what keeps the component
// tests seeing the panel without a viewport.
const isDesktop = ref<boolean>(true);
const isFilterOpen = ref<boolean>(true);
let mediaQuery: MediaQueryList | null = null;

/** Mirror the media query onto both flags. */
function applyMediaState(): void {
	if (mediaQuery !== null) {
		isDesktop.value = mediaQuery.matches;
		isFilterOpen.value = mediaQuery.matches;
	}
}

onMounted(() => {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return;
	}
	mediaQuery = window.matchMedia(DESKTOP_MEDIA_QUERY);
	applyMediaState();
	mediaQuery.addEventListener('change', applyMediaState);
});

onUnmounted(() => {
	mediaQuery?.removeEventListener('change', applyMediaState);
	fetcher.dispose();
});

const showPanel = computed(() => isDesktop.value || isFilterOpen.value);

/** Clear every filter — flat facets AND expression mode, as one operation. */
function handleClearAll(): void {
	clearAllWineFilters(props.engine);
}

/**
 * Remove one chip.
 *
 * @param ruleId - The rule the chip represents, or the synthetic smart-filter id.
 */
function handleRemove(ruleId: string): void {
	if (ruleId === SMART_FILTER_CHIP_ID) {
		clearAllWineFilters(props.engine);

		return;
	}
	removeFacet(props.engine, ruleId);
}
</script>

<template>
	<div class="fe-books-app">
		<header class="fe-books-app__header">
			<AppHeaderBrand page="Wine" :tier="engineTier" />

			<div class="fe-books-app__url-controls">
				<TimeTravelControls
					:engine="engine"
					:is-devtools-open="isDevtoolsOpen"
					:mark-busy="markUserAction"
					@toggle-devtools="isDevtoolsOpen = !isDevtoolsOpen"
				/>
				<UrlFormatToggle />
				<CopyLinkButton />
				<CompareLinkButton dataset="wine" />
			</div>
		</header>

		<main class="fe-books-app__main fe-sidebar-app__main">
			<aside class="fe-sidebar-app__filters">
				<button
					v-if="!isDesktop"
					:aria-expanded="isFilterOpen"
					class="fe-books-app__filters-toggle"
					type="button"
					@click="isFilterOpen = !isFilterOpen"
				>
					<svg
						aria-hidden="true"
						fill="none"
						height="18"
						stroke="currentColor"
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1.75"
						viewBox="0 0 24 24"
						width="18"
					>
						<path d="M3 5h18M6 12h12M10 19h4" />
					</svg>
					{{ isFilterOpen ? 'Hide filters' : 'Filters' }}
				</button>
				<!-- Hidden, NOT unmounted. `v-if` would drop every control's local state on each mobile
				     close, and `fe-filter-collapse` is what makes the panel's body scroll — without it this
				     wrapper is a plain block and the scroller never bounds. -->
				<div class="fe-filter-collapse" :hidden="!showPanel">
					<WineFilterPanel
						:engine="engine"
						:is-computing="isEngineBusy"
						:is-expression-mode="isExpressionMode"
						:origin-specs="originSpecs"
						:origin-tree="originTree"
						:vocabularies="vocabularies"
					/>
				</div>
			</aside>

			<div class="fe-sidebar-app__results">
				<ResultsHeader
					:active-filters="activeFilters"
					:is-busy="isEngineBusy"
					noun="bottles"
					:recent-rule-id="lastChange.ruleId"
					:result-count="results.length"
					:total-count="sourceData.length"
					@clear-all="handleClearAll"
					@remove="handleRemove"
				>
					<template #status="{ isComputing }">
						<ComputingIndicator :is-computing="isComputing" />
					</template>
				</ResultsHeader>

				<!-- An inline card in the document flow, not an overlay: it pushes the grid down rather
				     than covering it, because the point of scrubbing the timeline is watching the RESULTS
				     change. Worth more on wine than anywhere else — this is the worker tier, so every jump
				     is a message round trip and the log is the only place the latency is legible. -->
				<DevtoolsPanel
					v-if="isDevtoolsOpen"
					:engine="engine"
					:is-computing="isEngineBusy"
					:mark-busy="markUserAction"
					@close="isDevtoolsOpen = false"
				/>

				<WineResultGrid :results="results" />
			</div>
		</main>

		<footer class="fe-books-app__footer">
			<span>
				Engine:
				<strong>{{ engine.asyncEngine === undefined ? 'main thread' : 'Comlink worker' }}</strong>
				· {{ sourceData.length.toLocaleString() }} bottles resident<template v-if="corpusTier">
					({{ corpusTier }})</template>
			</span>
			<span>Wine reviews · filtered entirely client-side</span>
		</footer>
	</div>
</template>
