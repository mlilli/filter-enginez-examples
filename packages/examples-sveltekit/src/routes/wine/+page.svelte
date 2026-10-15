<script lang="ts">
	/**
	 * `/wine` — the SvelteKit wine route, over the Comlink worker tier.
	 *
	 * @remarks
	 * Two constraints shape this file, and both fail in ways that do not look like their cause.
	 *
	 * **1. The boot module is imported DYNAMICALLY, inside `onMount`.** `wine-core` reaches
	 * `wineEngine.ts`, which spawns the corpus worker through Vite's `?worker` import — a client-only
	 * construct. The app's `vite.config.ts` sets `ssr.noExternal: [/^@filter-enginez\//]`, so a
	 * static import here would be EVALUATED during the SSR pass, where there is no `Worker`
	 * constructor and no `?worker` default export. That is a hard render failure on the server, not a
	 * no-op that degrades to client-side. `/books-server` established this pattern for the same reason.
	 *
	 * **2. The engine lives in `$state.raw`, never plain `$state`.** Plain `$state` deep-proxies the
	 * assigned object, and wrapping the engine's `@preact/signals-core` signals in Svelte's reactive
	 * proxy breaks `.subscribe` / `.value` and method `this`. Nothing throws — filtering just silently
	 * stops working. `BootHarness.test.ts` pins this for books; the same trap applies here, and it
	 * applies to the BUNDLE too (typed arrays through a proxy are both wrong and ruinously slow).
	 *
	 * Boot progress is a module-level pub/sub in `wine-core`, so it is subscribed BEFORE the boot is
	 * kicked off — subscribing after would miss every chunk already streamed and leave the boot screen
	 * at zero until the corpus finished.
	 */

	import type { WineBootProgress } from '@filter-enginez/examples-shared/wine-core';
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
	import WineView from '$lib/wine/WineView.svelte';
	import { onDestroy, onMount } from 'svelte';

	let engine = $state.raw<SignalsEngine<Wine> | null>(null);
	// Chip vocabularies, derived from the booted corpus rather than hardcoded — per the project's
	// standing rule that nothing about the filter UX is hardcoded against the data. Empty until boot,
	// which the panel reads as "no candidates yet" rather than "no candidates exist".
	let vocabularies = $state.raw<WineChipVocabularies>({ body: [], color: [], sweetness: [], varietal: []});
	// The origin hierarchy, flattened for the `inSetOfSets` bundle group. Derived from the BOOTED
	// corpus, not the bundled default: `buildOriginTree()` defaults to the 10k import, which would
	// produce a tree that does not match the 150k the worker actually holds.
	let originSpecs = $state.raw<readonly OriginNodeSpec[]>([]);

	/**
	 * The origin tree itself, kept alongside the flattened specs.
	 *
	 * @remarks
	 * The picker renders FLAT (indent by `depth`) but its selection semantics are hierarchical —
	 * clicking a country selects its subtree, and a partly-selected country renders mixed. A flat
	 * list has no ancestry to consult, so the tree travels with it.
	 */
	let originTree = $state.raw<PickerTreeNode | null>(null);
	// Slider baselines, derived from the corpus. FALLBACK_BOUNDS is a pre-boot PLACEHOLDER, not a
	// ceiling — it holds the 150k tier's extents, and using it as the live baseline would make any
	// wine outside them unreachable on another corpus (the local real one) the moment a user touched
	// those sliders.
	let baselines = $state.raw<Record<SliderFieldId, NumericBounds>>(FALLBACK_BOUNDS);
	let progress = $state.raw<WineBootProgress | null>(null);
	/** Which corpus tier booted (from `meta.source`), for the footer. */
	let corpusTier = $state.raw('');
	let bootError = $state.raw<string | null>(null);

	/** Teardown for the boot-progress subscription (client-only; `null` until wired in `onMount`). */
	let stopProgress: (() => void) | null = null;

	/** Teardown for the address-bar sync (client-only; `null` until wired in `onMount`). */
	let stopUrlSync: (() => void) | null = null;

	onMount(async () => {
		// Dynamic — see the docblock. A static import of this specifier fails during SSR.
		// Kept on ONE line deliberately. Wrapped across lines, the formatter adds a trailing comma inside
		// `import(...)`, which Svelte's parser rejects outright as a syntax error.
		const wineCore = await import('@filter-enginez/examples-shared/wine-core');
		const { bootWineEngine, describeWineCorpusTier, subscribeWineBootProgress } = wineCore;
		// The worker spawn is dynamic for the SAME reason and one more: its `?worker` import has no
		// meaning during SSR, where there is no `Worker` constructor to hand back. Same one-line rule.
		const { spawnWineWorker } = await import('@filter-enginez/examples-shared/wine-worker-spawn');

		// Subscribe FIRST: the corpus starts streaming the moment boot is called, and a subscription
		// registered afterwards misses every chunk already reported.
		stopProgress = subscribeWineBootProgress((next) => {
			progress = next;
		});

		try {
			const bundle = await bootWineEngine({ spawnWorker: spawnWineWorker });
			const booted = bundle.engine;

			corpusTier = describeWineCorpusTier(bundle.meta.source);
			const corpus = booted.core.getSourceData();

			// One shared derivation from `examples-shared/wine-domain`, the same one the Vue and Angular
			// wine routes use.
			const facets = deriveWineFacets(corpus);

			vocabularies = facets.vocabularies;
			originTree = facets.originTree;
			originSpecs = facets.originSpecs;
			baselines = facets.baselines;
			// Hydrate from a shared `?f=` link BEFORE wiring the write-back, so the restore is not
			// immediately overwritten by an export of the neutral state. Same ordering as the two
			// books routes.
			const urlConfig = readConfigFromUrl();

			if (urlConfig !== null) {
				try {
					booted.core.loadConfig(urlConfig);
				} catch {
					// Malformed / incompatible URL state — boot with the neutral corpus instead.
				}
			}
			// The worker tier's sync `.core` shim has no sync `exportConfig`, so this reads through
			// `asyncEngine.exportConfig()`. `startEngineUrlSync` already picks the right reader.
			stopUrlSync = startEngineUrlSync(booted);
			engine = booted;
		} catch (error) {
			// A failed boot is usually the worker failing to spawn (or, with the local real corpus
			// linked, its file failing to load). Surfacing it beats an indefinite boot screen, which
			// reads as a hang.
			bootError = error instanceof Error ? error.message : String(error);
		}
	});

	onDestroy(() => {
		stopProgress?.();
		stopUrlSync?.();
		engine?.dispose();
	});
</script>

{#if bootError !== null}
	<div class="fe-wine-error" role="alert">
		<p class="fe-wine-error__title">The wine engine did not boot</p>
		<p class="fe-wine-error__detail">{bootError}</p>
		<p class="fe-wine-error__hint">
			The 150,000 wines are generated inside a Web Worker, so a failure here almost always means the
			worker could not start. Set <code>VITE_WINE_TIER=default</code> to boot the 10,000-wine default
			tier on the main thread instead.
		</p>
	</div>
{:else if engine}
	<WineView {baselines} compareDataset="wine" {corpusTier} {engine} {originSpecs} {originTree} {vocabularies} />
{:else}
	<WineBootScreen {progress} />
{/if}

<style>
	.fe-wine-error {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 36rem;
		padding: 4rem 1.5rem;
	}

	.fe-wine-error__title {
		/* A boot FAILURE, not engine activity. Phosphor would claim the engine is working. */
		color: var(--danger);
		font-size: 1.125rem;
		font-weight: 600;
	}

	.fe-wine-error__detail {
		color: var(--gray-11);
		font-family: var(--font-mono, monospace);
		font-size: 0.875rem;
	}

	.fe-wine-error__hint {
		color: var(--gray-8);
		font-size: 0.875rem;
	}
</style>
