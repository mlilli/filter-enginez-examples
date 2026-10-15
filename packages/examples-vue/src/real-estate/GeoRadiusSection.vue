<script setup lang="ts">
/**
 * `<GeoRadiusSection>` — the distance filter: a metro dropdown, a draggable map marker, and a radius
 * slider, committed as one `GeoProximityRule`: the shared distance rule every app commits, over the
 * listing's `coords` field (`buildListingGeoRadiusRule`), so a `?f` link this section writes loads the
 * same circle in every app, and after a reload.
 *
 * @remarks
 * The only section that loads a library — so it is dynamically imported by `<RealEstateView>` and
 * handed down rather than imported by the panel.
 *
 * ### Enablement is DERIVED; center and radius are a re-seeded mirror
 *
 * All three are read out of the committed rule by the shared `deriveGeoRadius`. The rule's PRESENCE is
 * the checkbox, so an external `clearRules()` or a removed results-header chip unchecks it for free —
 * no reset table, no registration handshake, and no way for the panel's list of facets and this
 * section's local state to drift apart. Same contract as every other facet in the
 * panel, and the same one Angular's geo section uses.
 *
 * Center and radius are the exception, deliberately. They must survive the filter being turned OFF —
 * unchecking and rechecking should not silently throw away the metro the user chose — so they live in
 * local refs, re-seeded from the committed rule by a `watch`. That watch is what makes a shared `?f`
 * link open the map on the sender's location rather than on San Francisco. It never READS either ref,
 * only writes them, and each write hands back the object already on the rule, so a commit made from
 * this section produces no change for the refs to see.
 *
 * ### Miles above, kilometers below
 *
 * Every surface a person sees is in miles; the engine's rule and the map's circle are both in
 * kilometers. The conversion happens at exactly two points — reading the slider and writing the
 * readout — and nowhere in between, because a value that is sometimes miles and sometimes kilometers
 * is a bug waiting for a code review that does not catch it.
 *
 * ### The radius commits on RELEASE, not on input
 *
 * Dragging the slider paints a draft value immediately and commits once, on pointer-up / key-up /
 * blur. Committing per input event would re-run an R-tree query and a full bundle round trip for every
 * pixel of the drag. The draft is `null` when not dragging, which is what distinguishes "the user is
 * mid-gesture" from "the radius happens to equal the committed one".
 *
 * ### While disabled, nothing is mounted
 *
 * The map, the dropdown and the slider only exist when the filter is on. An unmounted map fetches no
 * tiles, which matters on a route where most visitors never touch the distance filter.
 *
 * ### No predictive disable here, deliberately
 *
 * A radius is a continuous surface, not a candidate list — there is nothing to enumerate and project.
 * It is the geo rule's ABSENCE from the bundle query that lets it govern every other facet's disable
 * state: the engine evaluates every other active rule when projecting a candidate, so a 15-mile Denver
 * radius is exactly what greys out "Austin ISD".
 */
import type { Listing } from '@filter-enginez/mock-data/real-estate';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import {
	buildListingGeoRadiusRule,
	deriveGeoRadius,
	findMetroLabel,
	GEO_RADIUS_RULE_ID,
	kmToMiles,
	type MapCoords,
	type MetroCenterOption,
	milesToKm,
} from '@filter-enginez/examples-shared/real-estate-domain';
import { useEngineRefs } from '@filter-enginez/vue-signals';
import { computed, ref, shallowRef, watch } from 'vue';

import CheckboxControl from '../controls/CheckboxControl.vue';
import SectionHeader from '../controls/SectionHeader.vue';
import SelectMenu from '../controls/SelectMenu.vue';
import LeafletRadiusMap from './LeafletRadiusMap.vue';
import { clearRule, commitRule } from './realEstateCommit.js';

const props = defineProps<{
	/** The real-estate engine. */
	engine: SignalsEngine<Listing>;
	/**
	 * The metro dropdown's options.
	 *
	 * @remarks
	 * A PROP rather than a local `deriveMetroCenters(corpus)` call, because the results header needs the
	 * identical list to name the Distance chip's center. Two derivations would be two full corpus passes
	 * and two chances to disagree about where a metro's centroid is — and disagreeing would mean the
	 * dropdown reading "Greater Denver" while the chip printed coordinates.
	 */
	metroCenters: readonly MetroCenterOption[];
}>();

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
 * This facet's rule ref, subscribed once during setup.
 *
 * @remarks
 * `rule(GEO_RADIUS_RULE_ID)` rather than the whole `activeRules` map, so a chip toggle elsewhere in the panel
 * does not wake the map. It must be called in `setup()` — that is where the subscription is torn down
 * from — so the `as` cast happens in a `computed` over the ref rather than on the call itself.
 */
const ruleRef = useEngineRefs(props.engine).rule(GEO_RADIUS_RULE_ID);

/** The committed distance filter's circle, or `undefined` when the facet is off. */
const committedRadius = computed(() => deriveGeoRadius(ruleRef.value));

/** Whether the distance filter is on. The rule's PRESENCE is the checkbox — see the docblock. */
const isEnabled = computed(() => committedRadius.value !== undefined);

// `shallowRef` for the coordinate pair: it is replaced wholesale on every recenter and handed straight
// to Leaflet, so deep-proxying two numbers would buy nothing and hand a proxy to a library that has no
// use for one.
const center = shallowRef<MapCoords>(DEFAULT_CENTER);
const radiusKm = ref(DEFAULT_RADIUS_KM);
/** The slider's mid-drag value, or `null` when not dragging. */
const draftRadiusKm = ref<number | null>(null);
const isLocating = ref(false);
const locationError = ref<string | null>(null);

// Re-seed the two mirrors from the COMMITTED rule — see the docblock. `immediate`, because a `?f`
// restore has already loaded the rule by the time this section's module finishes loading, so waiting
// for the next change would open the map on San Francisco and leave it there.
watch(
	committedRadius,
	(committed) => {
		if (committed === undefined) {
			return;
		}
		center.value = committed.center;
		radiusKm.value = committed.radiusKm;
	},
	{ immediate: true },
);

/**
 * Write the geo rule for a center and radius, painting the controls first.
 *
 * @param nextCenter - The circle's center.
 * @param nextRadiusKm - The circle's radius, in kilometers.
 */
function commitGeoRule(nextCenter: MapCoords, nextRadiusKm: number): void {
	center.value = nextCenter;
	radiusKm.value = nextRadiusKm;
	commitRule(props.engine, GEO_RADIUS_RULE_ID, buildListingGeoRadiusRule({ center: nextCenter, radiusKm: nextRadiusKm }));
}

/**
 * Turn the whole filter on or off.
 *
 * @remarks
 * Off REMOVES the rule rather than writing a permissive one, matching every selection facet in the
 * panel: a `GeoProximityRule` has no neutral configuration, so a radius of zero would filter to nothing
 * rather than to everything. Because {@link isEnabled} derives from the rule's presence, that removal
 * IS what unchecks the box.
 *
 * @param nextEnabled - The checkbox's new state.
 */
function handleEnabledToggle(nextEnabled: boolean): void {
	if (nextEnabled) {
		commitGeoRule(center.value, radiusKm.value);

		return;
	}
	clearRule(props.engine, GEO_RADIUS_RULE_ID);
}

/**
 * Recenter on a metro, or do nothing for the "custom location" placeholder.
 *
 * @param label - The chosen option's label, or `''` for the placeholder.
 */
function handleMetroChange(label: string): void {
	const option = props.metroCenters.find((candidate) => candidate.label === label);

	if (option === undefined) {
		return;
	}
	commitGeoRule(option.center, radiusKm.value);
}

/** Ask the browser where we are, and recenter on the answer. */
function handleLocateMe(): void {
	if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
		locationError.value = 'Location is not available in this browser.';

		return;
	}
	isLocating.value = true;
	locationError.value = null;
	navigator.geolocation.getCurrentPosition(
		(position) => {
			isLocating.value = false;
			commitGeoRule({ lat: position.coords.latitude, lng: position.coords.longitude }, radiusKm.value);
		},
		(error) => {
			isLocating.value = false;
			// Two messages, because the two causes have different remedies: a denied permission is
			// something the user can reverse, an unavailable fix is something they can only retry.
			locationError.value =
				error.code === error.PERMISSION_DENIED
					? 'Location permission was denied.'
					: 'Your location could not be determined.';
		},
		{ maximumAge: GEOLOCATION_MAX_AGE_MS, timeout: GEOLOCATION_TIMEOUT_MS },
	);
}

/** Paint the draft while the handle moves; nothing is committed yet. */
function handleRadiusInput(event: Event): void {
	draftRadiusKm.value = milesToKm(Number((event.target as HTMLInputElement).value));
}

/** Commit the drag, if it moved anything. */
function handleRadiusCommit(): void {
	const draft = draftRadiusKm.value;

	draftRadiusKm.value = null;
	if (draft === null || draft === radiusKm.value) {
		return;
	}
	commitGeoRule(center.value, draft);
}

/** The metro whose center we are sitting on, or `''` for a custom position. */
const selectedMetroLabel = computed(() => findMetroLabel(props.metroCenters, center.value) ?? '');

/** The dropdown's options, labelled by name and keyed by the same string. */
const metroOptions = computed(() => props.metroCenters.map((option) => ({ label: option.label, value: option.label })));

/** What the readout shows — the draft while dragging, the committed value otherwise. */
const shownRadiusMiles = computed(() => Math.round(kmToMiles(draftRadiusKm.value ?? radiusKm.value)));

/** Names the center in whatever terms we have: a metro, or the raw coordinates. */
const centerDescription = computed(() =>
	selectedMetroLabel.value === ''
		? `${center.value.lat.toFixed(4)}, ${center.value.lng.toFixed(4)}`
		: selectedMetroLabel.value,
);

/**
 * The announcement.
 *
 * @remarks
 * Reads the COMMITTED radius, not the draft: a live region firing on every pixel of a drag would flood
 * a screen reader with numbers nobody asked for. It updates once, when the drag lands.
 */
const liveRegionText = computed(
	() => `Showing listings within ${String(Math.round(kmToMiles(radiusKm.value)))} miles of ${centerDescription.value}`,
);
</script>

<template>
	<section class="fe-geo">
		<SectionHeader label="Distance" />

		<CheckboxControl :is-checked="isEnabled" label="Filter by distance" @toggle="handleEnabledToggle" />

		<template v-if="isEnabled">
			<div>
				<span id="fe-geo-metro-label" class="fe-geo__label">Metro area</span>
				<div class="fe-geo__row">
					<div class="fe-geo__select">
						<SelectMenu
							select-label="Metro area"
							:options="metroOptions"
							placeholder="Custom location"
							:value="selectedMetroLabel"
							@change="handleMetroChange"
						/>
					</div>
					<button
						type="button"
						class="fe-geo__locate"
						:disabled="isLocating"
						aria-label="Center the search radius on my current location"
						@click="handleLocateMe"
					>
						{{ isLocating ? 'Locating…' : 'Near me' }}
					</button>
				</div>
			</div>

			<LeafletRadiusMap :center="center" :radius-km="radiusKm" @center-change="commitGeoRule($event, radiusKm)" />

			<div>
				<label class="fe-geo__radius-label" for="fe-geo-radius">
					<span>Radius</span>
					<span class="fe-geo__radius-value">{{ shownRadiusMiles }} mi</span>
				</label>
				<!-- A native single-handle range input: `<RangeSlider>` is dual-handle by construction, and a
				     radius has one end. -->
				<input
					id="fe-geo-radius"
					class="fe-geo__radius"
					type="range"
					:min="RADIUS_MIN_MILES"
					:max="RADIUS_MAX_MILES"
					step="1"
					:value="shownRadiusMiles"
					@input="handleRadiusInput"
					@pointerup="handleRadiusCommit"
					@keyup="handleRadiusCommit"
					@blur="handleRadiusCommit"
				/>
			</div>

			<p class="fe-geo__status" aria-live="polite">{{ liveRegionText }}</p>

			<p v-if="locationError !== null" class="fe-geo__error" role="alert">{{ locationError }}</p>
		</template>
	</section>
</template>
