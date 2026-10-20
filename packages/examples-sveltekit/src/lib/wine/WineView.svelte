<script lang="ts">
	/**
	 * `<WineView>` — the wine app shell.
	 *
	 * @remarks
	 * Composes the filter panel, the results header and the card grid over the engine handed down by
	 * the route — on `/wine` a worker-backed engine (Vite's `?worker` emit under SvelteKit's dual
	 * SSR+client build), on `/wine-server` the in-process server tier.
	 *
	 * The engine arrives as a prop and is never reassigned — the route renders this only after boot
	 * resolves — so the one-time `setFilterEngine` / `createEngineStores` reads are intended.
	 */

	import type { FilterBundle } from '@filter-enginez/core';
	import type { CompareDataset } from '@filter-enginez/examples-shared/compare-core';
	import type { EngineTier } from '@filter-enginez/examples-shared/verticals';
	import type { Wine } from '@filter-enginez/mock-data/wine';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { DESKTOP_MEDIA_QUERY } from '@filter-enginez/examples-shared/viewport-core';
	import {
		buildWineBundleQuery,
		buildWineRuleSummaries,
		createBundleFetcher,
		type NumericBounds,
		type OriginNodeSpec,
		type PickerTreeNode,
		type SliderFieldId,
		type WineChipVocabularies,
	} from '@filter-enginez/examples-shared/wine-domain';
	import { createEngineStores, setFilterEngine } from '@filter-enginez/svelte-signals';
	import ResultsHeader from '$lib/controls/ResultsHeader.svelte';
	import { onDestroy } from 'svelte';

	import DevtoolsPanel from '../controls/DevtoolsPanel.svelte';
	import TimeTravelControls from '../controls/TimeTravelControls.svelte';
	import AppHeaderBrand from '../shell/AppHeaderBrand.svelte';
	import CompareLinkButton from '../url/CompareLinkButton.svelte';
	import CopyLinkButton from '../url/CopyLinkButton.svelte';
	import UrlFormatToggle from '../url/UrlFormatToggle.svelte';
	import { setWineBundle } from './wineBundle.js';
	import { captureCurrentVersion, isEngineBusy, markResolvedAtLeast, markUserAction } from './wineBusy.js';
	import { clearAllWineFilters, removeWineFilterChip } from './wineCommit.js';
	import WineFilterPanel from './WineFilterPanel.svelte';
	import WineResultGrid from './WineResultGrid.svelte';

	const {
		baselines,
		compareDataset,
		corpusTier = '',
		engine,
		originSpecs,
		originTree,
		tier = 'worker',
		vocabularies,
	}: {
		baselines: Record<SliderFieldId, NumericBounds>;
		/**
		 * Which comparison the header's Compare button offers. `/wine` passes `'wine'` — the six-way
		 * browser-tier comparison; `/wine-server` passes `'wine-server'`, whose two rows are this app's
		 * in-process server tier and vanilla's over HTTP, the only other vertical serving that route.
		 *
		 * **REQUIRED, unlike its neighbors `tier` and `corpusTier`, and the asymmetry is
		 * deliberate.** A default would let a route stay silent about which tier it is, and nothing
		 * would fail, because a wrong-but-valid comparison target looks exactly like a right one.
		 * Requiring the prop turns "a route forgot to say" from a silent wrong answer into a compile
		 * error, and it matches vanilla's `WineRouteChrome`, so the two shells fail the same way.
		 */
		compareDataset: CompareDataset;
		/** Which corpus tier booted — rendered in the footer beside the resident count. */
		corpusTier?: string;
		engine: SignalsEngine<Wine>;
		originSpecs: readonly OriginNodeSpec[];
		originTree: PickerTreeNode | null;
		/**
		 * The engine tier the header's subtitle names, so the server-backed route reads honestly.
		 * `/wine` keeps the default, `'worker'`; `/wine-server` passes `'server'`.
		 */
		tier?: EngineTier;
		vocabularies: WineChipVocabularies;
	} = $props();

	/**
	 * Where the filtering runs, for the footer.
	 *
	 * @remarks
	 * An engine reached over HTTP is an async engine too, so `asyncEngine` alone cannot tell a Comlink
	 * worker from a server; the route's `tier` can.
	 */
	const engineLocation = $derived(
		tier === 'server' ? 'SvelteKit server tier' : engine.asyncEngine === undefined ? 'main thread' : 'Comlink worker',
	);

	// svelte-ignore state_referenced_locally
	setFilterEngine(engine);
	// svelte-ignore state_referenced_locally
	const { activeRules, lastChange, mode, results, sourceData } = createEngineStores(engine);

	// `$state.raw`, not `$state`: the bundle carries `Uint32Array` result indices and `Float64Array`
	// histogram edges, and Svelte's deep proxy neither preserves typed-array semantics nor survives
	// 150k entries at any acceptable speed. Same trap as the engine — see `wineBundle.ts`.
	let bundle = $state.raw<FilterBundle | null>(null);

	// svelte-ignore state_referenced_locally
	const fetcher = createBundleFetcher(engine, {
		captureVersion: captureCurrentVersion,
		onBundle: (next) => {
			bundle = next;
		},
		onError: (error) => {
			// Keep the previous bundle. Predictive disable is an ENHANCEMENT: slightly stale hints beat a
			// panel where every control blanks because one worker round trip failed.
			console.error('[wine] bundle fetch failed:', error);
		},
		onSettled: markResolvedAtLeast,
	});

	// The route renders this component only AFTER boot resolves, so `baselines` is already final and
	// never reassigned — capturing it once is exactly intended.
	// svelte-ignore state_referenced_locally
	setWineBundle({ baselines, current: () => bundle });

	// Re-fetch on every engine change. Reading `$lastChange` is what registers the dependency; the
	// value itself is unused, so the read looks pointless and is load-bearing.
	$effect(() => {
		void $lastChange;
		fetcher.request(buildWineBundleQuery(baselines, vocabularies, originSpecs));
	});

	onDestroy(() => {
		fetcher.dispose();
	});

	/** The removable chips. Derived from the ENGINE's rules, not the panel's local control state —
	 * a chip must describe what is actually filtering, and on the worker tier those can differ for a
	 * round trip. Showing a chip for a rule the engine has not applied yet would offer a remove
	 * button for a filter that is not on. */
	const activeFilters = $derived(buildWineRuleSummaries($activeRules, $mode === 'expression'));

	// No panel reset hook. Every facet section derives its control from its own rule and adopts that
	// rule's removal, so the header clears the panel by writing the ENGINE — there is no second copy of
	// the truth for a callback to reach.

	// Mobile filter visibility, reusing the Svelte books pattern verbatim (an inline collapse, not an
	// off-canvas drawer — the drawer is React-only). `matchMedia` is guarded so the component still
	// renders under SSR / jsdom, where it is absent: there `isDesktop` stays `true` and the panel shows,
	// which is also what keeps the e2e + component tests seeing the panel without a viewport.
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
		<AppHeaderBrand page="Wine" {tier} />

		<div class="fe-books-app__url-controls">
			<TimeTravelControls
				{engine}
				{isDevtoolsOpen}
				markBusy={markUserAction}
				onToggleDevtools={() => (isDevtoolsOpen = !isDevtoolsOpen)}
			/>
			<UrlFormatToggle />
			<CopyLinkButton />
			<CompareLinkButton dataset={compareDataset} />
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
			<!-- Hidden, NOT unmounted — see BooksView. `{#if}` would drop every control's local
			     state on each mobile close. `fe-filter-collapse` is what makes the panel's body scroll:
			     without it this wrapper is a plain block and the scroller never bounds. -->
			<div class="fe-filter-collapse" hidden={!showPanel}>
				<WineFilterPanel
					{engine}
					isComputing={$isEngineBusy}
					isExpressionMode={$mode === 'expression'}
					{originSpecs}
					{originTree}
					{vocabularies}
				/>
			</div>
		</aside>

		<div class="fe-sidebar-app__results">
		<ResultsHeader
			{activeFilters}
			isBusy={isEngineBusy}
			noun="bottles"
			onClearAll={() => {
				clearAllWineFilters(engine);
			}}
			onRemove={(ruleId) => {
				// The synthetic expression chip is not a rule — its × exits expression mode, which is
				// the only way back to the flat facets once a preset is driving the results. The shared
				// helper clears the facets too, and deliberately: dropping only the expression would let
				// any flat rule that somehow survived the preset takeover start filtering with nothing on
				// screen explaining it. Landing in a neutral panel is the state the user is asking for.
				removeWineFilterChip(engine, ruleId);
			}}
			recentRuleId={$lastChange.ruleId}
			resultCount={$results.length}
			totalCount={$sourceData.length}
		/>
		<!-- An inline card in the document flow, not an overlay: it pushes the grid down rather than
		     covering it, because the point of scrubbing the timeline is watching the RESULTS change.
		     Worth more on wine than anywhere else — this is the worker tier, so every jump is a message
		     round trip and the log is the only place the latency is legible. -->
		{#if isDevtoolsOpen}
			<DevtoolsPanel
				{engine}
				isComputing={$isEngineBusy}
				markBusy={markUserAction}
				onClose={() => (isDevtoolsOpen = false)}
			/>
		{/if}
		<WineResultGrid results={$results} />
		</div>
	</main>

	<footer class="fe-books-app__footer">
		<span>
			Engine: <strong>{engineLocation}</strong>
			· {$sourceData.length.toLocaleString()} bottles resident{corpusTier ? ` (${corpusTier})` : ''}
		</span>
		<span>{tier === 'server' ? 'Wine reviews · filtered on the server' : 'Wine reviews · filtered entirely client-side'}</span>
	</footer>
</div>
