/**
 * `<RealEstateFilterPanel />` — the facet panel for the real-estate demo.
 *
 * @remarks
 * A thin assembler, like the books panel: derive the chip/checkbox vocabularies + the numeric
 * baselines from the corpus once, then stack the sections. Real-estate is the "kitchen-sink"
 * dataset, so the stack is the widest of the three datasets — it exercises the location hierarchy
 * (`HierarchicalRule`), the geo-radius map (`GeoProximityRule` + R-tree), a high-cardinality
 * checklist + chip InSets (`InSetRule`), six range sliders (`RangeRule`), must-have features
 * (`ContainsAllRule`), the listed-date presets (`DateRangeRule`), and a text search (`TextSearchRule`)
 * — all through the same commit contract the other datasets use.
 *
 * @packageDocumentation
 */

import type { FilterBundleQuery } from '@filter-enginez/core';
import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { useFilterEngine } from '@filter-enginez/react-signals';
import { deriveBaselineBounds, type NumericBounds } from '@filter-enginez/react-ui';
import { useMemo } from 'react';

import { FilterBundleContext, useFetchFilterBundle } from '../filter-bundle/index.js';
import { useIsEngineBusy } from './engineBusy.js';
import { GeoRadiusSection } from './GeoRadiusSection.js';
import { ListedDateSection } from './ListedDateSection.js';
import { LocationSection } from './LocationSection.js';
import { buildRealEstateBundleQuery } from './real-estate-domain/bundle.js';
import { buildListingLocationTree, buildLocationNodeSpecs } from './real-estate-domain/extractors.js';
import {
	deriveRealEstateVocabularies,
	REAL_ESTATE_SLIDER_FIELD_IDS,
	type RealEstateSliderFieldId,
	SLIDER_CLAMPS,
	SLIDER_FIELD_GETTERS,
	SLIDER_STEPS,
} from './real-estate-domain/filterConfig.js';
import { formatListingPrice } from './real-estate-domain/formatters.js';
import { deriveMetroCenters } from './real-estate-domain/metroCenters.js';
import { CheckboxSection, ChipSection, FeatureSection, RangeSection, TextSection } from './RealEstateFilterSections.js';

/** Whole-dollar USD formatter for the price slider readout. */
/**
 * Props for `<RealEstateFilterPanel />`.
 */
export interface RealEstateFilterPanelProps {
	/**
	 * Whether to render the panel's own "Filters" title. `true` for the desktop sidebar; the mobile
	 * drawer passes `false` (it supplies its own titled header).
	 */
	readonly isHeaderVisible?: boolean;
}

/**
 * The real-estate filter panel — vocabulary/baseline derivation + section stack.
 */
export const RealEstateFilterPanel = (props: RealEstateFilterPanelProps = {}): React.ReactElement => {
	const { isHeaderVisible = true } = props;
	const engine = useFilterEngine<Listing>();
	const isBusy = useIsEngineBusy();
	const sourceData = engine.core.getSourceData();

	// Chip / checklist vocabularies — every distinct value in the corpus, sorted for stable ordering.
	const vocabularies = useMemo(() => deriveRealEstateVocabularies(sourceData), [sourceData]);

	// The state → metro → neighborhood tree, its predictive-disable candidates and the metro centroids,
	// all from the corpus the engine booted from — the same derivation every other vertical runs, and
	// the reason none of these modules has to load the dataset itself. One pass each per corpus, not
	// per render: `getSourceData()` returns the same array until the corpus is replaced.
	const locationTree = useMemo(() => buildListingLocationTree(sourceData), [sourceData]);
	const locationNodeSpecs = useMemo(() => buildLocationNodeSpecs(locationTree), [locationTree]);
	const metroCenters = useMemo(() => deriveMetroCenters(sourceData), [sourceData]);
	const { features, propertyTypes, schoolDistricts, statuses } = vocabularies;

	// Numeric baselines — the full-corpus track extents for each range slider. The clamps, the field
	// getters and the rounding step all come from `filterConfig` so every panel derives identical
	// tracks from the identical corpus; six inline `deriveBaselineBounds` calls here would be six
	// chances for the panels to disagree about where a slider ends.
	const baselines = useMemo<Record<RealEstateSliderFieldId, NumericBounds>>(() => {
		const entries = REAL_ESTATE_SLIDER_FIELD_IDS.map((fieldId) => [
			fieldId,
			deriveBaselineBounds(sourceData.map(SLIDER_FIELD_GETTERS[fieldId]), SLIDER_CLAMPS[fieldId], SLIDER_STEPS[fieldId]),
		] as const);

		return Object.fromEntries(entries) as Record<RealEstateSliderFieldId, NumericBounds>;
	}, [sourceData]);

	// One bundle per engine change → per-candidate `wouldBeEmpty` for the three string-scalar InSet
	// facets and every node of the location tree, plus filtered-except-self bounds for the six
	// sliders. Real estate is main-thread, so this resolves synchronously.
	//
	// The geo-radius rule is deliberately absent from this query and still governs it: the engine
	// evaluates every OTHER active rule when projecting a candidate, generically and with no
	// rule-type switch. That is what makes a 15-mile Denver radius disable "Austin ISD" — the case
	// that exposed this panel having no predictive disable at all.
	//
	// Must-have features uses the CONJUNCTIVE `containsAll` kind: clicking one narrows an existing
	// requirement rather than widening a set, so the engine keeps that rule active while projecting.
	//
	// Two controls still cannot participate and stay always-enabled: listed-date and the geo control
	// itself. See `../filter-bundle`.
	const bundleQuery = useMemo<FilterBundleQuery>(
		() => buildRealEstateBundleQuery(baselines, vocabularies, locationNodeSpecs),
		[baselines, locationNodeSpecs, vocabularies],
	);
	const bundle = useFetchFilterBundle<Listing>(bundleQuery);
	const bundleValue = useMemo(() => ({ bundle }), [bundle]);

	return (
		<div className="fe-filter-panel">
			{isHeaderVisible ? <PanelHeader /> : null}
			{/* Scroll container — owns overflow + the global dim-during-compute treatment. Dimmed +
			    pointer-events-none while the engine recomputes so a burst of clicks can't outrun it. */}
			{/* The gap and bottom padding are plain CSS in ui-styles, not Tailwind utilities, so they never
			    depend on Tailwind's JIT regenerating a class after an HMR edit inside a workspace package. */}
			<div
				className={`fe-filter-panel__scroller fe-filter-panel__body${isBusy ? ' fe-filter-panel__body--busy' : ''}`}
				aria-busy={isBusy}
			>
				<FilterBundleContext value={bundleValue}>
					<LocationSection locationTree={locationTree} />
					<GeoRadiusSection metroCenters={metroCenters} />
					<CheckboxSection ruleId="school-district" field="schoolDistrict" label="School district" options={schoolDistricts} />
					<ChipSection ruleId="property-type" field="propertyType" label="Property type" options={propertyTypes} formatLabel={replaceHyphens} />
					<ChipSection ruleId="status" field="status" label="Status" options={statuses} formatLabel={replaceHyphens} />
					<RangeSection ruleId="price" field="priceUsd" label="Price" ariaLabel="Price range" baseline={baselines.price} step={SLIDER_STEPS.price} format={(n) => formatListingPrice(n)} parse={(raw) => parseFloat(raw.replace(/[^0-9.]/g, ''))} />
					<RangeSection ruleId="square-feet" field="squareFeet" label="Square feet" ariaLabel="Square-footage range" baseline={baselines['square-feet']} step={SLIDER_STEPS['square-feet']} format={(n) => `${n.toLocaleString()} sqft`} parse={(raw) => parseFloat(raw.replace(/[^0-9.]/g, ''))} />
					<RangeSection ruleId="bedrooms" field="bedrooms" label="Bedrooms" ariaLabel="Bedroom range" baseline={baselines.bedrooms} step={SLIDER_STEPS.bedrooms} format={(n) => `${n.toFixed(0)} bd`} parse={(raw) => parseFloat(raw.replace(/[^0-9.]/g, ''))} />
					<RangeSection ruleId="bathrooms" field="bathrooms" label="Bathrooms" ariaLabel="Bathroom range" baseline={baselines.bathrooms} step={SLIDER_STEPS.bathrooms} format={(n) => `${n.toFixed(0)} ba`} parse={(raw) => parseFloat(raw.replace(/[^0-9.]/g, ''))} />
					<RangeSection ruleId="year-built" field="yearBuilt" label="Year built" ariaLabel="Year-built range" baseline={baselines['year-built']} step={SLIDER_STEPS['year-built']} format={(n) => n.toFixed(0)} parse={(raw) => parseFloat(raw)} />
					<RangeSection ruleId="lot-size" field="lotSizeAcres" label="Lot size" ariaLabel="Lot-size range" baseline={baselines['lot-size']} step={SLIDER_STEPS['lot-size']} format={(n) => `${n.toFixed(2)} ac`} parse={(raw) => parseFloat(raw.replace(/[^0-9.]/g, ''))} />
					<FeatureSection ruleId="must-have-features" label="Must-have features" options={features} formatLabel={replaceHyphens} />
					<ListedDateSection />
					<TextSection ruleId="text-search" field="description" label="Description search" placeholder="waterfront, remodeled, cul-de-sac..." ariaLabel="Search listing descriptions" />
				</FilterBundleContext>
			</div>
		</div>
	);
};

/**
 * Panel title — fixed at the aside's top (outside the scroller). Suppressed in the mobile drawer,
 * which supplies its own titled header.
 *
 * @internal
 */
const PanelHeader = (): React.ReactElement => {
	return (
		<div className="fe-filter-panel__header">
			<h2 className="fe-filter-panel__title">Filters</h2>
		</div>
	);
};

/**
 * Chip-label formatter — renders a kebab-cased vocabulary value as spaced words
 * (`single-family` → `single family`).
 *
 * @internal
 */
function replaceHyphens(value: string): string {
	return value.replace(/-/g, ' ');
}
