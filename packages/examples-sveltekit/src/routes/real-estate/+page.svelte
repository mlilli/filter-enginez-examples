<script lang="ts">
	/**
	 * `/real-estate` — the SvelteKit real-estate route.
	 *
	 * @remarks
	 * Boots the shared `bootRealEstateEngine`, derives the panel's vocabularies, slider baselines and
	 * location hierarchy from the booted corpus, hydrates any filter state carried in the URL, and
	 * hands the engine to `<RealEstateView>`.
	 *
	 * ### `$state.raw`, not `$state`
	 *
	 * The engine holds `@preact/signals-core` signals. Svelte's deep reactive proxy wraps every nested
	 * object, which breaks `.value` / `.subscribe` and rebinds `this` on the engine's own methods —
	 * filtering then silently stops working, with no error to explain it. The same applies to the
	 * corpus-derived structures, which carry typed arrays.
	 *
	 * ### Boot order is load-bearing
	 *
	 * Hydrate from `?f` BEFORE wiring URL write-back: `loadConfig` fires its change event
	 * synchronously, so a sync started first would immediately write the pre-hydration state back over
	 * the very URL being read. Then assign `engine` LAST, because that assignment is what mounts the
	 * view — anything not ready by then is not ready when the view first renders.
	 *
	 * ### Why a static import is safe here
	 *
	 * Unlike `/wine`, this boot has no `?worker` import for SSR to choke on: real estate runs on the
	 * main thread, exactly like `/books`, whose static import this mirrors. The library that DOES touch
	 * `window` — Leaflet, via the geo section — is dynamically imported one level down, inside
	 * `<RealEstateView>`.
	 *
	 * Importing `real-estate-domain` also self-registers `ContainsAllRule` with `ruleRegistry`, which
	 * is what lets the must-have-features facet survive a URL round trip. Registration is a module
	 * side effect, so it happens because this graph is imported at all — worth knowing before anyone
	 * "cleans up" an import that looks unused.
	 */

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
		type NumericBounds,
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
	import RealEstateView from '$lib/real-estate/RealEstateView.svelte';
	import { readConfigFromUrl, startEngineUrlSync } from '$lib/url/urlState.js';
	import { onDestroy, onMount } from 'svelte';

	const EMPTY_VOCABULARIES: RealEstateChipVocabularies = {
		features: [],
		propertyTypes: [],
		schoolDistricts: [],
		statuses: [],
	};

	let engine = $state.raw<SignalsEngine<Listing> | null>(null);
	let vocabularies = $state.raw<RealEstateChipVocabularies>(EMPTY_VOCABULARIES);
	let locationTree = $state.raw<PickerTreeNode | null>(null);
	let locationSpecs = $state.raw<readonly LocationNodeSpec[]>([]);
	/**
	 * The metro dropdown's options, derived ONCE here.
	 *
	 * @remarks
	 * From the BOOTED corpus rather than the bundled copy, so a streamed tier carrying metros the
	 * fallback lacks still gets them. Derived at the route because two very different consumers need
	 * the same list: the geo section (to recenter on a choice) and the results header (to name the
	 * center on the Distance chip). Deriving it in each would be two full corpus passes and two chances
	 * for them to disagree about what a metro's centroid is.
	 */
	let metroCenters = $state.raw<readonly MetroCenterOption[]>([]);
	let baselines = $state.raw<Record<RealEstateSliderFieldId, NumericBounds>>(SLIDER_CLAMPS);
	let progress = $state.raw<RealEstateBootProgress | null>(null);
	/**
	 * The cold-boot caption, from the one module every vertical renders.
	 *
	 * `idleCaption` is overridden because this route has no worker: real-estate boots on the main
	 * thread, so the module's default — which names a worker spin-up — would describe something that
	 * is not happening. That option exists for exactly this; `/wine-server` uses it for the same
	 * reason.
	 *
	 * Both strings come from `real-estate-domain` rather than being written here, so this route, Vue's
	 * and vanilla's pass the same values rather than three independent copies.
	 */
	const bootCaption = $derived(
		bootCaptionParts(progress, {
			idleCaption: REAL_ESTATE_BOOT_IDLE_CAPTION,
			recordNoun: REAL_ESTATE_RECORD_NOUN,
		}),
	);
	let bootError = $state.raw<string | null>(null);
	let stopProgress: (() => void) | null = null;
	let stopUrlSync: (() => void) | null = null;

	/**
	 * Full-corpus track extents for every slider.
	 *
	 * @remarks
	 * Derived from the BOOTED corpus rather than from the bundled copy, so a streamed tier that differs
	 * from the fallback produces tracks that actually match the data on screen. The clamps, getters and
	 * rounding steps come from `real-estate-domain`, which is what keeps these identical to React's.
	 *
	 * @param corpus - The booted listings.
	 * @returns Baseline bounds per slider.
	 */
	function deriveBaselines(corpus: readonly Listing[]): Record<RealEstateSliderFieldId, NumericBounds> {
		const entries = REAL_ESTATE_SLIDER_FIELD_IDS.map((fieldId) => [
			fieldId,
			deriveBaselineBounds(corpus.map(SLIDER_FIELD_GETTERS[fieldId]), SLIDER_CLAMPS[fieldId], SLIDER_STEPS[fieldId]),
		] as const);

		return Object.fromEntries(entries) as Record<RealEstateSliderFieldId, NumericBounds>;
	}

	onMount(async () => {
		// Subscribe FIRST — the corpus starts streaming the moment boot is called, so a later
		// subscription would miss every progress event on a fast connection and show nothing at all.
		stopProgress = subscribeRealEstateBootProgress((next) => {
			progress = next;
		});

		try {
			const booted = (await bootRealEstateEngine()).engine;
			const corpus = booted.core.getSourceData();

			vocabularies = deriveRealEstateVocabularies(corpus);
			locationTree = buildListingLocationTree(corpus);
			// Two representations of one hierarchy: the TREE is what the picker renders; the flattened SPECS
			// carry each node's ids in the listing's `locationId` space, which is what the committed rule
			// holds and what the bundle needs to answer "would selecting this node empty the results".
			locationSpecs = buildLocationNodeSpecs(locationTree);
			metroCenters = deriveMetroCenters(corpus);
			baselines = deriveBaselines(corpus);

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
		} catch (error) {
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
	<!-- `<main>` around the alert rather than on it: a `role` on the element would replace the landmark. -->
	<main>
		<div class="fe-boot-error" role="alert">
			<p class="fe-boot-error__title">The real-estate engine did not boot</p>
			<p class="fe-boot-error__detail">{bootError}</p>
		</div>
	</main>
{:else if engine}
	<RealEstateView {baselines} {engine} {locationSpecs} {locationTree} {metroCenters} {vocabularies} />
{:else}
	<!-- `<main>`: until the engine boots, the caption is the page's main content. -->
	<main>
		<p class="fe-boot-caption fe-boot-caption--inline">
			{#each bootCaption as part (part.kind + part.text)}
				{#if part.kind === 'value'}
					<span class="fe-boot-caption__value">{part.text}</span>
				{:else}
					{part.text}
				{/if}
			{/each}
		</p>
	</main>
{/if}

<style>
	/* Local, not in ui-styles: a boot-failure panel is one route's copy, and the wine route's
	 * equivalent block says something entirely different (it names the corpus-generation commands).
	 * Two error states that share only a border color are not a shared component. */
	.fe-boot-error {
		margin: 3rem auto;
		max-width: 34rem;
		padding: 1.5rem;
		border: 1px solid var(--gray-4);
		border-radius: var(--radius-lg);
		background: var(--gray-1);
	}

	.fe-boot-error__title {
		margin: 0 0 0.5rem;
		color: var(--danger);
		font-weight: 600;
	}

	.fe-boot-error__detail {
		margin: 0;
		color: var(--gray-9);
		font-family: var(--font-mono);
		font-size: 0.8125rem;
	}

	/* The boot caption is styled entirely by `ui-styles`: `.fe-boot-caption--inline` for the element
	   and `.fe-boot-caption__value` for its live count, defined once for every app. A scoped copy
	   here would style only this page, and an `fe-` class that no `fe-*` stylesheet declares renders
	   unstyled with no warning. */
</style>
