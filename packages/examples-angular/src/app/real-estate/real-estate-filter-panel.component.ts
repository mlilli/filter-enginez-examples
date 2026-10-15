/**
 * `<fe-real-estate-filter-panel>` — the fourteen-section real-estate panel, the widest in the repo.
 *
 * @remarks
 * At parity with the React, Svelte and Vue panels' facet set: the location hierarchy
 * (`InSetofSetsRule` over `locationId`), the geo-radius map (`GeoProximityRule` + R-tree), a high-cardinality
 * school-district checklist, three chip `InSet`s, six range sliders, the must-have features
 * (`ContainsAllRule`, this dataset's custom serializable rule), the listed-date presets
 * (`DateRangeRule`) and a description search (`TextSearchRule`).
 *
 * ### Nothing here re-implements domain logic
 *
 * Vocabularies, slider clamps and steps, the location tree, the metro centroids, the date presets,
 * the bundle query, the unit conversions and the display formatters all come from
 * `@filter-enginez/examples-shared/real-estate-domain` — the same framework-neutral module React,
 * Svelte, Vue and the server demo use. What is Angular-specific is the rendering and the signal
 * wiring, and that is the point of the whole exercise.
 *
 * The facets themselves arrive through DI (`injectRealEstateFacets`) rather than as five inputs,
 * because they are derived ONCE in the route resolver from the booted corpus. See
 * `real-estate-facets.ts` for why the derivation belongs at the route.
 *
 * ### Four patterns worth naming, and one deviation from the Vue original
 *
 * **Selection is DERIVED, never mirrored.** Every control reads its current value back out of
 * `activeRules$`. So "Clear all", removing a chip in the results header, and a `?f` URL restore all
 * flow into the controls for free — there is no second copy of the truth to keep in sync. This is the
 * one real structural departure from Vue and Svelte, which hold fourteen pieces of local state and
 * maintain a `registerReset` handshake so the results header can reach them. Angular needs neither:
 * no reset table, no registration, and no way for the two lists to drift. The exception is the
 * description input, which needs a local mirror for uncommitted keystrokes; it re-seeds from engine
 * state via an effect, exactly as the books panel's three text fields do.
 *
 * **Clearing a facet REMOVES its rule.** It never writes an empty one. An `InSetRule` with an empty
 * set still participates in the AND and matches nothing, so "deselect everything" would filter the
 * results to zero rather than clear the facet — the single most likely thing to get wrong here, and
 * invisible in code review because the call looks perfectly reasonable. Every selection facet routes
 * through {@link RealEstateFilterPanelComponent._commitSelection}, which is the one place that
 * decision is made. The trap has a second form specific to this dataset: `ContainsAllRule` with an
 * empty `required` array IS neutral (everything contains all of nothing), so must-have features could
 * get away with writing one. It clears instead, so all fourteen behave identically.
 *
 * **`markUserAction()` before the engine write.** That ordering is what lets the "computing"
 * indicator light on the same frame the user clicks. Real estate boots on the main thread so the gap
 * is usually imperceptible, but the contract is the worker tier's, so the same call is correct on
 * whichever tier hosts the engine.
 *
 * **The bundle is anchored on `lastChangeEvent`.** `applyFiltersAndQuery` is a plain call over engine
 * state, not a stream, so it needs something to tell it when to re-run. The change EVENT, not a
 * timestamp: an event is freshly allocated per emission so its identity always differs, whereas a
 * timestamp is a millisecond-resolution value that two commits can share, and the second would leave
 * the panel dimming chips against a filter state it never re-projected.
 *
 * The fetch itself goes through the shared `createBundleFetcher` rather than a local
 * `try` / `catch` — the same loop React, Svelte and Vue drive on this dataset. It carries the guard
 * (a partially-shaped corpus must degrade to "no exclusion data", never blank the panel) and the
 * stale-response guard, so a slow query can never overwrite a newer one.
 *
 * ### The geo section renders inside a `@defer` block
 *
 * `<fe-geo-radius-section>` reaches Leaflet, so it sits in a `@defer (on immediate)` block and the
 * other thirteen sections paint without waiting on it. `on immediate` defers RENDERING, not
 * downloading; the actual code-split is one level further down, and
 * `leaflet-radius-map.component.ts` documents it.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	input,
	signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectEngineBusy, injectFilterEngine } from '@filter-enginez/angular-rxjs';
import {
	dateRange,
	type DateRangeRule,
	type FilterBundle,
	type FilterRule,
	inSet,
	type InSetRule,
	range,
	type RuleId,
	text,
	type TextSearchRule,
} from '@filter-enginez/core';
import {
	buildListingLocationRule,
	buildRealEstateBundleQuery,
	chipDisabledSet,
	chipExclusionMap,
	chipProjectedCounts,
	coerceDatePreset,
	ContainsAllRule,
	createBundleFetcher,
	DATE_PRESET_OPTIONS,
	type DatePresetValue,
	deriveLocationSelection,
	type ExclusionMap,
	humanizeVocabularyValue,
	LOCATION_RULE_ID,
	RANGE_FACETS,
	type RangeFacetSpec,
	type RealEstateSliderFieldId,
} from '@filter-enginez/examples-shared/real-estate-domain';
import { toggleSetValue } from '@filter-enginez/examples-shared/selection';

import { CheckboxListComponent } from '../controls/checkbox-list.component.js';
import { ChipToggleGroupComponent } from '../controls/chip-toggle-group.component.js';
import { DatePresetGroupComponent } from '../controls/date-preset-group.component.js';
import { HierarchicalPickerComponent } from '../controls/hierarchical-picker.component.js';
import { PanelHeaderComponent } from '../controls/panel-header.component.js';
import { type RangeSliderChange, RangeSliderComponent } from '../controls/range-slider.component.js';
import { SearchInputComponent } from '../controls/search-input.component.js';
import { SectionHeaderComponent } from '../controls/section-header.component.js';
import { GeoRadiusSectionComponent } from './geo-radius-section.component.js';
import { deriveRangeFacetStates, type RangeFacetState } from './range-facets.js';
import { injectRealEstateFacets } from './real-estate-facets.js';

/** Height cap on the location tree's scroll viewport. Fourteen sections; none may own the panel. */
const LOCATION_TREE_MAX_HEIGHT = '14rem';

/** Height cap on the school-district checklist — roughly a hundred values in the default tier. */
const SCHOOL_DISTRICT_LIST_MAX_HEIGHT = '220px';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CheckboxListComponent,
		ChipToggleGroupComponent,
		DatePresetGroupComponent,
		GeoRadiusSectionComponent,
		HierarchicalPickerComponent,
		PanelHeaderComponent,
		RangeSliderComponent,
		SearchInputComponent,
		SectionHeaderComponent,
	],
	selector: 'fe-real-estate-filter-panel',
	// The ONLY CSS this component authors, and it exists because Angular inserts an element the other
	// verticals do not have.
	//
	// `.fe-sidebar-app__filters` caps its height, and `.fe-filter-panel` claims `flex: 1 1 0%` plus
	// `min-height: 0` to become the bounded scroll container. In React, Vue, Svelte and vanilla the
	// panel is a direct child of that aside, so it works. Here `<fe-real-estate-filter-panel>` sits
	// between them, and an unknown element defaults to `display: inline` — not a flex container, so the
	// panel inside it never receives a bounded height and fourteen sections simply overflow instead of
	// scrolling. The bottom half of the panel is then unreachable.
	//
	// Making the host transparent to the layout restores the chain. This is a host-geometry fix, not
	// styling: everything visual still comes from ui-styles.
	styles: [':host { display: flex; flex: 1 1 0%; flex-direction: column; min-height: 0; }'],
	templateUrl: './real-estate-filter-panel.component.html',
})
export class RealEstateFilterPanelComponent {
	/**
	 * Whether the panel is currently on screen.
	 *
	 * @remarks
	 * Read by nothing here; threaded to the geo section, whose Leaflet map must re-measure when the
	 * mobile drawer reveals it. The page hides the panel with `hidden` rather than destroying it, so a
	 * map created while it is closed measures a zero-height container and, without a re-measure, never
	 * recovers.
	 */
	public readonly isPanelVisible = input.required<boolean>();

	private readonly _busy = injectEngineBusy();
	private readonly _engine = injectFilterEngine<Listing>();
	private readonly _facets = injectRealEstateFacets();

	/** Every rule currently on the engine — the single source every control derives its value from. */
	private readonly _activeRules = toSignal(this._engine.activeRules$, { requireSync: true });

	/** Anchor for the bundle fetch — read, never displayed. See the class remarks. */
	private readonly _lastChangeEvent = toSignal(this._engine.lastChangeEvent$, {
		initialValue: null,
	});

	/**
	 * The projection query. A plain field, not a computed: it depends only on the corpus vocabularies,
	 * the location hierarchy and the slider baselines, none of which change after boot.
	 */
	private readonly _query = buildRealEstateBundleQuery(
		this._facets.baselines,
		this._facets.vocabularies,
		this._facets.locationSpecs,
	);

	/** The engine's predictive-disable projection, or `null` until the first one lands. */
	protected readonly bundle = signal<FilterBundle | null>(null);

	/** The shared fetch loop — the guard, the stale guard, and the transport switch, in one place. */
	private readonly _bundleFetcher = createBundleFetcher(this._engine, {
		onBundle: (next) => {
			this.bundle.set(next);
		},
		onError: (error) => {
			// Keep the previous bundle. Predictive disable is an ENHANCEMENT: slightly stale hints beat
			// a panel where every control blanks because one query threw.
			console.error('[real-estate] bundle fetch failed:', error);
		},
	});

	/** Whether the engine is mid-recompute — dims the panel and blocks pointer events. */
	protected readonly isEngineBusy = toSignal(this._busy.isBusy$, { requireSync: true });

	// ─── Static template data (fixed at boot) ─────────────────────────────────────────────────────
	/** The listed-date presets, in the `{ label, value }` shape the preset control consumes. */
	protected readonly datePresets = DATE_PRESET_OPTIONS;

	/** Shared kebab-to-words display convention. Bound, so the panel cannot grow a local variant. */
	protected readonly humanizeLabel = humanizeVocabularyValue;

	/**
	 * The state → metro → neighborhood hierarchy, built once at the route from the booted corpus.
	 *
	 * @remarks
	 * From the booted corpus rather than the bundled one, so a streamed tier's extra neighborhoods
	 * reach the picker and the dataset module stays out of this bundle.
	 */
	protected readonly locationTree = this._facets.locationTree;

	/** Exposed for the template, which cannot read a module constant. */
	protected readonly locationTreeMaxHeight = LOCATION_TREE_MAX_HEIGHT;

	/** The six sliders' static configuration, in render order. */
	protected readonly rangeFacets = RANGE_FACETS;

	/** @see locationTreeMaxHeight */
	protected readonly schoolDistrictListMaxHeight = SCHOOL_DISTRICT_LIST_MAX_HEIGHT;

	/** Sorted distinct values per chip / checkbox facet, derived once at the route. */
	protected readonly vocabularies = this._facets.vocabularies;

	// ─── Chip exclusions (lifted out of the template so they compute once per commit) ─────────────
	/** Must-have features. The one CONJUNCTIVE facet — see the template comment on that section. */
	protected readonly featureExclusion = computed<ExclusionMap>(() =>
		chipExclusionMap(this.bundle(), 'must-have-features'),
	);

	/** Location node id → projected RECORD count, for the picker's row badges. */
	protected readonly locationCounts = computed<ReadonlyMap<string, number>>(() =>
		chipProjectedCounts(this.bundle(), LOCATION_RULE_ID),
	);

	/** Location node ids whose selection would empty the result set. */
	protected readonly locationDisabled = computed<ReadonlySet<string>>(() =>
		chipDisabledSet(this.bundle(), LOCATION_RULE_ID),
	);

	/** @see featureExclusion */
	protected readonly propertyTypeExclusion = computed<ExclusionMap>(() =>
		chipExclusionMap(this.bundle(), 'property-type'),
	);

	/** @see featureExclusion */
	protected readonly schoolDistrictExclusion = computed<ExclusionMap>(() =>
		chipExclusionMap(this.bundle(), 'school-district'),
	);

	/** @see featureExclusion */
	protected readonly statusExclusion = computed<ExclusionMap>(() =>
		chipExclusionMap(this.bundle(), 'status'),
	);

	// ─── Selections, derived from engine state ────────────────────────────────────────────────────
	/** The listed-date chip, narrowed to a preset this panel actually renders. */
	protected readonly selectedDatePreset = computed<DatePresetValue | null>(() =>
		coerceDatePreset(
			(this._activeRules().get('listed-date') as DateRangeRule | undefined)?.config.preset ?? null,
		),
	);

	/** The required feature set. Note `config.required`, not `config.set` — this is not an InSet. */
	protected readonly selectedFeatures = computed<readonly string[]>(
		() =>
			(this._activeRules().get('must-have-features') as ContainsAllRule | undefined)?.config
				.required ?? [],
	);

	/**
	 * The picker's compact selection: the highest selected node per branch, never the closure, read
	 * back out of the committed sets.
	 */
	protected readonly selectedLocations = computed<readonly string[]>(() =>
		deriveLocationSelection(this._activeRules().get(LOCATION_RULE_ID), this._facets.locationSpecs),
	);

	/** @see selectedFeatures */
	protected readonly selectedPropertyTypes = computed<readonly string[]>(
		() =>
			(this._activeRules().get('property-type') as InSetRule<string> | undefined)?.config.set ?? [],
	);

	/** @see selectedFeatures */
	protected readonly selectedSchoolDistricts = computed<readonly string[]>(
		() =>
			(this._activeRules().get('school-district') as InSetRule<string> | undefined)?.config.set ??
			[],
	);

	/** @see selectedFeatures */
	protected readonly selectedStatuses = computed<readonly string[]>(
		() => (this._activeRules().get('status') as InSetRule<string> | undefined)?.config.set ?? [],
	);

	/** Every slider's live inputs, keyed by rule id. See {@link deriveRangeFacetStates}. */
	protected readonly rangeFacetStates = computed<Record<RealEstateSliderFieldId, RangeFacetState>>(
		() => deriveRangeFacetStates(this.bundle(), this._facets.baselines, this._activeRules()),
	);

	// ─── The one local mirror: uncommitted keystrokes in the description field ────────────────────
	/** What the description input displays. Re-seeded from the committed rule by an effect. */
	protected readonly descriptionText = signal('');

	/**
	 * This facet's OWN rule stream, as a signal.
	 *
	 * @remarks
	 * The one control here that reads a narrow stream rather than the whole `activeRules` map. Every
	 * other selection is fully derived, so recomputing on any engine change is free and correct; this
	 * one holds uncommitted keystrokes, and a map-wide dependency would discard them. Clicking another
	 * control blurs the input first, which commits, but undo/redo by keyboard and the devtools panel's
	 * time travel both change rules without moving focus.
	 */
	private readonly _descriptionRule = toSignal(this._engine.rule$('text-search'), { requireSync: true });

	/** The query the engine currently holds, or `''` when the facet is off. */
	private readonly _committedDescription = computed<string>(
		() => (this._descriptionRule() as TextSearchRule | undefined)?.config.query ?? '',
	);

	public constructor() {
		// Seed the projection synchronously, so the very first paint already dims what cannot be
		// selected rather than showing every chip enabled for a frame. The effect below re-issues the
		// same query on its first run; on a main-thread tier that is one extra call, and the engine's
		// memoized-simulation cache answers it without redoing the work.
		this._bundleFetcher.request(this._query);

		// Re-project on every engine change. Reading `_lastChangeEvent` is what registers the
		// dependency; the value itself is unused, so the read looks pointless and is load-bearing.
		effect(() => {
			this._lastChangeEvent();
			this._bundleFetcher.request(this._query);
		});

		// Re-seed the description mirror whenever the COMMITTED value changes. This is what makes
		// "Clear all", a removed chip and a `?f` restore all reach into the text input.
		effect(() => {
			this.descriptionText.set(this._committedDescription());
		});

		inject(DestroyRef).onDestroy(() => {
			this._bundleFetcher.dispose();
		});
	}

	/**
	 * Commit a listed-date preset, or clear the facet.
	 *
	 * @remarks
	 * The one facet with no predictive disable, deliberately: a `DateRangeRule` preset resolves against
	 * `Date.now()` at EVALUATION time, so a count computed at bundle-fetch time would describe a
	 * slightly different window than the rule will actually apply.
	 *
	 * @param value - The chosen preset, or `null` for "any time".
	 */
	protected commitDatePreset(value: DatePresetValue | null): void {
		this._busy.markUserAction();

		if (value === null) {
			this._engine.core.removeRule('listed-date');

			return;
		}
		this._engine.core.addRule('listed-date', dateRange('listedDate', { preset: value }));
	}

	/**
	 * Commit the description search, or clear it when the query empties.
	 *
	 * @remarks
	 * Committed on blur / Enter rather than per keystroke, so a substring scan of the corpus runs once
	 * per query. Whitespace-only counts as empty — a rule matching `''` would be a silent no-op that
	 * still shows up as an active-filter chip.
	 *
	 * @param value - The committed text.
	 */
	protected commitDescription(value: string): void {
		const trimmed = value.trim();

		this._busy.markUserAction();

		if (trimmed === '') {
			this._engine.core.removeRule('text-search');

			return;
		}
		this._engine.core.addRule(
			'text-search',
			text('description', { caseSensitive: false, mode: 'substring', query: trimmed }),
		);
	}

	/**
	 * Commit the location hierarchy's selection.
	 *
	 * @remarks
	 * The picker hands back the WHOLE next selection rather than one toggled value: a single click can
	 * select a subtree, or de-cascade an ancestor into its siblings, so "which id changed" is not
	 * expressible.
	 *
	 * The rule is the shared `buildListingLocationRule`, the one every app commits: an
	 * `InSetofSetsRule` over the listing's `locationId` field, which survives a `?f=` link, built from
	 * the same specs the bundle projects.
	 *
	 * @param next - The picker's whole next selection.
	 */
	protected commitLocation(next: readonly string[]): void {
		this._commitSelection(LOCATION_RULE_ID, next, (values) =>
			buildListingLocationRule(values, this._facets.locationSpecs),
		);
	}

	/**
	 * Commit one slider's range.
	 *
	 * @param facet - The slider's static spec, which carries the rule id and the `Listing` field.
	 * @param next - The slider's new bounds.
	 */
	protected commitRange(facet: RangeFacetSpec, next: RangeSliderChange): void {
		this._busy.markUserAction();
		this._engine.core.addRule(facet.ruleId, range(facet.field, { max: next.max, min: next.min }));
	}

	/**
	 * Commit the must-have-features chips.
	 *
	 * @param value - The chip toggled.
	 */
	protected toggleFeature(value: string): void {
		this._commitSelection(
			'must-have-features',
			toggleSetValue(this.selectedFeatures(), value),
			(values) => new ContainsAllRule('features', { required: [...values]}),
		);
	}

	/**
	 * Commit the property-type chips.
	 *
	 * @param value - The chip toggled.
	 */
	protected togglePropertyType(value: string): void {
		this._commitSelection(
			'property-type',
			toggleSetValue(this.selectedPropertyTypes(), value),
			(values) => inSet<string>('propertyType', values),
		);
	}

	/**
	 * Commit the school-district checklist.
	 *
	 * @param value - The row toggled.
	 */
	protected toggleSchoolDistrict(value: string): void {
		this._commitSelection(
			'school-district',
			toggleSetValue(this.selectedSchoolDistricts(), value),
			(values) => inSet<string>('schoolDistrict', values),
		);
	}

	/**
	 * Commit the status chips.
	 *
	 * @param value - The chip toggled.
	 */
	protected toggleStatus(value: string): void {
		this._commitSelection('status', toggleSetValue(this.selectedStatuses(), value), (values) =>
			inSet<string>('status', values),
		);
	}

	/**
	 * Apply a rule when the selection is non-empty, otherwise REMOVE it.
	 *
	 * @remarks
	 * The single most load-bearing method in the file, and the reason every selection facet routes
	 * through it. Writing an `InSetRule` with an empty set would leave the facet participating in the
	 * AND and matching nothing, so "deselect everything" would filter to zero results instead of
	 * clearing the filter — a bug that looks correct at every call site.
	 *
	 * `build` is only invoked for a non-empty selection, so it never has to defend against the empty
	 * case, and `markUserAction()` runs before either branch touches the engine.
	 *
	 * @param ruleId - The facet's stable rule id.
	 * @param values - The whole next selection.
	 * @param build - Builds the rule from a NON-EMPTY selection.
	 */
	private _commitSelection(
		ruleId: RuleId,
		values: readonly string[],
		build: (values: readonly string[]) => FilterRule,
	): void {
		this._busy.markUserAction();

		if (values.length === 0) {
			this._engine.core.removeRule(ruleId);

			return;
		}
		this._engine.core.addRule(ruleId, build(values));
	}
}
