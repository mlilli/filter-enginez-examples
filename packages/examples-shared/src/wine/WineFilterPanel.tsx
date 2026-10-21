/**
 * `<WineFilterPanel />` — the left-side facet panel for the wine demo.
 *
 * @remarks
 * **A thin assembler.** The single-round-trip bundle plumbing lives in `filters/filterBundle.tsx`, the slider/baseline config
 * + selection helpers in `filters/filterConfig.ts`, and each filter section is its own container in
 * `filters/` — with the range / chip / fuzzy-search sections each served by one
 * parameterized `<RangeFilterSection />`, `<ChipFilterSection />`, and `<FuzzySearchFilterSection />`.
 *
 * The panel's own job is just: derive the four slider baselines + the chip vocabularies + the
 * origin node specs, fire the one bundle fetch, and distribute the result via `FilterBundleContext`
 * to the section stack.
 *
 * **Expression mode replaces the flat rules entirely**, as in every other vertical's panel. Applying a
 * smart-filter preset clears every facet rule (each section adopts its own rule's removal), and a
 * facet edit drops the active preset first. The panel holds the lit presets for both halves and
 * provides them through `SmartFilterSelectionContext`.
 *
 * Filters wired: Origin (InSetofSetsRule, the same rule every app commits), Price/Points/ABV (RangeRule), Vintage (InSetRule-of-
 * years), Color/Varietal/Body/Sweetness (InSetRule chips), Single color (ValueRule, exact single-select),
 * Score comparison (NumericComparisonRule, one-sided operator), Tasting-notes + Winery
 * (FuzzySearchRule), plus a Smart-filters preset row demonstrating `CompositeRule` / expression
 * mode via `setExpression` (single-select or "match any (OR)" multi-select).
 *
 * **One facet derivation, shared with every app.** The chip vocabularies and the origin tree come
 * from `deriveWineFacets` over the corpus the engine holds, the function the other four wine
 * verticals call. Each chip group offers `orderedPresentOptions(<design order>, <corpus values>)`
 * with the raw values as labels, and the bundle asks predictive disable about exactly those values.
 *
 * Headline UX moment: the exclusion-aware chip/tree disabling
 * — selections that would empty the result set are subdued + non-interactive, with projected counts
 * on unselected candidates (the engine's "predictive disable").
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { useFilterEngine } from '@filter-enginez/react-signals';
import { type NumericBounds } from '@filter-enginez/react-ui';
import { useMemo } from 'react';

import { ChipFilterSection } from './filters/ChipFilterSection.js';
import { ColorValueFilterSection } from './filters/ColorValueFilterSection.js';
import { type BundleContextValue, FilterBundleContext, useFetchFilterBundle } from './filters/filterBundle.js';
import {
	BODY_ORDER,
	COLOR_ORDER,
	type SliderFieldId,
	SWEETNESS_ORDER,
	useBaselineBounds,
} from './filters/filterConfig.js';
import { FilterSectionGuard } from './filters/FilterSectionGuard.js';
import { FuzzySearchFilterSection } from './filters/FuzzySearchFilterSection.js';
import { OriginFilterSection } from './filters/OriginFilterSection.js';
import { PanelHeader } from './filters/PanelHeader.js';
import { PointsCompareFilterSection } from './filters/PointsCompareFilterSection.js';
import { RangeFilterSection } from './filters/RangeFilterSection.js';
import { SmartFilterPresets } from './filters/SmartFilterPresets.js';
import { SmartFilterSelectionContext, useSmartFilterSelectionState } from './filters/smartFilterSelection.js';
import { VintageFilterSection } from './filters/VintageFilterSection.js';
import { deriveWineFacets } from './wine-domain/facets.js';
import { visibleVarietalChips } from './wine-domain/filterConfig.js';
import { orderedPresentOptions } from './wine-domain/panelCopy.js';

/**
 * Props for `<WineFilterPanel />`.
 */
export interface WineFilterPanelProps {
	/**
	 * Whether to render the panel's own `<PanelHeader />` ("Filters" title). Defaults to `true`, which
	 * every app's sidebar uses on every viewport; a host that supplies its own titled header passes
	 * `false`, so the panel title is not a redundant second header.
	 */
	readonly isHeaderVisible?: boolean;
}

/**
 * The wine filter panel — provider + section assembler.
 */
export const WineFilterPanel = (props: WineFilterPanelProps = {}): React.ReactElement => {
	const { isHeaderVisible = true } = props;
	const engine = useFilterEngine<Wine>();

	// Baselines computed once per source-data swap (typically just once at boot). Pulled at the
	// panel root so we can pass them into the bundle query AND down to each slider for the dim-zone
	// clamp semantics.
	const priceBaseline = useBaselineBounds('price');
	const pointsBaseline = useBaselineBounds('points');
	const abvBaseline = useBaselineBounds('abv');
	const vintageBaseline = useBaselineBounds('vintage');
	const baselines = useMemo<Record<SliderFieldId, NumericBounds>>(
		() => ({ abv: abvBaseline, points: pointsBaseline, price: priceBaseline, vintage: vintageBaseline }),
		[priceBaseline, pointsBaseline, abvBaseline, vintageBaseline],
	);

	// Every facet that is not a rule — the chip vocabularies, the origin tree and its flattened specs —
	// from the shared derivation, over the corpus the ENGINE holds (`sourceData`), so the panel offers
	// what the loaded tier actually contains. Varietal is ranked most-reviewed first; the origin tree
	// is ordered by wine count.
	const sourceData = engine.core.getSourceData();
	const facets = useMemo(() => deriveWineFacets(sourceData), [sourceData]);
	const { originSpecs, originTree, vocabularies } = facets;
	// The chip groups' options: the design order, keeping only values the corpus carries.
	const colorOptions = useMemo(() => orderedPresentOptions(COLOR_ORDER, vocabularies.color), [vocabularies.color]);
	const bodyOptions = useMemo(() => orderedPresentOptions(BODY_ORDER, vocabularies.body), [vocabularies.body]);
	const sweetnessOptions = useMemo(() => orderedPresentOptions(SWEETNESS_ORDER, vocabularies.sweetness), [vocabularies.sweetness]);
	// Predictive disable asks about exactly the values the chips offer.
	const chipVocabularies = useMemo(
		() => ({ body: bodyOptions, color: colorOptions, sweetness: sweetnessOptions, varietal: vocabularies.varietal }),
		[bodyOptions, colorOptions, sweetnessOptions, vocabularies.varietal],
	);

	const bundle = useFetchFilterBundle(baselines, chipVocabularies, originSpecs);
	const bundleCtx = useMemo<BundleContextValue>(() => ({ baselines, bundle }), [bundle, baselines]);
	// The lit smart-filter presets, held here rather than in the preset row because every facet section
	// reads it too: each one drops the active preset before it commits. See `smartFilterSelection.ts`.
	const smartFilterSelection = useSmartFilterSelectionState();

	return (
		<FilterBundleContext value={bundleCtx}>
			<SmartFilterSelectionContext value={smartFilterSelection}>
				{/* Two-zone structure: PanelHeader stays fixed at the aside's top (outside the scroller);
				    FilterSectionGuard owns the overflow + the global dim-during-compute treatment. A host
				    with its own titled header suppresses PanelHeader through `isHeaderVisible`. */}
				{isHeaderVisible ? <PanelHeader /> : null}
				{/*
				    Section order is MOST-USED-FIRST, and is byte-matched by the Svelte panel. Price and points
				    are what a wine shopper reaches for before anything else; body and sweetness are refinements
				    people apply once they already have a shortlist; the two free-text searches sit last, where
				    they read as "narrow this further" rather than as a starting point.

				    The two rule-type demos sit BESIDE their relatives rather than grouped together: score
				    comparison under Points, single-color under Color. Each is there to contrast a rule type with
				    the one above it (NumericComparisonRule vs RangeRule, ValueRule vs InSetRule), and that
				    contrast only reads if they are adjacent.
				*/}
				<FilterSectionGuard topSlot={<SmartFilterPresets />}>
					<RangeFilterSection ruleId="price" step={1} />
					<RangeFilterSection ruleId="points" step={1} />
					<PointsCompareFilterSection />
					<ChipFilterSection ruleId="color" label="Color" options={colorOptions} showCount />
					<ColorValueFilterSection presentColors={vocabularies.color} />
					<ChipFilterSection
						ruleId="varietal"
						label={`Varietal (${vocabularies.varietal.length})`}
						options={vocabularies.varietal}
						visibleOptions={visibleVarietalChips}
						scrollable
					/>
					<OriginFilterSection tree={originTree} specs={originSpecs} />
					<VintageFilterSection />
					<RangeFilterSection ruleId="abv" step={0.1} />
					<ChipFilterSection ruleId="body" label="Body" options={bodyOptions} />
					<ChipFilterSection ruleId="sweetness" label="Sweetness" options={sweetnessOptions} />
					<FuzzySearchFilterSection searchId="notes" />
					<FuzzySearchFilterSection searchId="winery" />
				</FilterSectionGuard>
			</SmartFilterSelectionContext>
		</FilterBundleContext>
	);
};
