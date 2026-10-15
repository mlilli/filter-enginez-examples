<script setup lang="ts">
/**
 * `<RealEstateFilterPanel>` — the fourteen-section real-estate filter panel.
 *
 * @remarks
 * At parity with the React, Angular and Svelte panels' facet set, and the widest panel in the repo:
 * the location hierarchy (`InSetofSetsRule` over `locationId`), the geo-radius map (`GeoProximityRule` + R-tree), a
 * high-cardinality school-district checklist and two chip `InSet`s, six range sliders, must-have
 * features (the custom `ContainsAllRule`), the listed-date presets (`DateRangeRule`) and a description
 * search (`TextSearchRule`) — all through one commit contract.
 *
 * ### Selection is DERIVED from the engine, never mirrored
 *
 * Every control reads its current value back out of `activeRules` — the same shape
 * `<BooksFilterPanel>` uses, and the same one the Angular and vanilla real-estate panels use. So
 * "Clear all", removing a chip in the results header, and a `?f` URL restore all reach into the
 * controls for free: there is no second copy of the truth to keep in sync, no reset table, and no
 * registration handshake for the two to drift apart in.
 *
 * Fourteen local refs seeded to empty would be more than a cosmetic problem: `pages/RealEstatePage.vue`
 * calls `core.loadConfig(urlConfig)` BEFORE this component mounts, so a `?f` reload would land with
 * rules on the engine, correct results on screen, and every chip in the panel unselected — and clicking
 * a third chip would then write a one-element set, silently dropping the two restored values.
 *
 * Only `descriptionQuery` stays local, because it holds UNCOMMITTED keystrokes and deriving it would
 * fight the user's typing. It is re-seeded from the committed rule by a `watch`, which is what keeps a
 * clear-all or a URL restore reaching the text input too.
 *
 * ### What the panel does NOT own
 *
 * The bundle. `<RealEstateView>` fetches it and provides it; the panel injects it back. Vue needs no
 * getter indirection for this — a `shallowRef` IS the live handle — which is the one place this port
 * is simpler than its Svelte counterpart rather than merely different.
 *
 * The geo section's center and radius, likewise. Those two must survive the filter being switched off,
 * so they live in that section as re-seeded mirrors; its ENABLEMENT is the geo rule's presence, so it
 * derives like everything else here.
 */
import type { Listing } from '@filter-enginez/mock-data/real-estate';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import {
	dateRange,
	type DateRangeRule,
	inSet,
	type InSetRule,
	text,
	type TextSearchRule,
} from '@filter-enginez/core';
import {
	buildListingLocationRule,
	chipDisabledSet,
	chipExclusionMap,
	chipProjectedCounts,
	coerceDatePreset,
	ContainsAllRule,
	DATE_PRESET_OPTIONS,
	type DatePresetValue,
	deriveLocationSelection,
	humanizeVocabularyValue,
	LOCATION_RULE_ID,
	type LocationNodeSpec,
	type MetroCenterOption,
	type PickerTreeNode,
	RANGE_FACETS,
	type RealEstateChipVocabularies,
} from '@filter-enginez/examples-shared/real-estate-domain';
import { toggleSetValue } from '@filter-enginez/examples-shared/selection';
import { useEngineRefs } from '@filter-enginez/vue-signals';
import { type Component, computed, ref, watch } from 'vue';

import CheckboxList from '../controls/CheckboxList.vue';
import ChipToggleGroup from '../controls/ChipToggleGroup.vue';
import DatePresetGroup from '../controls/DatePresetGroup.vue';
import HierarchicalPicker from '../controls/HierarchicalPicker.vue';
import PanelHeader from '../controls/PanelHeader.vue';
import SearchInput from '../controls/SearchInput.vue';
import SectionHeader from '../controls/SectionHeader.vue';
import { injectRealEstateBundle } from './realEstateBundle.js';
import { clearRule, commitRule, commitSelection } from './realEstateCommit.js';
import RangeFacetSection from './sections/RangeFacetSection.vue';

const props = withDefaults(
	defineProps<{
		/** The real-estate engine. */
		engine: SignalsEngine<Listing>;
		/**
		 * The geo-radius section, once the view has loaded it, or `null`.
		 *
		 * @remarks
		 * Passed DOWN rather than imported because it reaches Leaflet. `null` for the first client frame,
		 * which is why the other thirteen sections must not depend on it being there.
		 */
		geoRadiusSection?: Component | null;
		/** Dims + locks the sections while a bundle round trip is pending. */
		isComputing?: boolean;
		/**
		 * The location tree flattened by `buildLocationNodeSpecs`: what the committed location rule is
		 * built from and read back through, and the same candidates the view's bundle query projects.
		 */
		locationSpecs: readonly LocationNodeSpec[];
		/** The location hierarchy the picker renders, or `null` before boot resolves. */
		locationTree: PickerTreeNode | null;
		/** Passed straight through to the geo section; the panel itself has no use for it. */
		metroCenters: readonly MetroCenterOption[];
		/** The chip vocabularies, derived from the booted corpus. */
		vocabularies: RealEstateChipVocabularies;
	}>(),
	{
		geoRadiusSection: null,
		isComputing: false,
	},
);

const bundleContext = injectRealEstateBundle();
const bundle = computed(() => bundleContext?.current.value ?? null);

// ─── Committed selection, derived from the engine's rules ────────────────
// Each `?? []` (or `?? null`) makes an ABSENT rule read as neutral, which is exactly what it is.

const { activeRules, rule } = useEngineRefs(props.engine);

/**
 * The description facet's OWN rule ref.
 *
 * @remarks
 * The one control here that watches a narrow signal rather than the whole `activeRules` map. Every
 * other selection is fully derived, so re-evaluating on any engine change is free and correct; this
 * one holds uncommitted keystrokes, and a map-wide dependency would discard them. See
 * `descriptionQuery`.
 */
const descriptionRule = rule('text-search');

/**
 * The picker's compact selection: the highest selected node per branch, never the closure, read back
 * out of the committed sets.
 */
const locations = computed<readonly string[]>(
	() => deriveLocationSelection(activeRules.value.get(LOCATION_RULE_ID), props.locationSpecs),
);

/** The checked school districts. */
const schoolDistricts = computed<readonly string[]>(
	() => (activeRules.value.get('school-district') as InSetRule<string> | undefined)?.config.set ?? [],
);

/** @see schoolDistricts */
const propertyTypes = computed<readonly string[]>(
	() => (activeRules.value.get('property-type') as InSetRule<string> | undefined)?.config.set ?? [],
);

/** @see schoolDistricts */
const statuses = computed<readonly string[]>(
	() => (activeRules.value.get('status') as InSetRule<string> | undefined)?.config.set ?? [],
);

/** The required feature set. Note `config.required`, not `config.set` — this is not an `InSetRule`. */
const features = computed<readonly string[]>(
	() => (activeRules.value.get('must-have-features') as ContainsAllRule | undefined)?.config.required ?? [],
);

/**
 * The listed-date chip, narrowed to a preset this panel actually renders.
 *
 * @remarks
 * The chip group needs the PRESET token, and a `DateRangeRule` restored from `?f` or written by a JSON
 * config can carry a preset the panel does not offer (`all-time`, for one) — or concrete dates and no
 * preset at all. `coerceDatePreset` returns `null` for both, so those render as "Any time" rather than
 * lighting a chip that does not describe the active filter.
 */
const datePreset = computed<DatePresetValue | null>(() =>
	coerceDatePreset((activeRules.value.get('listed-date') as DateRangeRule | undefined)?.config.preset ?? null),
);

/** The query the engine currently holds, or `''` when the facet is off. */
const committedDescription = computed(() => (descriptionRule.value as TextSearchRule | undefined)?.config.query ?? '');

/**
 * What the description input displays — the panel's ONE piece of local state.
 *
 * @remarks
 * Derived state would fight the user's typing, because the rule is only committed on blur / Enter and
 * so lags every keystroke in between. The `watch` re-seeds it from the COMMITTED value instead, which
 * is what makes "Clear all", a removed chip and a `?f` restore all reach into the text box — the same
 * pattern as the books panels' text mirrors in every vertical.
 *
 * Watching this facet's OWN rule, not the map: a map-wide source fires whenever any facet commits, and
 * firing means overwriting the keystrokes the user has not blurred yet. Clicking another control blurs
 * this input first, which commits — but undo/redo by keyboard and the devtools time travel this view
 * renders both change rules without moving focus.
 */
const descriptionQuery = ref(committedDescription.value);

watch(committedDescription, (value) => {
	descriptionQuery.value = value;
});

/** Exclusion data per chip group. Empty until the first bundle — read as all-enabled. */
const locationDisabled = computed(() => chipDisabledSet(bundle.value, LOCATION_RULE_ID));
const locationCounts = computed(() => chipProjectedCounts(bundle.value, LOCATION_RULE_ID));
const schoolDistrictExclusion = computed(() => chipExclusionMap(bundle.value, 'school-district'));
const propertyTypeExclusion = computed(() => chipExclusionMap(bundle.value, 'property-type'));
const statusExclusion = computed(() => chipExclusionMap(bundle.value, 'status'));
const featureExclusion = computed(() => chipExclusionMap(bundle.value, 'must-have-features'));

/**
 * Commit the location hierarchy's selection.
 *
 * @remarks
 * The picker hands back the WHOLE next selection rather than one toggled value: a single click can
 * select a subtree, or de-cascade an ancestor into its siblings, so "which id changed" is not
 * expressible.
 *
 * @param next - The picker's whole next selection.
 */
function handleLocationChange(next: readonly string[]): void {
	commitSelection(props.engine, LOCATION_RULE_ID, next, (values) => buildListingLocationRule(values, props.locationSpecs));
}

/**
 * Commit the school-district checklist.
 *
 * @param value - The row toggled.
 */
function handleSchoolDistrictToggle(value: string): void {
	commitSelection(props.engine, 'school-district', toggleSetValue(schoolDistricts.value, value), (values) =>
		inSet<string>('schoolDistrict', values),
	);
}

/**
 * Commit the property-type chips.
 *
 * @param value - The chip toggled.
 */
function handlePropertyTypeToggle(value: string): void {
	commitSelection(props.engine, 'property-type', toggleSetValue(propertyTypes.value, value), (values) =>
		inSet<string>('propertyType', values),
	);
}

/**
 * Commit the status chips.
 *
 * @param value - The chip toggled.
 */
function handleStatusToggle(value: string): void {
	commitSelection(props.engine, 'status', toggleSetValue(statuses.value, value), (values) =>
		inSet<string>('status', values),
	);
}

/**
 * Commit the must-have-features chips.
 *
 * @remarks
 * `ContainsAllRule` with an empty `required` IS neutral — everything contains all of nothing — so this
 * facet could get away with writing one. It clears instead, so all fourteen behave identically.
 *
 * @param value - The chip toggled.
 */
function handleFeatureToggle(value: string): void {
	commitSelection(
		props.engine,
		'must-have-features',
		toggleSetValue(features.value, value),
		(values) => new ContainsAllRule('features', { required: [...values]}),
	);
}

/**
 * Commit a listed-date preset, or clear the facet.
 *
 * @param value - The chosen preset, or `null` for "any time".
 */
function handleDatePresetSelect(value: DatePresetValue | null): void {
	if (value === null) {
		clearRule(props.engine, 'listed-date');

		return;
	}
	commitRule(props.engine, 'listed-date', dateRange('listedDate', { preset: value }));
}

/**
 * Mirror the typed text without filtering.
 *
 * @remarks
 * Typing alone does not filter — the rule is committed on blur / Enter instead, so a substring scan of
 * the corpus runs once per query rather than once per keystroke.
 *
 * @param next - The current input text.
 */
function handleDescriptionChange(next: string): void {
	descriptionQuery.value = next;
}

/**
 * Commit the description search, or clear it when the query empties.
 *
 * @param next - The committed text.
 */
function handleDescriptionCommit(next: string): void {
	descriptionQuery.value = next;
	if (next.trim().length === 0) {
		clearRule(props.engine, 'text-search');

		return;
	}
	commitRule(
		props.engine,
		'text-search',
		text('description', { caseSensitive: false, mode: 'substring', query: next.trim() }),
	);
}
</script>

<template>
	<div class="fe-filter-panel">
		<PanelHeader />

		<!--
			`--busy` dims and blocks pointer events while the engine recomputes, so a burst of clicks cannot
			outrun it. Deliberately NOT `inert`, which would blur whatever is focused inside: committing a
			filter by keyboard would then drop the user back at the top of the document on every selection.
			Mouse users never notice `inert` here; keyboard users lose their place every time.
		-->
		<div
			class="fe-filter-panel__scroller fe-filter-panel__body"
			:class="{ 'fe-filter-panel__body--busy': isComputing }"
			:aria-busy="isComputing"
		>
			<section>
				<SectionHeader label="Location" />
				<HierarchicalPicker
					v-if="locationTree"
					group-label="Location"
					:counts="locationCounts"
					:disabled="locationDisabled"
					max-height="14rem"
					:selected="locations"
					:tree="locationTree"
					@change="handleLocationChange"
				/>
			</section>

			<!-- The only section that loads a library, and so the only one that can be absent. Its
			     enablement derives from the geo rule's presence like every other facet here; only the
			     center and radius are local, because they must survive the filter being switched off. -->
			<component :is="geoRadiusSection" v-if="geoRadiusSection" :engine="engine" :metro-centers="metroCenters" />

			<section>
				<SectionHeader label="School district" />
				<CheckboxList
					:exclusion="schoolDistrictExclusion"
					max-height="220px"
					:options="vocabularies.schoolDistricts"
					:selected="schoolDistricts"
					show-count
					@toggle="handleSchoolDistrictToggle"
				/>
			</section>

			<section>
				<SectionHeader label="Property type" />
				<ChipToggleGroup
					:exclusion="propertyTypeExclusion"
					:format-label="humanizeVocabularyValue"
					:options="vocabularies.propertyTypes"
					:selected="propertyTypes"
					@toggle="handlePropertyTypeToggle"
				/>
			</section>

			<section>
				<SectionHeader label="Status" />
				<ChipToggleGroup
					:exclusion="statusExclusion"
					:format-label="humanizeVocabularyValue"
					:options="vocabularies.statuses"
					:selected="statuses"
					@toggle="handleStatusToggle"
				/>
			</section>

			<!-- Six sliders, one component, one table. Each derives its handle position from its own
			     `RangeRule`; the baseline and the dimmed "available" zone it reads from the bundle context
			     itself. -->
			<RangeFacetSection v-for="facet in RANGE_FACETS" v-bind="facet" :key="facet.ruleId" :engine="engine" />

			<section>
				<SectionHeader label="Must-have features" />
				<!--
					The one CONJUNCTIVE facet in the panel, and the distinction matters here and nowhere else:
					every other facet WIDENS when you click it, so the engine drops its rule while projecting.
					This one NARROWS, so its rule stays active and each candidate is projected on top of what is
					already checked — otherwise "solar" would look available while "garage" is checked, even
					though no listing has both.
				-->
				<ChipToggleGroup
					:exclusion="featureExclusion"
					:format-label="humanizeVocabularyValue"
					:options="vocabularies.features"
					:selected="features"
					@toggle="handleFeatureToggle"
				/>
			</section>

			<section>
				<SectionHeader label="Listed within" />
				<DatePresetGroup
					any-label="Any time"
					group-label="Listed within"
					:presets="DATE_PRESET_OPTIONS"
					:selected="datePreset"
					@select="handleDatePresetSelect"
				/>
			</section>

			<section>
				<SectionHeader label="Description search" />
				<SearchInput
					input-label="Search listing descriptions"
					placeholder="waterfront, remodeled, cul-de-sac…"
					:value="descriptionQuery"
					@change="handleDescriptionChange"
					@commit="handleDescriptionCommit"
				/>
			</section>
		</div>
	</div>
</template>
