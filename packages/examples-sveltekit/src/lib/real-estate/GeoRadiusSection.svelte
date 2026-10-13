<script lang="ts">
	/**
	 * `<GeoRadiusSection>` — the distance filter: a metro dropdown, a draggable map marker, and a
	 * radius slider, committed as one `GeoProximityRule`.
	 *
	 * @remarks
	 * The only section that loads a library — so it is dynamically imported by `<RealEstateView>` and
	 * handed down rather than imported by the panel.
	 *
	 * ### Enablement is DERIVED; center and radius are a re-seeded mirror
	 *
	 * The rule's PRESENCE is the checkbox, so an external `clearAllFacetRules()` or a removed
	 * results-header chip unchecks it for free — no reset table, no registration handshake, and no way
	 * for the panel's list of facets and this section's local state to drift apart. Same contract as
	 * every other facet in the panel, and the same one the Vue and Angular geo sections use.
	 *
	 * Center and radius are the exception, deliberately. They must survive the filter being turned OFF —
	 * unchecking and rechecking should not silently throw away the metro the user chose — so they live in
	 * local state, seeded from the committed rule at init and re-seeded by an `$effect`. That seeding is
	 * what makes a shared `?f` link open the map on the sender's location rather than on San Francisco,
	 * and it has to happen at INIT as well as in the effect: this section is dynamically imported, so a
	 * `?f` rule is already on the engine before its first effect tick, and one frame of San Francisco is
	 * one frame in which the Leaflet controller could be constructed around the wrong center. Neither
	 * path ever READS either value, only writes them, and each write hands back the object already on the
	 * rule — so a commit made from this section produces no change for the effect to see.
	 *
	 * ### Miles above, kilometers below
	 *
	 * Every surface a person sees is in miles; the engine's rule and the map's circle are both in
	 * kilometers. The conversion happens at exactly two points — reading the slider and writing the
	 * readout — and nowhere in between, because a value that is sometimes miles and sometimes
	 * kilometers is a bug waiting for a code review that does not catch it.
	 *
	 * ### The radius commits on RELEASE, not on input
	 *
	 * Dragging the slider paints a draft value immediately and commits once, on pointer-up / key-up /
	 * blur. Committing per input event would re-run an R-tree query and a full bundle round trip for
	 * every pixel of the drag. The draft is `null` when not dragging, which is what distinguishes
	 * "the user is mid-gesture" from "the radius happens to equal the committed one".
	 *
	 * ### While disabled, nothing is mounted
	 *
	 * The map, the dropdown and the slider only exist when the filter is on. An unmounted map fetches
	 * no tiles, which matters on a route where most visitors never touch the distance filter.
	 *
	 * ### No predictive disable here, deliberately
	 *
	 * A radius is a continuous surface, not a candidate list — there is nothing to enumerate and
	 * project. It is the geo rule's ABSENCE from the bundle query that lets it govern every other
	 * facet's disable state: the engine evaluates every other active rule when projecting a candidate,
	 * so a 15-mile Denver radius is exactly what greys out "Austin ISD".
	 */

	import type { Listing } from '@filter-enginez/mock-data/real-estate';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { geo, type GeoProximityRule } from '@filter-enginez/core';
	import {
		extractListingCoords,
		findMetroLabel,
		kmToMiles,
		type MapCoords,
		type MetroCenterOption,
		milesToKm,
	} from '@filter-enginez/examples-shared/real-estate-domain';
	import { createEngineStores } from '@filter-enginez/svelte-signals';
	import CheckboxControl from '$lib/controls/CheckboxControl.svelte';
	import SectionHeader from '$lib/controls/SectionHeader.svelte';
	import SelectMenu from '$lib/controls/SelectMenu.svelte';
	import { get } from 'svelte/store';

	import LeafletRadiusMap from './LeafletRadiusMap.svelte';
	import { clearRule, commitRule } from './realEstateCommit.js';

	interface Props {
		/** The real-estate engine. */
		readonly engine: SignalsEngine<Listing>;
		/**
		 * The metro dropdown's options.
		 *
		 * @remarks
		 * A PROP rather than a local `deriveMetroCenters(corpus)` call, because the results header needs
		 * the identical list to name the Distance chip's center. Two derivations would be two full
		 * corpus passes and two chances to disagree about where a metro's centroid is — and disagreeing
		 * would mean the dropdown reading "Greater Denver" while the chip printed coordinates.
		 */
		readonly metroCenters: readonly MetroCenterOption[];
	}

	const { engine, metroCenters }: Props = $props();

	/** Rule id + registry key for the distance filter. */
	const GEO_RULE_ID = 'geo-proximity';

	/** Where the map opens before the user picks a metro or grants location. */
	const DEFAULT_CENTER: MapCoords = { lat: 37.7749, lng: -122.4194 };

	/** A 15-mile default: wide enough to return results in any metro, tight enough to mean something. */
	const DEFAULT_RADIUS_KM = milesToKm(15);

	const RADIUS_MIN_MILES = 1;
	const RADIUS_MAX_MILES = 60;

	/** Coordinates are read at most once a minute, and a stale-by-a-minute fix is still your block. */
	const GEOLOCATION_MAX_AGE_MS = 60_000;
	const GEOLOCATION_TIMEOUT_MS = 10_000;

	/**
	 * This facet's rule store, subscribed once at init.
	 *
	 * @remarks
	 * `rule(GEO_RULE_ID)` rather than the whole `activeRules` map, so a chip toggle elsewhere in the
	 * panel does not wake the map. The engine is a prop that is never reassigned, so capturing it once is
	 * intended.
	 */
	// svelte-ignore state_referenced_locally
	const ruleStore = createEngineStores(engine).rule(GEO_RULE_ID);

	/** The committed distance filter, or `undefined` when the facet is off. */
	const committedRule = $derived($ruleStore as GeoProximityRule | undefined);

	/** Whether the distance filter is on. The rule's PRESENCE is the checkbox — see the docblock. */
	const isEnabled = $derived(committedRule !== undefined);

	/** The rule already on the engine at init — a `?f` restore, or a JSON config. */
	const seedRule = get(ruleStore) as GeoProximityRule | undefined;

	// `$state.raw` for the coordinate pair, NOT `$state`: it is replaced wholesale on every recenter and
	// handed straight to Leaflet, and — since it is seeded FROM the engine's own rule config — a deep
	// proxy would both be pure cost and risk handing that proxy back into a committed rule.
	let center = $state.raw<MapCoords>(seedRule?.config.center ?? DEFAULT_CENTER);
	let radiusKm = $state(seedRule?.config.radiusKm ?? DEFAULT_RADIUS_KM);
	/** The slider's mid-drag value, or `null` when not dragging. */
	let draftRadiusKm = $state<number | null>(null);
	let isLocating = $state(false);
	let locationError = $state<string | null>(null);

	// Re-seed the two mirrors from the COMMITTED rule — see the docblock. Reads `committedRule` only,
	// never `center` or `radiusKm`, so writing them here cannot re-trigger it.
	$effect(() => {
		const rule = committedRule;

		if (rule === undefined) {
			return;
		}
		center = rule.config.center;
		radiusKm = rule.config.radiusKm;
	});

	/**
	 * Write the geo rule for a center and radius, painting the controls first.
	 *
	 * @param nextCenter - The circle's center.
	 * @param nextRadiusKm - The circle's radius, in kilometers.
	 */
	function commitGeoRule(nextCenter: MapCoords, nextRadiusKm: number): void {
		center = nextCenter;
		radiusKm = nextRadiusKm;
		// A FUNCTION extractor, not a field name: `Listing.coordinates` is `{ lat, lon }` and the rule
		// wants `{ lat, lng }`. The rule can do this because it never has to survive serialization to a
		// worker on this tier — the bundle query, which does, is why `locationId` had to be materialized
		// as a real field while this one did not.
		commitRule(engine, GEO_RULE_ID, geo(extractListingCoords, { center: nextCenter, radiusKm: nextRadiusKm }));
	}

	/**
	 * Turn the whole filter on or off.
	 *
	 * @remarks
	 * Off REMOVES the rule rather than writing a permissive one, matching every selection facet in the
	 * panel: a `GeoProximityRule` has no neutral configuration, so a radius of zero would filter to
	 * nothing rather than to everything. Because {@link isEnabled} derives from the rule's presence, that
	 * removal IS what unchecks the box.
	 *
	 * @param nextEnabled - The checkbox's new state.
	 */
	function handleEnabledToggle(nextEnabled: boolean): void {
		if (nextEnabled) {
			commitGeoRule(center, radiusKm);

			return;
		}
		clearRule(engine, GEO_RULE_ID);
	}

	/**
	 * Recenter on a metro, or do nothing for the "custom location" placeholder.
	 *
	 * @param label - The chosen option's label, or `''` for the placeholder.
	 */
	function handleMetroChange(label: string): void {
		const option = metroCenters.find((candidate) => candidate.label === label);

		if (option === undefined) {
			return;
		}
		commitGeoRule(option.center, radiusKm);
	}

	/** Ask the browser where we are, and recenter on the answer. */
	function handleLocateMe(): void {
		if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
			locationError = 'Location is not available in this browser.';

			return;
		}
		isLocating = true;
		locationError = null;
		navigator.geolocation.getCurrentPosition(
			(position) => {
				isLocating = false;
				commitGeoRule({ lat: position.coords.latitude, lng: position.coords.longitude }, radiusKm);
			},
			(error) => {
				isLocating = false;
				// Two messages, because the two causes have different remedies: a denied permission is
				// something the user can reverse, an unavailable fix is something they can only retry.
				locationError =
					error.code === error.PERMISSION_DENIED
						? 'Location permission was denied.'
						: 'Your location could not be determined.';
			},
			{ maximumAge: GEOLOCATION_MAX_AGE_MS, timeout: GEOLOCATION_TIMEOUT_MS },
		);
	}

	/** Commit the drag, if it moved anything. */
	function handleRadiusCommit(): void {
		const draft = draftRadiusKm;

		draftRadiusKm = null;
		if (draft === null || draft === radiusKm) {
			return;
		}
		commitGeoRule(center, draft);
	}

	/** The metro whose center we are sitting on, or `''` for a custom position. */
	const selectedMetroLabel = $derived(findMetroLabel(metroCenters, center) ?? '');

	/** What the readout shows — the draft while dragging, the committed value otherwise. */
	const shownRadiusMiles = $derived(Math.round(kmToMiles(draftRadiusKm ?? radiusKm)));

	/** Names the center in whatever terms we have: a metro, or the raw coordinates. */
	const centerDescription = $derived(
		selectedMetroLabel === ''
			? `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`
			: selectedMetroLabel,
	);

	/**
	 * The announcement.
	 *
	 * @remarks
	 * Reads the COMMITTED radius, not the draft: a live region firing on every pixel of a drag would
	 * flood a screen reader with numbers nobody asked for. It updates once, when the drag lands.
	 */
	const liveRegionText = $derived(
		`Showing listings within ${String(Math.round(kmToMiles(radiusKm)))} miles of ${centerDescription}`,
	);
</script>

<section class="fe-geo">
	<SectionHeader label="Distance" />

	<CheckboxControl
		isChecked={isEnabled}
		label="Filter by distance"
		onToggle={handleEnabledToggle}
	/>

	{#if isEnabled}
		<div>
			<span class="fe-geo__label" id="fe-geo-metro-label">Metro area</span>
			<div class="fe-geo__row">
				<div class="fe-geo__select">
					<SelectMenu
						ariaLabel="Metro area"
						options={metroCenters.map((option) => ({ label: option.label, value: option.label }))}
						placeholder="Custom location"
						value={selectedMetroLabel}
						onChange={handleMetroChange}
					/>
				</div>
				<button
					type="button"
					class="fe-geo__locate"
					disabled={isLocating}
					aria-label="Center the search radius on my current location"
					onclick={handleLocateMe}
				>
					{isLocating ? 'Locating…' : 'Near me'}
				</button>
			</div>
		</div>

		<LeafletRadiusMap
			{center}
			{radiusKm}
			onCenterChange={(next) => {
				commitGeoRule(next, radiusKm);
			}}
		/>

		<div>
			<label class="fe-geo__radius-label" for="fe-geo-radius">
				<span>Radius</span>
				<span class="fe-geo__radius-value">{shownRadiusMiles} mi</span>
			</label>
			<!-- A native single-handle range input: `<RangeSlider>` is dual-handle by construction, and a
			     radius has one end. -->
			<input
				id="fe-geo-radius"
				class="fe-geo__radius"
				type="range"
				min={RADIUS_MIN_MILES}
				max={RADIUS_MAX_MILES}
				step="1"
				value={shownRadiusMiles}
				oninput={(event) => {
					draftRadiusKm = milesToKm(Number(event.currentTarget.value));
				}}
				onpointerup={handleRadiusCommit}
				onkeyup={handleRadiusCommit}
				onblur={handleRadiusCommit}
			/>
		</div>

		<p class="fe-geo__status" aria-live="polite">{liveRegionText}</p>

		{#if locationError !== null}
			<p class="fe-geo__error" role="alert">{locationError}</p>
		{/if}
	{/if}
</section>
