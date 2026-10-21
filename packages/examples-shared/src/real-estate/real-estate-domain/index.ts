/**
 * `@filter-enginez/examples-shared/real-estate-domain` — the framework-neutral real-estate logic.
 *
 * @remarks
 * Mirror of `./books-domain` and `./wine-domain`: everything the real-estate feature knows that is NOT
 * presentation. Nothing here imports React, a reactive adapter, or a browser global, so all six
 * verticals consume it verbatim — the React apps included.
 *
 * What lives here:
 *
 *   - **{@link ContainsAllRule}** — the custom serializable "array ⊇ required set" rule powering
 *     must-have features, registered with `ruleRegistry` so it survives JSON config, URL state, the
 *     worker bridge, and devtools snapshots.
 *   - **The location hierarchy** — the picker tree built from the corpus, and the translation from its
 *     node ids to the listing's `locationId` field.
 *   - **{@link buildListingLocationRule}** — the location rule all six apps commit, and how a `?f=`
 *     link's location reads ({@link withNormalizedLocationRule}).
 *   - **{@link buildListingGeoRadiusRule}** — the distance rule all six apps commit, and how a `?f=`
 *     link's distance rule reads ({@link withNormalizedGeoRadiusRule}).
 *   - **{@link deriveMetroCenters}** — corpus-derived centroids for the geo section's metro dropdown.
 *   - **{@link buildRuleSummaries}** — the active-filter-chip summarizer.
 *   - **{@link PickerTreeNode}** — the neutral hierarchical-picker node shape.
 *   - **Unit conversion** — miles in the UI, kilometers in the engine and on the map.
 *
 * The engine boot lives next door in `./real-estate-core`, and the imperative Leaflet controller in
 * `./real-estate-map`; both are separate subpaths so a consumer that wants only pure logic doesn't
 * pull in an engine boot or a mapping library.
 *
 * @packageDocumentation
 */

export { REAL_ESTATE_BOOT_IDLE_CAPTION, REAL_ESTATE_RECORD_NOUN } from './bootCopy.js';
export { buildRealEstateBundleQuery, type RealEstateBundleQuery } from './bundle.js';
export { formatListingPrice, humanizeVocabularyValue } from './formatters.js';
export {
	parseNumeric,
	RANGE_FACETS,
	type RangeFacetSpec,
} from './rangeFacets.js';
export { ContainsAllRule, type ContainsAllRuleConfig } from './ContainsAllRule.js';
export {
	buildListingLocationTree,
	buildLocationNodeSpecs,
	type LocationNodeSpec,
	toLocationFieldId,
} from './extractors.js';
export {
	GEO_RADIUS_FIELD,
	GEO_RADIUS_RULE_ID,
	normalizeGeoRadiusRule,
	withNormalizedGeoRadiusRule,
} from './geoRadiusLinks.js';
export {
	buildListingGeoRadiusRule,
	deriveGeoRadius,
	type GeoRadius,
	writeGeoRadius,
} from './geoRadiusRule.js';
export {
	LOCATION_FIELD,
	LOCATION_RULE_ID,
	normalizeLocationRule,
	withNormalizedLocationRule,
} from './locationLinks.js';
export {
	buildListingLocationRule,
	deriveLocationSelection,
	writeLocationSelection,
} from './locationRule.js';
export {
	coerceDatePreset,
	DATE_PRESET_OPTIONS,
	DATE_PRESET_SUMMARY_LABELS,
	DATE_PRESETS,
	type DatePresetValue,
	deriveRealEstateVocabularies,
	REAL_ESTATE_SLIDER_FIELD_IDS,
	type RealEstateChipVocabularies,
	type RealEstateSliderFieldId,
	SLIDER_CLAMPS,
	SLIDER_FIELD_GETTERS,
	SLIDER_FIELD_KEYS,
	SLIDER_STEPS,
	uniqueSorted,
} from './filterConfig.js';
export {
	deriveMetroCenters,
	describeMapCoords,
	findMetroLabel,
	type MapCoords,
	type MetroCenterOption,
} from './metroCenters.js';
export type { PickerTreeNode } from './pickerTree.js';
// What every app's panel says where the apps used to word it themselves.
export {
	REAL_ESTATE_DESCRIPTION_SEARCH,
	REAL_ESTATE_LISTED_DATE_LABEL,
	REAL_ESTATE_LOCATION_TREE,
	REAL_ESTATE_SCHOOL_DISTRICT_LIST_MAX_HEIGHT,
} from './panelCopy.js';
export {
	buildRuleSummaries,
	type FilterSummary,
	type RuleSummaryOptions,
	summarizeRule,
} from './ruleSummaries.js';
export { kmToMiles, milesToKm } from './units.js';

// The map's PURE geometry, re-exported here rather than reached through `./real-estate-map`. That
// subpath's barrel imports `leaflet`, which touches `window` at module scope — so a consumer that
// wants only `METERS_PER_KM` to convert a radius would drag a mapping library into its server bundle
// to get at a constant. The module itself imports nothing.
export {
	boundingSquareSideMeters,
	METERS_PER_KM,
	type RadiusMapBounds,
	type RadiusMapCoords,
	shouldRecenter,
} from '../map/radiusMapGeometry.js';

// Re-exported so a consumer needs ONLY this subpath, exactly as `wine-domain` does. `react-ui/bounds`
// is import-free and safe to reach, but making every vertical add `@filter-enginez/react-ui` to its
// package.json to get at a bounds helper would be a dependency edge that exists purely as an artifact
// of where the code happens to live.
export {
	clampToBounds,
	deriveBaselineBounds,
	type HistogramBucket,
	type NumericBounds,
} from '@filter-enginez/react-ui/bounds';
export {
	type BundleFetcher,
	type BundleFetchHandlers,
	type BundleQueryable,
	createBundleFetcher,
} from '../../filter-bundle/bundleFetcher.js';
export {
	bundleHistogramToBuckets,
	chipDisabledSet,
	type ChipExclusion,
	chipExclusionMap,
	chipProjectedCounts,
	type ExclusionMap,
	fieldBounds,
	fieldHistogram,
	isToggleDisabled,
	toggleWouldBeEmpty,
} from '../../filter-bundle/bundleReaders.js';
