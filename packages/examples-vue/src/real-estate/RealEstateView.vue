<script setup lang="ts">
import type { FilterBundle } from '@filter-enginez/core';
import type { NumericBounds } from '@filter-enginez/examples-shared/bounds';
import type { Listing } from '@filter-enginez/mock-data/real-estate';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import {
	buildRealEstateBundleQuery,
	buildRuleSummaries,
	createBundleFetcher,
	type LocationNodeSpec,
	type MetroCenterOption,
	type PickerTreeNode,
	type RealEstateChipVocabularies,
	type RealEstateSliderFieldId,
} from '@filter-enginez/examples-shared/real-estate-domain';
/**
 * `<RealEstateView>` — the real-estate app shell.
 *
 * @remarks
 * Composes the filter panel, the results header and the listing grid over the engine the route hands
 * down. The engine arrives as a prop and is never reassigned — the route renders this only after boot
 * resolves — so the one-time `provideFilterEngine` / `useEngineRefs` reads are intended.
 *
 * ### This view owns the bundle; the panel reads it
 *
 * Predictive disable needs one bundle per engine change, and exactly one fetcher: a panel that fetched
 * its own would re-request on every section's re-render, and each section fetching its own facet would
 * turn one round trip into fourteen. So the fetch loop lives here and the result is provided as a
 * `shallowRef` the sections inject.
 *
 * **`shallowRef`, never `ref`.** The bundle carries `Uint32Array` result indices and `Float64Array`
 * histogram edges, and Vue's deep proxy neither preserves typed-array semantics nor survives tens of
 * thousands of entries at any acceptable speed — the same trap that makes the ENGINE need `shallowRef`.
 *
 * ### The geo section is loaded, not imported
 *
 * `<GeoRadiusSection>` reaches Leaflet. A static import would pull a mapping library into the initial
 * chunk for every visitor, including the majority who never open the distance filter, so it is pulled
 * in from `onMounted` and passed down as a component. Until it resolves the panel renders its other
 * thirteen sections, which is a better first paint than blocking all of them on a map.
 */
import { verticalSubtitle } from '@filter-enginez/examples-shared/verticals';
import { DESKTOP_MEDIA_QUERY } from '@filter-enginez/examples-shared/viewport-core';
import { provideFilterEngine, useBusy, useEngineRefs } from '@filter-enginez/vue-signals';
import { type Component, computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import { RouterLink } from 'vue-router';

import ComputingIndicator from '../brand/ComputingIndicator.vue';
import DevtoolsPanel from '../controls/DevtoolsPanel.vue';
import ResultsHeader from '../controls/ResultsHeader.vue';
import TimeTravelControls from '../controls/TimeTravelControls.vue';
import CompareLinkButton from '../url/CompareLinkButton.vue';
import CopyLinkButton from '../url/CopyLinkButton.vue';
import UrlFormatToggle from '../url/UrlFormatToggle.vue';
import { provideRealEstateBundle } from './realEstateBundle.js';
import {
	captureCurrentVersion,
	markResolvedAtLeast,
	markUserAction,
	realEstateBusyTracker,
} from './realEstateBusy.js';
import { clearAllFacetRules, removeFacet } from './realEstateCommit.js';
import RealEstateFilterPanel from './RealEstateFilterPanel.vue';
import RealEstateResultGrid from './RealEstateResultGrid.vue';

const props = defineProps<{
	/** Per-slider baseline bounds, derived once at the route from the booted corpus. */
	baselines: Record<RealEstateSliderFieldId, NumericBounds>;
	/** The booted real-estate engine. */
	engine: SignalsEngine<Listing>;
	/** The flattened hierarchy, for the bundle query only. */
	locationSpecs: readonly LocationNodeSpec[];
	/** The location hierarchy, for the picker and the rule. */
	locationTree: PickerTreeNode | null;
	/** The metro dropdown's options — the geo section recenters on them, the chips name them. */
	metroCenters: readonly MetroCenterOption[];
	/** The chip vocabularies, derived once at the route. */
	vocabularies: RealEstateChipVocabularies;
}>();

provideFilterEngine(props.engine);
const { activeRules, lastChange, results, sourceData } = useEngineRefs(props.engine);
const isEngineBusy = useBusy(realEstateBusyTracker);

// `shallowRef`, not `ref` — see the docblock.
const bundle = shallowRef<FilterBundle | null>(null);

const fetcher = createBundleFetcher(props.engine, {
	captureVersion: captureCurrentVersion,
	onBundle: (next) => {
		bundle.value = next;
	},
	onError: (error) => {
		// Keep the previous bundle. Predictive disable is an ENHANCEMENT: slightly stale hints beat a
		// panel where every control blanks because one round trip failed.
		console.error('[real-estate] bundle fetch failed:', error);
	},
	onSettled: markResolvedAtLeast,
});

// The route renders this only AFTER boot resolves, so `baselines` is already final and never
// reassigned — capturing it once is exactly intended.
provideRealEstateBundle({ baselines: props.baselines, current: bundle });

// Re-fetch on every engine change. Watching `lastChange` is what registers the dependency; the value
// itself is unused, so the watch source looks pointless and is load-bearing.
watch(
	lastChange,
	() => {
		fetcher.request(buildRealEstateBundleQuery(props.baselines, props.vocabularies, props.locationSpecs));
	},
	{ immediate: true },
);

/**
 * The geo section, once its Leaflet-bearing module has loaded in the browser.
 *
 * @remarks
 * `shallowRef` because it holds a component definition: deep-proxying one would be pure cost and no
 * benefit. It stays `null` in jsdom, where the import is never awaited before assertions run.
 */
const geoRadiusSection = shallowRef<Component | null>(null);

onMounted(async () => {
	const geoModule = await import('./GeoRadiusSection.vue');

	geoRadiusSection.value = geoModule.default;
});

onUnmounted(() => {
	fetcher.dispose();
});

/**
 * The removable chips.
 *
 * @remarks
 * Derived from the ENGINE's rules, exactly as the panel's controls are — a chip must describe what is
 * actually filtering, and a chip offering to remove a filter the engine has not applied yet is a button
 * that does nothing.
 *
 * `metroCenters` is what lets the Distance chip read "≤ 15 mi of Greater Denver" rather than
 * "≤ 15 mi" — a radius without its center states half a filter, and the center is the half the user
 * actually chose.
 */
const activeFilters = computed(() => buildRuleSummaries(activeRules.value, { metroCenters: props.metroCenters }));

/**
 * Clear every facet — the header's "Clear all".
 *
 * @remarks
 * A plain engine call, with no second half. The panel derives every control from `activeRules`, so
 * dropping the rules IS what returns the controls to neutral. There is no panel-side reset callback or
 * per-section reset registry: those only make sense for a panel that holds a local mirror, and a mirror
 * cannot clear what it never knew about (a `?f`-restored selection, for one).
 */
function handleClearAll(): void {
	clearAllFacetRules(props.engine);
}

/**
 * Drop one facet — a header chip's ×.
 *
 * @param ruleId - The facet to remove.
 */
function handleRemove(ruleId: string): void {
	removeFacet(props.engine, ruleId);
}

// Mobile filter visibility. `matchMedia` is guarded so the component still renders under jsdom, where
// it is absent: there `isDesktop` stays `true` and the panel shows, which is also what keeps the
// component tests seeing the panel without a viewport.
const isDesktop = ref(true);
const isFilterOpen = ref(true);
let mediaQuery: MediaQueryList | null = null;

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
});

const showPanel = computed(() => isDesktop.value || isFilterOpen.value);

/** Devtools panel visibility. Hidden by default so a first visit gets a clean page. */
const isDevtoolsOpen = ref(false);
</script>

<template>
	<div class="fe-books-app">
		<header class="fe-books-app__header">
			<RouterLink to="/" class="fe-books-app__brand" aria-label="Filter EngineZ — back to the dataset hub">
				<img src="/mark.svg" alt="" width="36" height="36" class="fe-books-app__mark" />
				<span class="fe-books-app__wordmark">
					<span class="fe-books-app__name">Filter EngineZ</span>
					<span class="fe-books-app__subtitle">{{ verticalSubtitle('Real estate', 'vue') }}</span>
				</span>
			</RouterLink>
			<div class="fe-books-app__url-controls">
				<TimeTravelControls
					:engine="props.engine"
					:is-devtools-open="isDevtoolsOpen"
					:mark-busy="markUserAction"
					@toggle-devtools="isDevtoolsOpen = !isDevtoolsOpen"
				/>
				<UrlFormatToggle />
				<CopyLinkButton />
				<CompareLinkButton dataset="real-estate" />
			</div>
		</header>

		<main class="fe-books-app__main fe-sidebar-app__main">
			<aside class="fe-sidebar-app__filters">
				<button
					v-if="!isDesktop"
					type="button"
					class="fe-books-app__filters-toggle"
					:aria-expanded="isFilterOpen"
					@click="isFilterOpen = !isFilterOpen"
				>
					<svg
						viewBox="0 0 24 24"
						width="18"
						height="18"
						fill="none"
						stroke="currentColor"
						stroke-width="1.75"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M3 5h18M6 12h12M10 19h4" />
					</svg>
					{{ isFilterOpen ? 'Hide filters' : 'Filters' }}
				</button>
				<!-- Hidden, NOT unmounted. `v-if` would destroy and rebuild the Leaflet map on every mobile
				     filter close — refetching tiles and discarding the user's zoom — along with every other
				     control's local state. `fe-filter-collapse` gives it a `display` ONLY via
				     `:not([hidden])`, because an unconditional one would beat the `hidden` attribute (a UA
				     rule) — and without a display at all it is a plain block that severs the panel's
				     scroll height chain. -->
				<div class="fe-filter-collapse" :hidden="!showPanel">
					<!-- No `baselines` prop: the slider sections read them from the bundle context this view
					     already provides, rather than having twelve numbers threaded through the panel that
					     the panel itself has no use for. -->
					<RealEstateFilterPanel
						:engine="engine"
						:geo-radius-section="geoRadiusSection"
						:is-computing="isEngineBusy"
						:location-tree="locationTree"
						:metro-centers="metroCenters"
						:vocabularies="vocabularies"
					/>
				</div>
			</aside>

			<div class="fe-sidebar-app__results">
				<ResultsHeader
					:active-filters="activeFilters"
					:is-busy="isEngineBusy"
					noun="listings"
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
				     than covering it, because the point of scrubbing the timeline is watching the
				     RESULTS change. -->
				<DevtoolsPanel
					v-if="isDevtoolsOpen"
					:engine="props.engine"
					:is-computing="isEngineBusy"
					:mark-busy="markUserAction"
					@close="isDevtoolsOpen = false"
				/>
				<RealEstateResultGrid :results="results" />
			</div>
		</main>

		<footer class="fe-books-app__footer">
			<span>
				Engine:
				<strong>main thread</strong>
				· {{ sourceData.length.toLocaleString() }} listings resident
			</span>
			<span>Synthetic listings · filtered entirely client-side</span>
		</footer>
	</div>
</template>
