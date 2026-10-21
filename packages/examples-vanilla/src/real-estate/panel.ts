/**
 * `real-estate/panel` — the fourteen-section real-estate filter panel, hand-built.
 *
 * @remarks
 * The widest panel in the repo, and the framework-less port of Vue's `<RealEstateFilterPanel>` and its
 * Svelte / Angular / React twins: the location hierarchy (`InSetofSetsRule` over `locationId`), the geo-radius map
 * (`GeoProximityRule` + R-tree), a high-cardinality school-district facet and two chip `InSet`s, six
 * range sliders (`RangeRule`), must-have features (the custom `ContainsAllRule`), the listed-date
 * presets (`DateRangeRule`) and a description search (`TextSearchRule`) — all through one write path.
 *
 * ### It reads its control positions back out of the ENGINE
 *
 * `update(state)` repaints all fourteen sections from the engine's committed rule map, as
 * `books/panel.ts` does and as the Vue, Svelte and Angular real-estate panels do. Real estate boots on
 * the MAIN thread, so that map is authoritative the instant a write returns — and the payoff is that
 * there is no local-reset table at all. Removing a pill, "Clear all", and hydrating a shared `?f`
 * link are the same code path as a click, so a facet cannot end up with a control that still looks
 * set over results it no longer affects. The line is structural rather than held by hand.
 *
 * The one exception is the geo section, which keeps its last-used center and radius locally — the rule
 * is *absent* while that filter is off, so there is nothing to read back. It documents why.
 *
 * ### Busy, focus and the shared copy
 *
 * Every write goes through {@link RealEstatePanelOptions.markBusy} first — the shared
 * `realEstateBusyCore` — and {@link RealEstatePanel.setBusy} paints the body's `--busy` /
 * `aria-busy` from it. The chips, the school-district list and the location tree update in place,
 * keyed by value, so a keyboard user's focus survives their click and the repaint after it. The
 * location tree's name and height, the school-district list's height, the listed-date label and the
 * description search's words are the shared `REAL_ESTATE_*` constants.
 *
 * ### Nothing about this dataset is defined here
 *
 * Vocabularies, baselines, the location hierarchy, the bundle query, the custom rule, the unit
 * conversions and every formatter come from `@filter-enginez/examples-shared/real-estate-domain`. Six
 * verticals render this dataset; the moment one of them inlines "just this one formatter", a chip
 * reads `single-family` while the card beside it reads `single family` over the same corpus.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import {
	dateRange,
	type DateRangeRule,
	type FilterBundle,
	type FilterBundleQuery,
	type FilterEngine,
	type FilterRule,
	inSet,
	type InSetRule,
	type RuleId,
	text,
	type TextSearchRule,
} from '@filter-enginez/core';
import { el } from '@filter-enginez/examples-shared/dom';
import {
	buildListingLocationRule,
	buildListingLocationTree,
	buildLocationNodeSpecs,
	buildRealEstateBundleQuery,
	chipDisabledSet,
	chipExclusionMap,
	chipProjectedCounts,
	coerceDatePreset,
	ContainsAllRule,
	DATE_PRESET_OPTIONS,
	type DatePresetValue,
	deriveGeoRadius,
	deriveLocationSelection,
	deriveRealEstateVocabularies,
	GEO_RADIUS_RULE_ID,
	humanizeVocabularyValue,
	LOCATION_RULE_ID,
	type MetroCenterOption,
	REAL_ESTATE_DESCRIPTION_SEARCH,
	REAL_ESTATE_LISTED_DATE_LABEL,
	REAL_ESTATE_LOCATION_TREE,
	REAL_ESTATE_SCHOOL_DISTRICT_LIST_MAX_HEIGHT,
} from '@filter-enginez/examples-shared/real-estate-domain';
import { toggleSetValue } from '@filter-enginez/examples-shared/selection';

import { createCheckboxList, createChipToggleGroup } from '../controls/controls.js';
import { createDatePresetGroup } from '../controls/datePresetGroup.js';
import { createHierarchicalPicker } from '../controls/hierarchicalPicker.js';
import { panelHeader, section } from '../controls/sections.js';
import { createTypeaheadSearch } from '../controls/typeaheadSearch.js';
import { createGeoSection } from './geoSection.js';
import { createSliderFacets, deriveSliderBaselines } from './panelSections.js';

/** The engine snapshot the panel renders from. */
export interface RealEstatePanelState {
	/** The predictive-disable bundle for the current state, or `null` when unavailable. */
	readonly bundle: FilterBundle | null;
	/** The engine's active-rule map — every control derives its committed state from this. */
	readonly rules: ReadonlyMap<RuleId, FilterRule>;
}

/** A mounted panel: its root element, the bundle query it needs, and an in-place updater. */
export interface RealEstatePanel {
	/** Drop the geo section's map. */
	readonly dispose: () => void;
	/** The panel root. */
	readonly element: HTMLElement;
	/** Re-measure the map after the mobile collapse reveals the panel. */
	readonly invalidateMapSize: () => void;
	/** The `applyFiltersAndQuery` query describing every facet this panel predictive-disables. */
	readonly query: FilterBundleQuery;
	/** Dim the body and set `aria-busy` while the real-estate busy tracker says a write is settling. */
	readonly setBusy: (isBusy: boolean) => void;
	/** Re-apply committed engine state to every control. */
	readonly update: (state: RealEstatePanelState) => void;
}

/** Construction options for {@link createRealEstatePanel}. */
export interface RealEstatePanelOptions {
	/** Mark the real-estate busy tracker. The panel's one write path calls it FIRST. */
	readonly markBusy: () => void;
	/**
	 * The metro dropdown's options.
	 *
	 * @remarks
	 * Derived by the VIEW rather than here, because the results header's Distance chip needs the
	 * identical list to name its center — see `createGeoSection`'s note on why one derivation matters.
	 */
	readonly metroCenters: readonly MetroCenterOption[];
}

/**
 * Build the real-estate filter panel over a bare engine.
 *
 * @param core - The engine every control writes through.
 * @param options - The metro options the geo section recenters on.
 * @returns The mounted panel + the bundle query its predictive-disable needs.
 */
export function createRealEstatePanel(
	core: FilterEngine<Listing>,
	options: RealEstatePanelOptions,
): RealEstatePanel {
	const { markBusy, metroCenters } = options;

	// The corpus is resident + immutable post-boot, so the vocabularies, the hierarchy, the baselines
	// and the bundle query are all computed once — the equivalent of React's `useMemo(…, [sourceData])`.
	const corpus = core.getSourceData();
	const vocabularies = deriveRealEstateVocabularies(corpus);
	const locationTree = buildListingLocationTree(corpus);
	// Two representations of ONE hierarchy: the TREE is what the picker renders; the flattened SPECS
	// carry each node's ids in the listing's `locationId` space, which is what the committed rule holds
	// and what the bundle needs to answer "would selecting this node empty the results".
	const locationSpecs = buildLocationNodeSpecs(locationTree);
	const baselines = deriveSliderBaselines(corpus);
	const query: FilterBundleQuery = buildRealEstateBundleQuery(
		baselines,
		vocabularies,
		locationSpecs,
	);

	/** The most recent state, so a click handler can read the committed selection synchronously. */
	let latest: RealEstatePanelState = { bundle: null, rules: new Map() };

	// ─── The single write path ────────────────────────────────────────────────

	/**
	 * Apply a rule, or REMOVE the facet when `rule` is `null`.
	 *
	 * @remarks
	 * **This is the one place a facet is cleared, so all fourteen clear the same way.** An `InSetRule`
	 * with an empty set matches every item, but writing one on deselect-everything would leave a rule
	 * registered that no control shows, carried in the `?f=` link and logged as a change rather than a
	 * removal. The call looks perfectly reasonable in review, which is exactly why the decision cannot
	 * live at fourteen call sites.
	 *
	 * `ContainsAllRule` with an empty `required` IS neutral — everything contains all of nothing — so
	 * must-have features could get away with writing one. It clears anyway, so all fourteen behave
	 * identically and nobody has to remember which facet is the exception.
	 *
	 * **The busy mark is here too, for the same reason** — and so is the one case that must NOT mark:
	 * clearing a facet that holds no rule writes nothing, emits no change, and so would never settle.
	 *
	 * @param ruleId - The facet's stable rule id.
	 * @param rule - The rule to apply, or `null` to clear the facet.
	 */
	function commitFacet(ruleId: RuleId, rule: FilterRule | null): void {
		if (rule === null) {
			if (!core.getRules().has(ruleId)) {
				return;
			}
			markBusy();
			core.removeRule(ruleId);

			return;
		}
		markBusy();
		core.addRule(ruleId, rule);
	}

	/**
	 * Commit a selection-shaped facet: build its rule when something is selected, clear it otherwise.
	 *
	 * @remarks
	 * A thin adapter onto {@link commitFacet} so the emptiness test is written once too. `build` is
	 * only called for a non-empty selection, so it never has to defend against the empty case.
	 *
	 * @typeParam V - The selected value type.
	 * @param ruleId - The facet's stable rule id.
	 * @param values - The next selection.
	 * @param build - Builds the rule from a NON-EMPTY selection.
	 */
	function commitSelection<V extends string>(
		ruleId: RuleId,
		values: readonly V[],
		build: (values: readonly V[]) => FilterRule,
	): void {
		commitFacet(ruleId, values.length === 0 ? null : build(values));
	}

	/** The committed value set of an `InSetRule` (empty when the rule is absent). */
	function selectedSet(ruleId: RuleId): readonly string[] {
		return (latest.rules.get(ruleId) as InSetRule<string> | undefined)?.config.set ?? [];
	}

	// ─── Controls ─────────────────────────────────────────────────────────────

	const locationPicker = createHierarchicalPicker({
		groupLabel: REAL_ESTATE_LOCATION_TREE.groupLabel,
		maxHeight: REAL_ESTATE_LOCATION_TREE.maxHeight,
		// The picker hands back the WHOLE next selection rather than one toggled value: a single click
		// can select a subtree, or de-cascade an ancestor into its siblings, so "which id changed" is
		// not expressible.
		onChange: (next) => {
			commitSelection(LOCATION_RULE_ID, next, (values) => buildListingLocationRule(values, locationSpecs));
		},
	});

	const geoSection = createGeoSection({ commit: commitFacet, metroCenters });

	// A scrolling checkbox list with projected counts, the control every vertical renders school
	// districts with: with ~30 districts the counts are what make the facet navigable. It shares the
	// chips' exclusion rule — an unselected district that would empty the results is disabled.
	const schoolDistrictList = createCheckboxList({
		maxHeight: REAL_ESTATE_SCHOOL_DISTRICT_LIST_MAX_HEIGHT,
		onToggle: (value) => {
			commitSelection('school-district', toggleSetValue(selectedSet('school-district'), value), (values) =>
				inSet<string>('schoolDistrict', values),
			);
		},
		showCount: true,
	});

	const propertyTypeChips = createChipToggleGroup({
		formatLabel: humanizeVocabularyValue,
		onToggle: (value) => {
			commitSelection('property-type', toggleSetValue(selectedSet('property-type'), value), (values) =>
				inSet<string>('propertyType', values),
			);
		},
	});

	const statusChips = createChipToggleGroup({
		formatLabel: humanizeVocabularyValue,
		onToggle: (value) => {
			commitSelection('status', toggleSetValue(selectedSet('status'), value), (values) =>
				inSet<string>('status', values),
			);
		},
	});

	const sliders = createSliderFacets({ baselines, commit: commitFacet });

	const featureChips = createChipToggleGroup({
		formatLabel: humanizeVocabularyValue,
		onToggle: (value) => {
			commitSelection(
				'must-have-features',
				toggleSetValue(committedFeatures(), value),
				(values) => new ContainsAllRule('features', { required: [...values]}),
			);
		},
	});

	const datePresets = createDatePresetGroup<DatePresetValue>({
		anyLabel: 'Any time',
		groupLabel: REAL_ESTATE_LISTED_DATE_LABEL,
		onSelect: (value) => {
			commitFacet('listed-date', value === null ? null : dateRange('listedDate', { preset: value }));
		},
	});

	// The shared typeahead controller: a debounced commit while typing, a flush on blur / Enter /
	// clear, nothing for an unchanged query. An empty query removes the rule.
	const descriptionSearch = createTypeaheadSearch({
		ariaLabel: REAL_ESTATE_DESCRIPTION_SEARCH.ariaLabel,
		commit: (trimmed) => {
			commitFacet(
				'text-search',
				trimmed === '' ? null : text('description', { caseSensitive: false, mode: 'substring', query: trimmed }),
			);
		},
		initialQuery: (core.getRules().get('text-search') as TextSearchRule | undefined)?.config.query ?? '',
		placeholder: REAL_ESTATE_DESCRIPTION_SEARCH.placeholder,
	});

	/** The committed must-have set (empty when the rule is absent). */
	function committedFeatures(): readonly string[] {
		return (
			(latest.rules.get('must-have-features') as ContainsAllRule | undefined)?.config.required ?? []
		);
	}

	// ─── Assembly — the fourteen sections, in render order ─────────────────────

	const body = el('div', {
		// Scroller and body on ONE element, as the books panel does: this panel has nothing that must
		// scroll with the sections while staying outside the dimmed region (wine's smart-filter presets
		// are the only case that needs the two split).
		attrs: { 'aria-busy': 'false' },
		children: [
			section(REAL_ESTATE_LOCATION_TREE.groupLabel, locationPicker.element),
			geoSection.element,
			section('School district', schoolDistrictList.element),
			section('Property type', propertyTypeChips.element),
			section('Status', statusChips.element),
			...sliders.elements,
			// The one CONJUNCTIVE facet, and the distinction matters here and nowhere else: every other
			// facet WIDENS when clicked, so the engine drops its rule while projecting. This one NARROWS,
			// so its rule stays active and each candidate is projected on top of what is already checked —
			// otherwise "solar" would look available while "garage" is checked, though no listing has both.
			section('Must-have features', featureChips.element),
			section(REAL_ESTATE_LISTED_DATE_LABEL, datePresets.element),
			section('Description search', descriptionSearch.element),
		],
		className: 'fe-filter-panel__scroller fe-filter-panel__body',
	});

	const element = el('div', {
		children: [panelHeader(), body],
		className: 'fe-filter-panel',
	});

	return {
		dispose: () => {
			geoSection.dispose();
			descriptionSearch.dispose();
		},

		element,

		invalidateMapSize: () => {
			geoSection.invalidateMapSize();
		},

		query,

		setBusy: (isBusy) => {
			// `--busy` dims the body and blocks pointer events while a write settles.
			body.classList.toggle('fe-filter-panel__body--busy', isBusy);
			body.setAttribute('aria-busy', String(isBusy));
		},

		update: (state) => {
			latest = state;
			const { bundle, rules } = state;

			locationPicker.update({
				counts: chipProjectedCounts(bundle, LOCATION_RULE_ID),
				disabled: chipDisabledSet(bundle, LOCATION_RULE_ID),
				selected: deriveLocationSelection(rules.get(LOCATION_RULE_ID), locationSpecs),
				tree: locationTree,
			});

			geoSection.update(deriveGeoRadius(rules.get(GEO_RADIUS_RULE_ID)));

			schoolDistrictList.update({
				exclusion: chipExclusionMap(bundle, 'school-district'),
				options: vocabularies.schoolDistricts,
				selected: selectedSet('school-district'),
			});
			propertyTypeChips.update({
				exclusion: chipExclusionMap(bundle, 'property-type'),
				options: vocabularies.propertyTypes,
				selected: selectedSet('property-type'),
			});
			statusChips.update({
				exclusion: chipExclusionMap(bundle, 'status'),
				options: vocabularies.statuses,
				selected: selectedSet('status'),
			});

			sliders.update(rules, bundle);

			featureChips.update({
				exclusion: chipExclusionMap(bundle, 'must-have-features'),
				options: vocabularies.features,
				selected: committedFeatures(),
			});

			// A `DateRangeRule` can arrive from a shared URL or a JSON config carrying a preset this panel
			// does not render (`all-time`, for one). `coerceDatePreset` returns `null` for those, so no
			// chip lights — the honest rendering of "the engine holds a preset with no control here".
			datePresets.update({
				presets: DATE_PRESET_OPTIONS,
				selected: coerceDatePreset(
					(rules.get('listed-date') as DateRangeRule | undefined)?.config.preset ?? null,
				),
			});

			descriptionSearch.adopt((rules.get('text-search') as TextSearchRule | undefined)?.config.query ?? '');
		},
	};
}
