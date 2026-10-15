<script lang="ts">
	/**
	 * `<RealEstateView>` — the real-estate app shell.
	 *
	 * @remarks
	 * Composes the filter panel, the results header and the listing grid over the engine the route
	 * hands down. The engine arrives as a prop and is never reassigned — the route renders this only
	 * after boot resolves — so the one-time `setFilterEngine` / `createEngineStores` reads are intended.
	 *
	 * ### This view owns the bundle; the panel reads it
	 *
	 * Predictive disable needs one bundle per engine change, and exactly one fetcher: a panel that
	 * fetched its own would re-request on every section's re-render, and each section fetching its own
	 * facet would turn one round trip into fourteen. So the fetch loop lives here and the result is
	 * published through context as a GETTER — captured once at init, a plain value would freeze at
	 * `null` and no section would ever see a bundle.
	 *
	 * The bundle is `$state.raw`. It carries `Uint32Array` result indices and `Float64Array` histogram
	 * edges, and Svelte's deep proxy neither preserves typed-array semantics nor survives tens of
	 * thousands of entries at any acceptable speed — the same trap that makes the ENGINE need
	 * `$state.raw`.
	 *
	 * ### The geo section is loaded, not imported
	 *
	 * `<GeoRadiusSection>` reaches Leaflet, which touches `window` at module scope. A static import
	 * would put it in the SSR bundle and break the server render, so it is pulled in from `onMount` and
	 * passed down as a component. Until it resolves the panel renders its other thirteen sections,
	 * which is a better first paint than blocking all of them on a mapping library.
	 */

	import type { FilterBundle } from '@filter-enginez/core';
	import type { Listing } from '@filter-enginez/mock-data/real-estate';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import {
		buildRealEstateBundleQuery,
		buildRuleSummaries,
		createBundleFetcher,
		type LocationNodeSpec,
		type MetroCenterOption,
		type NumericBounds,
		type PickerTreeNode,
		type RealEstateChipVocabularies,
		type RealEstateSliderFieldId,
	} from '@filter-enginez/examples-shared/real-estate-domain';
	import { DESKTOP_MEDIA_QUERY } from '@filter-enginez/examples-shared/viewport-core';
	import { createEngineStores, setFilterEngine } from '@filter-enginez/svelte-signals';
	import ResultsHeader from '$lib/controls/ResultsHeader.svelte';
	import { type Component, onDestroy, onMount } from 'svelte';

	import DevtoolsPanel from '../controls/DevtoolsPanel.svelte';
	import TimeTravelControls from '../controls/TimeTravelControls.svelte';
	import AppHeaderBrand from '../shell/AppHeaderBrand.svelte';
	import CompareLinkButton from '../url/CompareLinkButton.svelte';
	import CopyLinkButton from '../url/CopyLinkButton.svelte';
	import UrlFormatToggle from '../url/UrlFormatToggle.svelte';
	import { setRealEstateBundle } from './realEstateBundle.js';
	import {
		captureCurrentVersion,
		isEngineBusy,
		markResolvedAtLeast,
		markUserAction,
	} from './realEstateBusy.js';
	import { clearAllFacetRules, removeFacet } from './realEstateCommit.js';
	import RealEstateFilterPanel from './RealEstateFilterPanel.svelte';
	import RealEstateResultGrid from './RealEstateResultGrid.svelte';

	const {
		baselines,
		engine,
		locationSpecs,
		locationTree,
		metroCenters,
		vocabularies,
	}: {
		baselines: Record<RealEstateSliderFieldId, NumericBounds>;
		engine: SignalsEngine<Listing>;
		locationSpecs: readonly LocationNodeSpec[];
		locationTree: PickerTreeNode | null;
		/** The metro dropdown's options — the geo section recenters on them, the chips name them. */
		metroCenters: readonly MetroCenterOption[];
		vocabularies: RealEstateChipVocabularies;
	} = $props();

	// svelte-ignore state_referenced_locally
	setFilterEngine(engine);
	// svelte-ignore state_referenced_locally
	const { activeRules, lastChange, results, sourceData } = createEngineStores(engine);

	// `$state.raw`, not `$state` — see the docblock.
	let bundle = $state.raw<FilterBundle | null>(null);

	// svelte-ignore state_referenced_locally
	const fetcher = createBundleFetcher(engine, {
		captureVersion: captureCurrentVersion,
		onBundle: (next) => {
			bundle = next;
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
	// svelte-ignore state_referenced_locally
	setRealEstateBundle({ baselines, current: () => bundle });

	// Re-fetch on every engine change. Reading `$lastChange` is what registers the dependency; the
	// value itself is unused, so the read looks pointless and is load-bearing.
	$effect(() => {
		void $lastChange;
		fetcher.request(buildRealEstateBundleQuery(baselines, vocabularies, locationSpecs));
	});

	onDestroy(() => {
		fetcher.dispose();
	});

	/**
	 * The geo section, once its Leaflet-bearing module has loaded in the browser.
	 *
	 * @remarks
	 * `$state.raw` because it holds a component constructor: deep-proxying a class would be pure cost
	 * and no benefit. It stays `null` under SSR and in jsdom, where the import is never attempted.
	 */
	let GeoRadiusSection = $state.raw<Component<{ engine: SignalsEngine<Listing> }> | null>(null);

	onMount(async () => {
		// Kept on ONE line deliberately: wrapped, the formatter adds a trailing comma inside
		// `import(...)`, which Svelte's parser rejects as a syntax error.
		const geoModule = await import('./GeoRadiusSection.svelte');

		GeoRadiusSection = geoModule.default as Component<{ engine: SignalsEngine<Listing> }>;
	});

	/**
	 * The removable chips.
	 *
	 * @remarks
	 * Derived from the ENGINE's rules, exactly as the panel's controls are — a chip must describe what is
	 * actually filtering, and a chip offering to remove a filter the engine has not applied yet is a
	 * button that does nothing.
	 *
	 * `metroCenters` is what lets the Distance chip read "≤ 15 mi of Greater Denver" rather than
	 * "≤ 15 mi" — a radius without its center states half a filter, and the center is the half the
	 * user actually chose.
	 */
	const activeFilters = $derived(buildRuleSummaries($activeRules, { metroCenters }));

	// Mobile filter visibility. `matchMedia` is guarded so the component still renders under SSR /
	// jsdom, where it is absent: there `isDesktop` stays `true` and the panel shows, which is also what
	// keeps the e2e + component tests seeing the panel without a viewport.
	let isDesktop = $state(true);
	let isFilterOpen = $state(true);

	/** Devtools panel visibility. Hidden by default so a first visit gets a clean page. */
	let isDevtoolsOpen = $state(false);

	$effect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
			return undefined;
		}
		const mq = window.matchMedia(DESKTOP_MEDIA_QUERY);
		const apply = (): void => {
			isDesktop = mq.matches;
			isFilterOpen = mq.matches;
		};

		apply();
		mq.addEventListener('change', apply);

		return () => {
			mq.removeEventListener('change', apply);
		};
	});

	const showPanel = $derived(isDesktop || isFilterOpen);
</script>

<div class="fe-books-app">
	<header class="fe-books-app__header">
		<AppHeaderBrand page="Real estate" />

		<div class="fe-books-app__url-controls">
			<TimeTravelControls
				{engine}
				{isDevtoolsOpen}
				markBusy={markUserAction}
				onToggleDevtools={() => (isDevtoolsOpen = !isDevtoolsOpen)}
			/>
			<UrlFormatToggle />
			<CopyLinkButton />
			<CompareLinkButton dataset="real-estate" />
		</div>
	</header>

	<main class="fe-books-app__main fe-sidebar-app__main">
		<aside class="fe-sidebar-app__filters">
			{#if !isDesktop}
				<button
					type="button"
					class="fe-books-app__filters-toggle"
					aria-expanded={isFilterOpen}
					onclick={() => (isFilterOpen = !isFilterOpen)}
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
					{isFilterOpen ? 'Hide filters' : 'Filters'}
				</button>
			{/if}
			<!-- Hidden, NOT unmounted. `{#if}` would destroy and rebuild the Leaflet map on every mobile
			     filter close — refetching tiles and discarding the user's zoom — along with every other
			     control's local state. `fe-filter-collapse` gives it a `display` ONLY via `:not([hidden])`,
			     because an unconditional one would beat the `hidden` attribute (a UA rule) — and without
			     a display at all it is a plain block that severs the panel's scroll height chain. -->
			<div class="fe-filter-collapse" hidden={!showPanel}>
				<!-- No `baselines` prop: the slider sections read them from the bundle context this view
				     already publishes, rather than having twelve numbers threaded through the panel that
				     the panel itself has no use for. -->
				<RealEstateFilterPanel
					{engine}
					{GeoRadiusSection}
					isComputing={$isEngineBusy}
					{locationSpecs}
					{locationTree}
					{metroCenters}
					{vocabularies}
				/>
			</div>
		</aside>

		<div class="fe-sidebar-app__results">
			<ResultsHeader
				{activeFilters}
				isBusy={isEngineBusy}
				noun="listings"
				onClearAll={() => {
					// A plain engine call, with no second half. The panel derives every control from
					// `activeRules`, so dropping the rules IS what returns the controls to neutral. This used
					// to also invoke a `resetPanel` callback the panel registered, plus a per-section reset
					// registry underneath it — machinery that existed only because the panel held a mirror,
					// and that could not clear what the mirror never knew about (a `?f`-restored selection,
					// for one).
					clearAllFacetRules(engine);
				}}
				onRemove={(ruleId) => {
					removeFacet(engine, ruleId);
				}}
				recentRuleId={$lastChange.ruleId}
				resultCount={$results.length}
				totalCount={$sourceData.length}
			/>
			<!-- An inline card in the document flow, not an overlay: it pushes the grid down rather than
			     covering it, because the point of scrubbing the timeline is watching the RESULTS change. -->
			{#if isDevtoolsOpen}
				<DevtoolsPanel
					{engine}
					isComputing={$isEngineBusy}
					markBusy={markUserAction}
					onClose={() => (isDevtoolsOpen = false)}
				/>
			{/if}
			<RealEstateResultGrid results={$results} />
		</div>
	</main>

	<footer class="fe-books-app__footer">
		<span>
			Engine: <strong>main thread</strong> · {$sourceData.length.toLocaleString()} listings resident
		</span>
		<span>Synthetic listings · filtered entirely client-side</span>
	</footer>
</div>
