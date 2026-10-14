/**
 * The route-derived facet metadata every real-estate control needs, and its DI token.
 *
 * @remarks
 * Five values — slider baselines, chip vocabularies, the location tree and its flattened specs, the
 * metro centers — all derived once from the BOOTED corpus in the route resolver, then republished
 * into component-scoped DI beside the engine itself.
 *
 * ### Why DI rather than inputs
 *
 * Vue and Svelte thread these down as props because that is their idiom; Angular's is the one this
 * vertical already uses for the engine. Five inputs on the panel plus a re-thread into each section
 * would be twenty bindings whose only purpose is transport, and every one of them a chance to pass
 * `vocabularies` where `baselines` was wanted. `injectRealEstateFacets()` is the same move
 * `injectFilterEngine()` already is.
 *
 * ### Why derived at the ROUTE and not in the panel
 *
 * Two reasons, and the second is the load-bearing one.
 *
 * Cost: each of these is a full pass over ~10k listings, and the panel would redo them on every
 * re-navigation.
 *
 * Agreement: `metroCenters` has two very different consumers — the geo section recenters the map on
 * a choice, and the results header names that center on the Distance chip ("≤ 15 mi of Greater
 * Denver"). Deriving it in each would be two passes AND two chances to disagree about where a
 * metro's centroid is, which would present as a chip naming a different place than the map shows.
 *
 * ### Derived from the booted corpus, never from the bundled one
 *
 * Everything below comes from `core.getSourceData()`, for two reasons. A streamed tier carrying
 * metros the bundled copy lacks still gets a complete dropdown. And this module never needs the
 * dataset module itself, only the `Listing` type: importing the bundled corpus would drag its
 * generator into this bundle — the very thing `loadDefaultTierCorpus` code-splits away.
 *
 * @packageDocumentation
 */

import type { NumericBounds } from '@filter-enginez/examples-shared/bounds';
import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { inject, InjectionToken, type Provider } from '@angular/core';
import {
	buildListingLocationTree,
	buildLocationNodeSpecs,
	deriveBaselineBounds,
	deriveMetroCenters,
	deriveRealEstateVocabularies,
	type LocationNodeSpec,
	type MetroCenterOption,
	type PickerTreeNode,
	REAL_ESTATE_SLIDER_FIELD_IDS,
	type RealEstateChipVocabularies,
	type RealEstateSliderFieldId,
	SLIDER_CLAMPS,
	SLIDER_FIELD_GETTERS,
	SLIDER_STEPS,
} from '@filter-enginez/examples-shared/real-estate-domain';

/** Everything the panel and its sections need that is neither the engine nor the busy tracker. */
export interface RealEstateFacets {
	/** Full-corpus extents per slider, so a track spans the data rather than the clamp. */
	readonly baselines: Record<RealEstateSliderFieldId, NumericBounds>;
	/** The hierarchy flattened to bundle candidates — each node plus its descendant leaf ids. */
	readonly locationSpecs: readonly LocationNodeSpec[];
	/** The hierarchy itself: what `HierarchicalRule` walks and what the picker renders. */
	readonly locationTree: PickerTreeNode;
	/** Metro centroids, for the geo dropdown and the Distance chip's wording. */
	readonly metroCenters: readonly MetroCenterOption[];
	/** Sorted distinct values per chip / checkbox facet. */
	readonly vocabularies: RealEstateChipVocabularies;
}

/** DI token for {@link RealEstateFacets}, provided by the real-estate page. */
export const REAL_ESTATE_FACETS = new InjectionToken<RealEstateFacets>('REAL_ESTATE_FACETS');

/**
 * Full-corpus track extents for every slider.
 *
 * @remarks
 * The clamps, getters and rounding steps all come from `real-estate-domain`, which is what keeps
 * these numbers identical to React's, Svelte's and Vue's rather than merely similar.
 *
 * @param corpus - The booted listings.
 * @returns Baseline bounds per slider.
 */
function deriveBaselines(corpus: readonly Listing[]): Record<RealEstateSliderFieldId, NumericBounds> {
	const entries = REAL_ESTATE_SLIDER_FIELD_IDS.map(
		(fieldId) =>
			[
				fieldId,
				deriveBaselineBounds(
					corpus.map(SLIDER_FIELD_GETTERS[fieldId]),
					SLIDER_CLAMPS[fieldId],
					SLIDER_STEPS[fieldId],
				),
			] as const,
	);

	return Object.fromEntries(entries) as Record<RealEstateSliderFieldId, NumericBounds>;
}

/**
 * Derive every facet input from a booted corpus. Called once, in the route resolver.
 *
 * @param corpus - The booted listings.
 * @returns The facet metadata to publish into DI.
 */
export function deriveRealEstateFacets(corpus: readonly Listing[]): RealEstateFacets {
	const locationTree = buildListingLocationTree(corpus);

	return {
		baselines: deriveBaselines(corpus),
		locationSpecs: buildLocationNodeSpecs(locationTree),
		locationTree,
		metroCenters: deriveMetroCenters(corpus),
		vocabularies: deriveRealEstateVocabularies(corpus),
	};
}

/**
 * Publish resolved facet metadata to a component subtree.
 *
 * @param factory - Reads the facets, typically off the activated route's data.
 * @returns The provider to place on the page component.
 */
export function provideRealEstateFacets(factory: () => RealEstateFacets): Provider {
	return { provide: REAL_ESTATE_FACETS, useFactory: factory };
}

/**
 * Read the route's facet metadata.
 *
 * @returns The facets published by the real-estate page.
 */
export function injectRealEstateFacets(): RealEstateFacets {
	return inject(REAL_ESTATE_FACETS);
}
