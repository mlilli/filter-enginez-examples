<script setup lang="ts">
/**
 * `/real-estate` — the Vue real-estate route.
 *
 * @remarks
 * Boots the shared `bootRealEstateEngine`, derives the panel's vocabularies, slider baselines and
 * location hierarchy from the booted corpus, hydrates any filter state carried in the URL, and hands
 * the engine to `<RealEstateView>`.
 *
 * ### `shallowRef`, not `ref`
 *
 * The engine holds `@preact/signals-core` signals. Vue's deep reactive proxy wraps every nested object,
 * which breaks `.value` / `.subscribe` and rebinds `this` on the engine's own methods — filtering then
 * silently stops working, with no error to explain it. `shallowRef` stays reactive on REASSIGNMENT
 * (null → booted), which is the only reactivity this holder needs. The same applies to the
 * corpus-derived structures, which carry typed arrays.
 *
 * ### Boot order is load-bearing
 *
 * Hydrate from `?f` BEFORE wiring URL write-back: `loadConfig` fires its change event synchronously, so
 * a sync started first would immediately write the pre-hydration state back over the very URL being
 * read. Then assign `engine` LAST, because that assignment is what mounts the view — anything not ready
 * by then is not ready when the view first renders.
 *
 * ### Why a static import is safe here
 *
 * The library that touches `window` — Leaflet, via the geo section — is dynamically imported two levels
 * down, inside `<RealEstateView>`. This boot has no `?worker` import either: real estate runs on the
 * main thread, exactly like `/books`, whose static import this mirrors.
 *
 * Importing `real-estate-domain` also self-registers `ContainsAllRule` with `ruleRegistry`, which is
 * what lets the must-have-features facet survive a URL round trip. Registration is a module side
 * effect, so it happens because this graph is imported at all — worth knowing before anyone "cleans up"
 * an import that looks unused.
 */
import type { NumericBounds } from '@filter-enginez/examples-shared/bounds';
import type { Listing } from '@filter-enginez/mock-data/real-estate';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { bootCaptionParts } from '@filter-enginez/examples-shared/boot-caption';
import {
	bootRealEstateEngine,
	type RealEstateBootProgress,
	subscribeRealEstateBootProgress,
} from '@filter-enginez/examples-shared/real-estate-core';
import {
	buildListingLocationTree,
	buildLocationNodeSpecs,
	deriveBaselineBounds,
	deriveMetroCenters,
	deriveRealEstateVocabularies,
	type LocationNodeSpec,
	type MetroCenterOption,
	type PickerTreeNode,
	REAL_ESTATE_BOOT_IDLE_CAPTION,
	REAL_ESTATE_RECORD_NOUN,
	REAL_ESTATE_SLIDER_FIELD_IDS,
	type RealEstateChipVocabularies,
	type RealEstateSliderFieldId,
	SLIDER_CLAMPS,
	SLIDER_FIELD_GETTERS,
	SLIDER_STEPS,
} from '@filter-enginez/examples-shared/real-estate-domain';
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';

import RealEstateView from '../real-estate/RealEstateView.vue';
import BootFailureScreen from '../shell/BootFailureScreen.vue';
import { readConfigFromUrl, startEngineUrlSync } from '../url/urlState.js';

const EMPTY_VOCABULARIES: RealEstateChipVocabularies = {
	features: [],
	propertyTypes: [],
	schoolDistricts: [],
	statuses: [],
};

const engine = shallowRef<SignalsEngine<Listing> | null>(null);
const vocabularies = shallowRef<RealEstateChipVocabularies>(EMPTY_VOCABULARIES);
const locationTree = shallowRef<PickerTreeNode | null>(null);
const locationSpecs = shallowRef<readonly LocationNodeSpec[]>([]);
/**
 * The metro dropdown's options, derived ONCE here.
 *
 * @remarks
 * From the BOOTED corpus rather than the bundled copy, so a streamed tier carrying metros the fallback
 * lacks still gets them. Derived at the route because two very different consumers need the same list:
 * the geo section (to recenter on a choice) and the results header (to name the center on the Distance
 * chip). Deriving it in each would be two full corpus passes and two chances for them to disagree about
 * what a metro's centroid is.
 */
const metroCenters = shallowRef<readonly MetroCenterOption[]>([]);
const baselines = shallowRef<Record<RealEstateSliderFieldId, NumericBounds>>(SLIDER_CLAMPS);
const progress = shallowRef<RealEstateBootProgress | null>(null);
/**
 * The cold-boot caption, from the one module every vertical renders.
 *
 * `idleCaption` is overridden because this route has no worker: real-estate boots on the main
 * thread, so the module's default — which names a worker spin-up — would describe something that is
 * not happening. That option exists for exactly this; `/wine-server` uses it for the same reason.
 *
 * Both strings come from `real-estate-domain` rather than being written here, so this page,
 * SvelteKit's and vanilla's pass one shared copy instead of three independent literals.
 */
const bootCaption = computed(() =>
	bootCaptionParts(progress.value, {
		idleCaption: REAL_ESTATE_BOOT_IDLE_CAPTION,
		recordNoun: REAL_ESTATE_RECORD_NOUN,
	}),
);
const bootError = shallowRef<string | null>(null);
let stopProgress: (() => void) | null = null;
let stopUrlSync: (() => void) | null = null;

/**
 * Full-corpus track extents for every slider.
 *
 * @remarks
 * Derived from the BOOTED corpus rather than from the bundled copy, so a streamed tier that differs
 * from the fallback produces tracks that actually match the data on screen. The clamps, getters and
 * rounding steps come from `real-estate-domain`, which is what keeps these identical to React's and
 * Svelte's.
 *
 * @param corpus - The booted listings.
 * @returns Baseline bounds per slider.
 */
function deriveBaselines(corpus: readonly Listing[]): Record<RealEstateSliderFieldId, NumericBounds> {
	const entries = REAL_ESTATE_SLIDER_FIELD_IDS.map(
		(fieldId) =>
			[
				fieldId,
				deriveBaselineBounds(corpus.map(SLIDER_FIELD_GETTERS[fieldId]), SLIDER_CLAMPS[fieldId], SLIDER_STEPS[fieldId]),
			] as const,
	);

	return Object.fromEntries(entries) as Record<RealEstateSliderFieldId, NumericBounds>;
}

onMounted(async () => {
	// Subscribe FIRST — the corpus starts streaming the moment boot is called, so a later subscription
	// would miss every progress event on a fast connection and show nothing at all.
	stopProgress = subscribeRealEstateBootProgress((next) => {
		progress.value = next;
	});

	try {
		const booted = (await bootRealEstateEngine()).engine;
		const corpus = booted.core.getSourceData();

		vocabularies.value = deriveRealEstateVocabularies(corpus);
		locationTree.value = buildListingLocationTree(corpus);
		// Two representations of one hierarchy: the TREE is what the picker renders; the flattened SPECS
		// carry each node's ids in the listing's `locationId` space, which is what the committed rule
		// holds and what the bundle needs to answer "would selecting this node empty the results".
		locationSpecs.value = buildLocationNodeSpecs(locationTree.value);
		metroCenters.value = deriveMetroCenters(corpus);
		baselines.value = deriveBaselines(corpus);

		const urlConfig = readConfigFromUrl();

		if (urlConfig !== null) {
			try {
				booted.core.loadConfig(urlConfig);
			} catch {
				// Malformed / incompatible URL state — boot with the neutral corpus instead.
			}
		}
		stopUrlSync = startEngineUrlSync(booted);
		engine.value = booted;
	} catch (error) {
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
	<!-- The shared failure screen: `BOOT_FAILURE_COPY['real-estate']` in a `role="alert"` inside `<main>`. -->
	<BootFailureScreen v-if="bootError !== null" dataset="real-estate" :message="bootError" />
	<RealEstateView
		v-else-if="engine"
		:baselines="baselines"
		:engine="engine"
		:location-specs="locationSpecs"
		:location-tree="locationTree"
		:metro-centers="metroCenters"
		:vocabularies="vocabularies"
	/>
	<!-- `<main>`: until the engine boots, the caption is the page's main content. -->
	<main v-else>
		<p class="fe-boot-caption fe-boot-caption--inline">
			<template v-for="part in bootCaption" :key="part.kind + part.text">
				<span v-if="part.kind === 'value'" class="fe-boot-caption__value">{{ part.text }}</span>
				<template v-else>{{ part.text }}</template>
			</template>
		</p>
	</main>
</template>
