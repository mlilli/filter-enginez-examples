<script lang="ts">
	/**
	 * `<RealEstateFilterPanel>` — the fourteen-section real-estate filter panel.
	 *
	 * @remarks
	 * At parity with the React panel's facet set, and the widest panel in the repo: the location
	 * hierarchy (`InSetofSetsRule` over `locationId`), the geo-radius map (`GeoProximityRule` + R-tree), a
	 * high-cardinality school-district checklist and two chip `InSet`s, six range sliders, must-have
	 * features (the custom `ContainsAllRule`), the listed-date presets (`DateRangeRule`) and a
	 * description search (`TextSearchRule`) — all through one commit contract.
	 *
	 * ### Selection is DERIVED from the engine, never mirrored
	 *
	 * Every control reads its current value back out of the `activeRules` store — the same shape
	 * `<BooksFilterPanel>` uses, and the same one the Vue, Angular and vanilla real-estate panels use. So
	 * "Clear all", removing a chip in the results header, and a `?f` URL restore all reach into the
	 * controls for free: there is no second copy of the truth to keep in sync, no reset table, and no
	 * registration handshake for the two to drift apart in.
	 *
	 * Local `$state` arrays seeded to empty would be strictly worse than cosmetic:
	 * `routes/real-estate/+page.svelte` calls `core.loadConfig(urlConfig)` BEFORE this component
	 * mounts, so a `?f` reload would land with rules on the engine, correct results on screen, and
	 * every chip in the panel unselected — and clicking a third chip would then write a one-element
	 * set, silently dropping the two restored values the panel never knew about.
	 *
	 * Only the description search holds local text, because it holds UNCOMMITTED keystrokes: it is a
	 * `<TypeaheadSearch>`, which commits on a pause in typing or on blur, Enter or clear, and takes the
	 * committed query back only when it changes from outside, so a clear-all or a URL restore reaches
	 * the text input too while its own commit never yanks the text mid-word.
	 *
	 * The section headings, the tree's group name and height, the school-district list's height and
	 * the search field's copy are the `REAL_ESTATE_*` constants every app's panel shares.
	 *
	 * ### What the panel does NOT own
	 *
	 * The bundle. `<RealEstateView>` fetches it and publishes it through context; the panel reads it
	 * back through a GETTER, because context is captured once at component init and a plain value would
	 * freeze at `null` forever.
	 *
	 * The geo section's center and radius, likewise. Those two must survive the filter being switched
	 * off, so they live in that section as re-seeded mirrors; its ENABLEMENT is the geo rule's presence,
	 * so it derives like everything else here.
	 */

	import type { Listing } from '@filter-enginez/mock-data/real-estate';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';
	import type { Component } from 'svelte';

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
		REAL_ESTATE_DESCRIPTION_SEARCH,
		REAL_ESTATE_LISTED_DATE_LABEL,
		REAL_ESTATE_LOCATION_TREE,
		REAL_ESTATE_SCHOOL_DISTRICT_LIST_MAX_HEIGHT,
		type RealEstateChipVocabularies,
	} from '@filter-enginez/examples-shared/real-estate-domain';
	import { toggleSetValue } from '@filter-enginez/examples-shared/selection';
	import { createEngineStores } from '@filter-enginez/svelte-signals';
	import CheckboxList from '$lib/controls/CheckboxList.svelte';
	import ChipToggleGroup from '$lib/controls/ChipToggleGroup.svelte';
	import DatePresetGroup from '$lib/controls/DatePresetGroup.svelte';
	import HierarchicalPicker from '$lib/controls/HierarchicalPicker.svelte';
	import PanelHeader from '$lib/controls/PanelHeader.svelte';
	import SectionHeader from '$lib/controls/SectionHeader.svelte';
	import TypeaheadSearch from '$lib/controls/TypeaheadSearch.svelte';

	import { getRealEstateBundle } from './realEstateBundle.js';
	import { clearRule, commitRule, commitSelection } from './realEstateCommit.js';
	import RangeFacetSection from './sections/RangeFacetSection.svelte';

	const {
		engine,
		GeoRadiusSection = null,
		isComputing = false,
		locationSpecs,
		locationTree,
		metroCenters,
		vocabularies,
	}: {
		engine: SignalsEngine<Listing>;
		/**
		 * The geo-radius section, once the view has loaded it, or `null`.
		 *
		 * @remarks
		 * Passed DOWN rather than imported because it reaches Leaflet, which touches `window` at module
		 * scope — a static import here would put a mapping library in the SSR bundle. `null` on the
		 * server and for the first client frame, which is why the other thirteen sections must not
		 * depend on it being there.
		 */
		GeoRadiusSection?: Component<GeoSectionProps> | null;
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
		vocabularies: RealEstateChipVocabularies;
	} = $props();

	/** What the lazily-loaded geo section is handed. Declared here because this is what renders it. */
	interface GeoSectionProps {
		/** The real-estate engine, for the `GeoProximityRule` commit. */
		readonly engine: SignalsEngine<Listing>;
		/** The metro dropdown's options, derived once at the route. */
		readonly metroCenters: readonly MetroCenterOption[];
	}

	const bundleContext = getRealEstateBundle();
	const bundle = $derived(bundleContext?.current() ?? null);

	// ─── Committed selection, derived from the engine's rules ────────────────
	// Each `?? []` (or `?? null`) makes an ABSENT rule read as neutral, which is exactly what it is.

	// The engine arrives as a prop and is never reassigned — the route renders the view only after boot
	// resolves — so the one-time `createEngineStores` read is intended.
	// svelte-ignore state_referenced_locally
	const { activeRules, rule } = createEngineStores(engine);

	/**
	 * The description facet's OWN rule store.
	 *
	 * @remarks
	 * The one control here that reads a narrow signal rather than the map, so another facet's commit
	 * does not wake the search field. See `descriptionQuery`.
	 */
	const descriptionRule = rule('text-search');

	/**
	 * The picker's compact selection: the highest selected node per branch, never the closure, read
	 * back out of the committed sets.
	 */
	const locations = $derived(deriveLocationSelection($activeRules.get(LOCATION_RULE_ID), locationSpecs));

	/** The checked school districts. */
	const schoolDistricts = $derived(
		($activeRules.get('school-district') as InSetRule<string> | undefined)?.config.set ?? [],
	);

	/** @see schoolDistricts */
	const propertyTypes = $derived(
		($activeRules.get('property-type') as InSetRule<string> | undefined)?.config.set ?? [],
	);

	/** @see schoolDistricts */
	const statuses = $derived(($activeRules.get('status') as InSetRule<string> | undefined)?.config.set ?? []);

	/** The required feature set. Note `config.required`, not `config.set` — this is not an `InSetRule`. */
	const features = $derived(
		($activeRules.get('must-have-features') as ContainsAllRule | undefined)?.config.required ?? [],
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
	const datePreset = $derived<DatePresetValue | null>(
		coerceDatePreset(($activeRules.get('listed-date') as DateRangeRule | undefined)?.config.preset ?? null),
	);

	/**
	 * The committed description query the search field adopts; `''` when there is no rule.
	 *
	 * @remarks
	 * The field itself is a `<TypeaheadSearch>`, which holds the typed text and takes this query only
	 * when it changes from outside ("Clear all", a removed chip, Undo, a `?f` restore), never for the
	 * echo of its own commit.
	 */
	const descriptionQuery = $derived(($descriptionRule as TextSearchRule | undefined)?.config.query ?? '');

	/** Exclusion data per chip group. Empty until the first bundle — read as all-enabled. */
	const locationDisabled = $derived(chipDisabledSet(bundle, LOCATION_RULE_ID));
	const locationCounts = $derived(chipProjectedCounts(bundle, LOCATION_RULE_ID));
	const schoolDistrictExclusion = $derived(chipExclusionMap(bundle, 'school-district'));
	const propertyTypeExclusion = $derived(chipExclusionMap(bundle, 'property-type'));
	const statusExclusion = $derived(chipExclusionMap(bundle, 'status'));
	const featureExclusion = $derived(chipExclusionMap(bundle, 'must-have-features'));
</script>

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
		class:fe-filter-panel__body--busy={isComputing}
		aria-busy={isComputing}
	>
		<section>
			<SectionHeader label={REAL_ESTATE_LOCATION_TREE.groupLabel} />
			{#if locationTree}
				<HierarchicalPicker
					ariaLabel={REAL_ESTATE_LOCATION_TREE.groupLabel}
					tree={locationTree}
					selected={locations}
					counts={locationCounts}
					disabled={locationDisabled}
					maxHeight={REAL_ESTATE_LOCATION_TREE.maxHeight}
					onChange={(next) => {
						// The picker hands back the WHOLE next selection rather than one toggled value: a
						// single click can select a subtree, or de-cascade an ancestor into its siblings, so
						// "which id changed" is not expressible.
						commitSelection(engine, LOCATION_RULE_ID, next, (values) =>
							buildListingLocationRule(values, locationSpecs),
						);
					}}
				/>
			{/if}
		</section>

		<!-- The only section that loads a library, and so the only one that can be absent. Its
		     enablement derives from the geo rule's presence like every other facet here; only the center
		     and radius are local, because they must survive the filter being switched off. -->
		{#if GeoRadiusSection}
			<GeoRadiusSection {engine} {metroCenters} />
		{/if}

		<section>
			<SectionHeader label="School district" />
			<CheckboxList
				options={vocabularies.schoolDistricts}
				selected={schoolDistricts}
				exclusion={schoolDistrictExclusion}
				showCount
				maxHeight={REAL_ESTATE_SCHOOL_DISTRICT_LIST_MAX_HEIGHT}
				onToggle={(value) => {
					commitSelection(engine, 'school-district', toggleSetValue(schoolDistricts, value), (values) =>
						inSet<string>('schoolDistrict', values),
					);
				}}
			/>
		</section>

		<section>
			<SectionHeader label="Property type" />
			<ChipToggleGroup
				options={vocabularies.propertyTypes}
				selected={propertyTypes}
				exclusion={propertyTypeExclusion}
				formatLabel={humanizeVocabularyValue}
				onToggle={(value) => {
					commitSelection(engine, 'property-type', toggleSetValue(propertyTypes, value), (values) =>
						inSet<string>('propertyType', values),
					);
				}}
			/>
		</section>

		<section>
			<SectionHeader label="Status" />
			<ChipToggleGroup
				options={vocabularies.statuses}
				selected={statuses}
				exclusion={statusExclusion}
				formatLabel={humanizeVocabularyValue}
				onToggle={(value) => {
					commitSelection(engine, 'status', toggleSetValue(statuses, value), (values) =>
						inSet<string>('status', values),
					);
				}}
			/>
		</section>

		<!-- Six sliders, one component, one TABLE. Each section derives its handle position from its own
		     `RangeRule`; the baseline and the dimmed "available" zone it reads from the bundle context
		     itself.
		     RANGE_FACETS is shared with the Vue and Angular panels from `real-estate-domain`, so the six
		     labels, fields and number formats are ONE list rather than one per app — a lot size reads
		     the same here and next door, over the same corpus, in apps built for side-by-side comparison. -->
		{#each RANGE_FACETS as facet (facet.ruleId)}
			<RangeFacetSection {engine} {...facet} />
		{/each}

		<section>
			<SectionHeader label="Must-have features" />
			<!--
				The one CONJUNCTIVE facet in the panel, and the distinction matters here and nowhere else:
				every other facet WIDENS when you click it, so the engine drops its rule while projecting.
				This one NARROWS, so its rule stays active and each candidate is projected on top of what
				is already checked — otherwise "solar" would look available while "garage" is checked, even
				though no listing has both.
			-->
			<ChipToggleGroup
				options={vocabularies.features}
				selected={features}
				exclusion={featureExclusion}
				formatLabel={humanizeVocabularyValue}
				onToggle={(value) => {
					// `ContainsAllRule` with an empty `required` IS neutral — everything contains all of
					// nothing — so this facet could get away with writing one. It clears instead, so all
					// fourteen behave identically.
					commitSelection(
						engine,
						'must-have-features',
						toggleSetValue(features, value),
						(values) => new ContainsAllRule('features', { required: [...values]}),
					);
				}}
			/>
		</section>

		<section>
			<SectionHeader label={REAL_ESTATE_LISTED_DATE_LABEL} />
			<DatePresetGroup
				anyLabel="Any time"
				ariaLabel={REAL_ESTATE_LISTED_DATE_LABEL}
				presets={DATE_PRESET_OPTIONS}
				selected={datePreset}
				onSelect={(value) => {
					if (value === null) {
						clearRule(engine, 'listed-date');

						return;
					}
					commitRule(engine, 'listed-date', dateRange('listedDate', { preset: value }));
				}}
			/>
		</section>

		<section>
			<SectionHeader label="Description search" />
			<TypeaheadSearch
				ariaLabel={REAL_ESTATE_DESCRIPTION_SEARCH.ariaLabel}
				placeholder={REAL_ESTATE_DESCRIPTION_SEARCH.placeholder}
				ruleQuery={descriptionQuery}
				commit={(query: string) => {
					// An empty query REMOVES the rule, like every facet here; anything else is a
					// case-insensitive substring scan of the descriptions.
					if (query === '') {
						clearRule(engine, 'text-search');

						return;
					}
					commitRule(engine, 'text-search', text('description', { caseSensitive: false, mode: 'substring', query }));
				}}
			/>
		</section>
	</div>
</div>
