<script lang="ts">
	/**
	 * `/wine-server` — the server-backed wine route: **visual + functional parity with `/wine`**, but the
	 * browser never runs a filter. Every mutation round-trips to this app's own SvelteKit server tier
	 * (`/wine-server/query`), which runs the isomorphic engine in-process — no separate `serve:api`
	 * process, no proxy. The corpus copy the client boots from, `/wine-server/corpus/wine.json`, is a
	 * file prerendered at build time.
	 *
	 * Progressive enhancement in two layers, exactly as `/books-server`:
	 *   1. The server `load` (`+page.server.ts`) filters in-process for the SSR first paint, and
	 *      `<WineServerFallback>` renders a plain GET `<form>` that works with **zero JavaScript**.
	 *   2. On mount, the client boots the live server-backed engine, derives the panel's vocabularies /
	 *      baselines / origin tree from the resident corpus, and swaps in the full `<WineView>` — the
	 *      exact same component tree as `/wine`.
	 *
	 * Two traps, both borrowed verbatim from `/wine` + `/books-server`:
	 *
	 * **`$state.raw`, NOT `$state`** — plain `$state` deep-proxies the engine (and the typed-array
	 * bundle) and breaks its `@preact/signals-core` signals. Everything the engine or a derived typed
	 * array touches is `$state.raw`.
	 *
	 * **The boot module is imported DYNAMICALLY** inside `onMount`. `wine-server-core` reaches
	 * `createSignalsEngineFromAsync` (`reactive-signals/worker`), a client-only graph; a static import
	 * would be evaluated during SSR and fail. Unlike `/wine` there is no corpus WORKER here — the
	 * transport is plain `fetch` — but the dynamic import is kept for the same SSR-safety reason.
	 */

	import type { Wine } from '@filter-enginez/mock-data/wine';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import {
		deriveWineFacets,
		FALLBACK_BOUNDS,
		type NumericBounds,
		type OriginNodeSpec,
		type PickerTreeNode,
		type SliderFieldId,
		type WineChipVocabularies,
	} from '@filter-enginez/examples-shared/wine-domain';
	import { readConfigFromUrl, startEngineUrlSync } from '$lib/url/urlState.js';
	import WineBootScreen from '$lib/wine/WineBootScreen.svelte';
	import WineServerFallback from '$lib/wine/WineServerFallback.svelte';
	import WineView from '$lib/wine/WineView.svelte';
	import { onDestroy, onMount } from 'svelte';

	import type { PageData } from './$types.js';

	const { data }: { data: PageData } = $props();

	// The live server-backed engine (null until booted client-side). `$state.raw` — never `$state`.
	let engine = $state.raw<SignalsEngine<Wine> | null>(null);
	// Panel inputs derived from the BOOTED corpus (the resident copy the transport fetched once), not
	// hardcoded — same standing rule as `/wine`. Empty/placeholder until boot resolves.
	let vocabularies = $state.raw<WineChipVocabularies>({ body: [], color: [], sweetness: [], varietal: []});
	let originSpecs = $state.raw<readonly OriginNodeSpec[]>([]);
	let originTree = $state.raw<PickerTreeNode | null>(null);
	let baselines = $state.raw<Record<SliderFieldId, NumericBounds>>(FALLBACK_BOUNDS);
	// The footer's tier label, read from the boot module so it arrives with the engine.
	let corpusTier = $state('');
	let booting = $state(true);
	let bootError = $state<string | null>(null);
	// Only true AFTER the client mounts. Gates the boot screen so the SSR / no-JS pass renders the
	// server-filtered `<WineServerFallback>` (the progressive-enhancement floor), and the branded boot
	// loader appears only once JavaScript is actually driving the boot — matching `/wine`.
	let isMounted = $state(false);

	/** Teardown for the address-bar sync (client-only; `null` until wired in `onMount`). */
	let stopUrlSync: (() => void) | null = null;

	onMount(async () => {
		// The client is now driving — swap the SSR fallback for the branded boot loader (see `isMounted`).
		isMounted = true;
		try {
			// Dynamic — see the docblock. Kept on ONE line: wrapped, the formatter adds a trailing comma
			// inside `import(...)`, which Svelte's parser rejects as a syntax error.
			const { bootWineServerEngine, SERVER_WINE_TIER_LABEL } = await import('@filter-enginez/examples-shared/wine-server-core');
			const booted = await bootWineServerEngine({ baseUrl: '/wine-server' });
			// The transport pulled the corpus at boot, so the sync `.core` shim hands back a resident copy.
			const corpus = booted.core.getSourceData();

			// The same shared derivation as `/wine`, so the two routes cannot drift: varietals ranked
			// most-reviewed first, the origin tree ordered by wine count at every level, and the slider
			// baselines tight over the resident corpus.
			const facets = deriveWineFacets(corpus);

			vocabularies = facets.vocabularies;
			originTree = facets.originTree;
			originSpecs = facets.originSpecs;
			baselines = facets.baselines;
			corpusTier = SERVER_WINE_TIER_LABEL;
			// Hydrate from a shared `?f=` link BEFORE wiring the write-back, so the restore is not
			// immediately overwritten by an export of the neutral state. Same ordering as every other route.
			const urlConfig = readConfigFromUrl();

			if (urlConfig !== null) {
				try {
					booted.core.loadConfig(urlConfig);
				} catch {
					// Malformed / incompatible URL state — boot with the neutral corpus instead.
				}
			}
			stopUrlSync = startEngineUrlSync(booted);
			engine = booted;
		} catch (caught) {
			// A failed boot is usually the server being unreachable (corpus fetch / initial state pull
			// rejects). Surfacing it beats leaving the fallback's "booting" spinner on forever.
			bootError = caught instanceof Error ? caught.message : String(caught);
		} finally {
			booting = false;
		}
	});

	onDestroy(() => {
		stopUrlSync?.();
		engine?.dispose();
	});
</script>

<svelte:head>
	<title>Wine (server-filtered) · Filter EngineZ</title>
</svelte:head>

{#if engine}
	<!-- `compareDataset` alongside `tier`: both are this route saying which tier it is. The Compare
	     button offers the two-row `wine-server` comparison — this app in-process against vanilla over
	     HTTP — rather than the six-way browser one. -->
	<WineView
		{baselines}
		compareDataset="wine-server"
		{corpusTier}
		{engine}
		{originSpecs}
		{originTree}
		tier="server"
		{vocabularies}
	/>
{:else if isMounted && bootError === null}
	<!-- JS on + booting: the branded cold-start loader, matching `/wine`. No progress stream on the
	     server tier (one corpus fetch), so `progress` stays null and the caption names the real step. -->
	<WineBootScreen progress={null} idleCaption="Connecting to the filter server" />
{:else}
	<!-- SSR / no-JS (server-filtered form) and the boot-error state, which keeps the working no-JS form. -->
	<WineServerFallback
		applied={data.applied}
		{booting}
		{bootError}
		colors={data.colors}
		matched={data.ssr.matched}
		sample={data.ssr.sample}
		total={data.ssr.total}
	/>
{/if}
