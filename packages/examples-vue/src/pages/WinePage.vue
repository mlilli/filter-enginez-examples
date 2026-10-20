<script setup lang="ts">
/**
 * `/wine` — boots the worker-backed 150k engine and renders the wine app.
 *
 * @remarks
 * The route owns the boot; `<WineView>` owns everything after it. Same split as `/real-estate`, with
 * three wine-specific departures.
 *
 * ## The imports are DYNAMIC, and that is a bundle decision rather than an SSR one
 *
 * `./wine-worker-spawn` carries a Vite `?worker` import and `./wine-core` reaches the Comlink graph.
 * This app is a plain SPA, so a static import would not FAIL — it would pull the worker chunk and the
 * bridge into the initial bundle for every visitor, including the ones who only wanted `/books`.
 * SvelteKit imports these dynamically too, for a stricter reason (SSR would evaluate them where no
 * `Worker` exists); the effect here is the same and the cost of matching is nil.
 *
 * ## Progress is subscribed BEFORE the boot is kicked off
 *
 * Boot progress is a module-level pub/sub in `wine-core`. Subscribing after `bootWineEngine()` would
 * miss every chunk already streamed and leave the boot screen at zero until the corpus finished — on
 * a fast connection, that is the entire boot.
 *
 * ## Everything the panel needs is derived from the BOOTED corpus
 *
 * Not from the bundled default tier. `buildOriginTree()` defaults to the 10k import, which would
 * produce a tree that does not match the 150k the worker actually holds — so a region present in the
 * booted corpus would be missing from the picker, silently. `deriveWineFacets` also ranks what it
 * derives: varietals most-reviewed first, and every level of the origin tree by wine count.
 *
 * `FALLBACK_BOUNDS` is a pre-boot PLACEHOLDER, not a ceiling. It matches the extents of the 150,000
 * synthetic wines, but the local real corpus, when linked, has extents of its own; using the
 * placeholder as the live baseline would put any bottle outside it out of the sliders' reach.
 */

import type { WineBootProgress } from '@filter-enginez/examples-shared/wine-core';
import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { bootCaptionParts } from '@filter-enginez/examples-shared/boot-caption';
import {
	deriveWineFacets,
	FALLBACK_BOUNDS,
	type NumericBounds,
	type OriginNodeSpec,
	type PickerTreeNode,
	type SliderFieldId,
	type WineChipVocabularies,
} from '@filter-enginez/examples-shared/wine-domain';
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';

import BrainSynapse from '../brand/BrainSynapse.vue';
import { readConfigFromUrl, startEngineUrlSync } from '../url/urlState.js';
import WineView from '../wine/WineView.vue';

/** `shallowRef`, never `ref` — a deep proxy breaks the engine's signals with no error. */
const engine = shallowRef<SignalsEngine<Wine> | null>(null);

/**
 * Chip vocabularies, derived from the booted corpus rather than hardcoded.
 *
 * @remarks
 * Empty until boot, which the panel reads as "no candidates yet" rather than "no candidates exist".
 */
const vocabularies = shallowRef<WineChipVocabularies>({
	body: [],
	color: [],
	sweetness: [],
	varietal: [],
});

/** The origin hierarchy, flattened for the `inSetOfSets` bundle group. */
const originSpecs = shallowRef<readonly OriginNodeSpec[]>([]);

/**
 * The origin tree itself, kept alongside the flattened specs.
 *
 * @remarks
 * The picker renders FLAT (indent by `depth`) but its selection semantics are hierarchical — clicking
 * a country selects its subtree, and a partly-selected country renders mixed. A flat list has no
 * ancestry to consult, so the tree travels with it.
 */
const originTree = shallowRef<PickerTreeNode | null>(null);

const baselines = shallowRef<Record<SliderFieldId, NumericBounds>>(FALLBACK_BOUNDS);
const progress = shallowRef<WineBootProgress | null>(null);
/**
 * The cold-boot caption, from the one module every vertical renders.
 *
 * A two-state caption (`Booting the wine engine…` plus an optional `N / M bottles`) would freeze on
 * `150,000 / 150,000` for the whole bitmap-index build and read as a hang. The shared module's third
 * state covers that build.
 */
const bootCaption = computed(() => bootCaptionParts(progress.value, { recordNoun: 'bottles' }));
/** Which corpus tier booted (`meta.source`), for the footer. */
const corpusTier = shallowRef('');
const bootError = shallowRef<string | null>(null);

/** Teardown for the boot-progress subscription; `null` until wired in `onMounted`. */
let stopProgress: (() => void) | null = null;

/** Teardown for the address-bar sync; `null` until wired in `onMounted`. */
let stopUrlSync: (() => void) | null = null;

onMounted(async () => {
	const [wineCore, workerSpawn] = await Promise.all([
		import('@filter-enginez/examples-shared/wine-core'),
		import('@filter-enginez/examples-shared/wine-worker-spawn'),
	]);

	// Subscribe FIRST — see the docblock.
	stopProgress = wineCore.subscribeWineBootProgress((next) => {
		progress.value = next;
	});

	try {
		const bundle = await wineCore.bootWineEngine({ spawnWorker: workerSpawn.spawnWineWorker });
		const booted = bundle.engine;

		corpusTier.value = wineCore.describeWineCorpusTier(bundle.meta.source);
		const corpus = booted.core.getSourceData();

		// One shared derivation from `examples-shared/wine-domain`, the same one SvelteKit's route and
		// Angular use, rather than a per-app copy.
		const facets = deriveWineFacets(corpus);

		vocabularies.value = facets.vocabularies;
		originTree.value = facets.originTree;
		originSpecs.value = facets.originSpecs;
		baselines.value = facets.baselines;

		// Hydrate from a shared `?f=` link BEFORE wiring the write-back, so the restore is not
		// immediately overwritten by an export of the neutral state.
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
		engine.value = booted;
	} catch (error) {
		// A failed boot is usually the worker failing to spawn or the corpus 404ing. Surfacing it beats
		// an indefinite boot screen, which reads as a hang.
		bootError.value = error instanceof Error ? error.message : String(error);
	}
});

onUnmounted(() => {
	stopProgress?.();
	stopUrlSync?.();
	engine.value?.dispose();
});
</script>

<template>
	<WineView
		v-if="engine"
		:baselines="baselines"
		:engine="engine"
		:origin-specs="originSpecs"
		:corpus-tier="corpusTier"
		:origin-tree="originTree"
		:vocabularies="vocabularies"
	/>

	<!-- Each state below is a `<main>`: until the engine boots, it is the page's main content. -->
	<main v-else-if="bootError" class="fe-boot-error">
		<p class="fe-boot-error__title">The wine engine could not start.</p>
		<p class="fe-boot-error__detail">{{ bootError }}</p>
		<p class="fe-boot-error__detail">
			The 150,000 wines are generated inside a Web Worker, so a failure here almost always means the
			worker could not start. Set <code>VITE_WINE_TIER=default</code> to boot the 10,000-wine default
			tier on the main thread instead.
		</p>
	</main>

	<main v-else class="vue-wine__booting">
		<BrainSynapse loader-label="Loading wine reviews" :width="520" />
		<p class="fe-boot-caption fe-boot-caption--hero">
			<template v-for="part in bootCaption" :key="part.kind + part.text">
				<span v-if="part.kind === 'value'" class="fe-boot-caption__value">{{ part.text }}</span>
				<template v-else>{{ part.text }}</template>
			</template>
		</p>
	</main>
</template>

<style scoped>
/* The boot stage. Local rather than in `ui-styles` for the same reason the real-estate page's is: the
 * copy and the layout differ per route, and this one centers a 520px hero loader that no other route
 * shows. */
.vue-wine__booting {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 16px;
	min-height: 60vh;
	padding: 24px;
}

/* The caption element is `.fe-boot-caption--hero` in `ui-styles` (uppercase and tracked), shared by
 * all six verticals' `/wine` screens and both React `DatasetRoute`s. The LAYOUT above stays local;
 * `ui-styles` has no boot-stage component. */
</style>
