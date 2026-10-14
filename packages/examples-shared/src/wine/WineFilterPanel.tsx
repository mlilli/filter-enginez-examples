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
 * Filters wired: Origin (InSetofSetsRule, the same rule every app commits), Price/Points/ABV (RangeRule), Vintage (InSetRule-of-
 * years), Color/Body/Sweetness (InSetRule chips), Single color (ValueRule, exact single-select),
 * Score comparison (NumericComparisonRule, one-sided operator), Varietal (InSetRule checkbox list),
 * Tasting-notes + Winery (FuzzySearchRule), plus a Smart-filters preset row demonstrating `CompositeRule` / expression
 * mode via `setExpression` (single-select or "match any (OR)" multi-select).
 *
 * Headline UX moment: the exclusion-aware chip/checkbox/tree disabling
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
import {
	buildOriginNodeSpecs,
	type BundleContextValue,
	FilterBundleContext,
	useFetchFilterBundle,
} from './filters/filterBundle.js';
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
import { VarietalFilterSection } from './filters/VarietalFilterSection.js';
import { VintageFilterSection } from './filters/VintageFilterSection.js';
import { buildWineOriginTree, rankWineVarietals } from './wine-domain/facets.js';

/**
 * Props for `<WineFilterPanel />`.
 */
export interface WineFilterPanelProps {
	/**
	 * Whether to render the panel's own `<PanelHeader />` ("Filters" title). Defaults to `true` for
	 * the desktop sidebar; the mobile drawer passes `false` because `<FilterDrawer />` supplies its
	 * own titled header + close affordance, so the panel title would be a redundant second header.
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

	// Varietal vocabulary derived from the FULL sourceData (not current results) so the list shows
	// every varietal in the corpus, most-reviewed first, with bundle data telling us which are
	// currently reachable.
	const sourceData = engine.core.getSourceData();
	const allVarietals = useMemo(() => rankWineVarietals(sourceData), [sourceData]);

	const chipVocabularies = useMemo(
		() => ({
			body: BODY_ORDER,
			color: COLOR_ORDER,
			sweetness: SWEETNESS_ORDER,
			varietal: allVarietals,
		}),
		[allVarietals],
	);

	// Origin tree → flat node specs the bundle uses to simulate "if user clicked X, would it yield
	// 0?" for every node. Built from the engine's loaded corpus (`sourceData`) so the tree reflects
	// the actual tier, ordered by wine count like every other app's.
	const originTree = useMemo(() => buildWineOriginTree(sourceData), [sourceData]);
	const originNodeSpecs = useMemo(() => buildOriginNodeSpecs(originTree), [originTree]);

	const bundle = useFetchFilterBundle(baselines, chipVocabularies, originNodeSpecs);
	const bundleCtx = useMemo<BundleContextValue>(() => ({ baselines, bundle }), [bundle, baselines]);

	return (
		<FilterBundleContext value={bundleCtx}>
			{/* Two-zone structure: PanelHeader stays fixed at the aside's top (outside the scroller);
			    FilterSectionGuard owns the overflow + the global dim-during-compute treatment. In the
			    mobile drawer the drawer's own header stands in for PanelHeader, so it's suppressed. */}
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
				<RangeFilterSection ruleId="price" fieldKey="priceUsd" label="Price (USD)" ariaLabel="Price range in USD" step={1} openEnded />
				<RangeFilterSection ruleId="points" fieldKey="points" label="Points" ariaLabel="Wine Enthusiast points score" step={1} />
				<PointsCompareFilterSection />
				<ChipFilterSection ruleId="color" label="Color" options={COLOR_ORDER} showCount />
				<ColorValueFilterSection />
				<VarietalFilterSection />
				<OriginFilterSection tree={originTree} specs={originNodeSpecs} />
				<VintageFilterSection />
				<RangeFilterSection ruleId="abv" fieldKey="abv" label="ABV (%)" ariaLabel="Alcohol by volume range" step={0.1} />
				<ChipFilterSection ruleId="body" label="Body" options={BODY_ORDER} formatLabel={(v) => v.replace(/-/g, ' ')} />
				<ChipFilterSection ruleId="sweetness" label="Sweetness" options={SWEETNESS_ORDER} formatLabel={(v) => v.replace(/-/g, ' ')} />
				<FuzzySearchFilterSection ruleId="notes" label="Tasting notes search" placeholder="blackberry, citrus, oak..." ariaLabel="Search tasting notes (fuzzy)" field="description" threshold={0.45} keys={['description', 'tastingNotes']} />
				<FuzzySearchFilterSection ruleId="winery" label="Winery (typo-tolerant)" placeholder="Vandermark, Caruso, Hartmann..." ariaLabel="Search wineries with typo tolerance" field="winery" threshold={0.35} />
			</FilterSectionGuard>
		</FilterBundleContext>
	);
};
