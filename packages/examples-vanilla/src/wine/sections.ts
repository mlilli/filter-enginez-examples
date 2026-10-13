/**
 * `wine/sections` — the shapes every wine facet section shares.
 *
 * @remarks
 * Four modules build the thirteen (`sliderSections`, `choiceSections`, `searchSections`, and the
 * score comparison beside the sliders it contrasts with). They agree on three things, and those
 * three live here rather than being restated four times — or, worse, drifting.
 *
 * A section is deliberately NOT a component: it is a closure over its own controls and its own
 * {@link FacetAdopter}, exposing an element to append and an updater to call. That is the same
 * contract `real-estate/panelSections.ts` exports, minus the local state real estate does not need.
 *
 * @packageDocumentation
 */

import type { FilterBundle, FilterRule, RuleId } from '@filter-enginez/core';
import type { WineEngineHost, WineFacets } from '@filter-enginez/examples-shared/wine-domain';

/** What every section needs at construction: where to write, and what the corpus contains. */
export interface WineSectionContext {
	/** Baselines, vocabularies and the origin tree, derived once from the booted corpus. */
	readonly facets: WineFacets;
	/** The engine facade the shared commit helpers write through. */
	readonly host: WineEngineHost;
	/**
	 * Drop any active preset.
	 *
	 * @remarks
	 * Called by every section before it commits, because editing a facet means the user is back in
	 * flat-map mode. Threaded in rather than reached for, so a section cannot know about the preset
	 * strip — the strip owns which chips are lit, and only the panel sees both.
	 */
	readonly leaveExpressionMode: () => void;
}

/** The engine snapshot a section repaints from. */
export interface WineFacetState {
	/** The predictive-disable bundle, or `null` when none has arrived (or the last fetch failed). */
	readonly bundle: FilterBundle | null;
	/** The engine's committed rule map. Lags a worker round trip — see `facetState.ts`. */
	readonly rules: ReadonlyMap<RuleId, FilterRule>;
}

/** One mounted facet section. */
export interface WineSection {
	/** The `<section>` to append into the panel body. */
	readonly element: HTMLElement;
	/** Re-apply engine state: adopt what changed, repaint the control either way. */
	readonly update: (state: WineFacetState) => void;
}
