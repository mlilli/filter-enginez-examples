/**
 * `real-estate/view` — the composed real-estate route, over the shared app shell and results view.
 *
 * @remarks
 * The mirror of `books/view.ts`, and short for the same reason: the chrome (header, footer, brand
 * link, mobile drawer) lives in `../shell/appShell.ts` and the batching card grid in
 * `../results/resultsView.ts`, so what is left here is only what is real-estate-SPECIFIC — the panel,
 * the card, the summarizer and the wording.
 *
 * Two things differ from books, and both are dataset shape rather than plumbing:
 *
 *   1. **`layout: 'sidebar'`.** Real estate's filter column is a sticky card in a two-column grid
 *      (`.fe-sidebar-app__main`), not books' flex row. The shell already took the parameter.
 *   2. **The breakpoint subscription also pokes the map.** Books' only reaction to a breakpoint change
 *      is repainting the drawer. Here the drawer hides the panel with the `hidden` attribute rather
 *      than destroying it, and Leaflet measures its container ONCE — so a map that initialized inside
 *      a closed drawer needs to be told the panel is visible now. See `geoSection`'s
 *      `invalidateMapSize`.
 *
 * `deriveMetroCenters` runs HERE, once, and its result goes to both the panel (whose geo section
 * recenters on a choice) and the summarizer (which names the Distance chip's center). Deriving it in
 * each would be two full corpus passes and two chances to disagree about where a metro's centroid is —
 * and disagreeing means the dropdown reading "Greater Denver" while the chip prints coordinates.
 *
 * @packageDocumentation
 */

import type {
	FilterBundle,
	FilterBundleQuery,
	FilterEngine,
	FilterRule,
	RuleId,
} from '@filter-enginez/core';
import type { Listing } from '@filter-enginez/mock-data/real-estate';

import {
	buildRuleSummaries,
	deriveMetroCenters,
} from '@filter-enginez/examples-shared/real-estate-domain';

import { createResultsView } from '../results/resultsView.js';
import { createAppShell } from '../shell/appShell.js';
import { trackDesktopBreakpoint } from '../viewport/desktopBreakpoint.js';
import { listingCard } from './listingCard.js';
import { createRealEstatePanel } from './panel.js';

/** The mounted real-estate view. */
export interface RealEstateView {
	/** Detach listeners, animations, and the Leaflet map. */
	readonly dispose: () => void;
	/** The app root element. */
	readonly element: HTMLElement;
	/** The bundle query the panel's predictive-disable needs (run it against the engine). */
	readonly query: FilterBundleQuery;
	/** Set the result count + corpus total (drives the ticking number). */
	readonly setCount: (count: number, total: number) => void;
	/** Replace the rendered result cards. */
	readonly setResults: (results: readonly Listing[]) => void;
	/**
	 * Push the active-rule map + predictive-disable bundle into the panel and the filter pills.
	 * `recentRuleId` marks the just-changed rule so its pill gets the phosphor border.
	 */
	readonly setRules: (
		rules: ReadonlyMap<RuleId, FilterRule>,
		bundle: FilterBundle | null,
		recentRuleId: RuleId | null,
	) => void;
}

/** Construction options for the view. */
export interface RealEstateViewOptions {
	/** Footer caption — spells out the wiring, so routes are distinguishable at a glance. */
	readonly footnote: string;
	/** Extra nodes for the header's right-hand control cluster (URL-format toggle, copy link). */
	readonly headerControls?: readonly HTMLElement[];
	/** Optional element between the results header and the grid — the devtools panel, in practice. */
	readonly resultsInsetElement?: HTMLElement;
	/** Subtitle under the wordmark — names the dataset and the surface driving this route. */
	readonly subtitle: string;
}

/**
 * Build the real-estate app view over a bare engine.
 *
 * @param core - The engine every control writes through.
 * @param options - Route-specific labelling + header controls.
 * @returns The mounted view with its granular updaters.
 */
export function createRealEstateView(
	core: FilterEngine<Listing>,
	options: RealEstateViewOptions,
): RealEstateView {
	const { footnote, headerControls = [], resultsInsetElement, subtitle } = options;

	const metroCenters = deriveMetroCenters(core.getSourceData());
	const panel = createRealEstatePanel(core, { metroCenters });
	const breakpoint = trackDesktopBreakpoint();
	const results = createResultsView<Listing>(core, {
		emptyHint: 'Try widening the radius — or relax a price or bedroom bound.',
		emptyTitle: 'No listings match these filters',
		listLabel: 'Matching listings',
		noun: 'listings',
		renderCard: listingCard,
		scrollRegionLabel: 'Listing results',
		// `metroCenters` is what lets the Distance chip read "≤ 15 mi of Greater Denver" rather than
		// "≤ 15 mi" — a radius without its center states half a filter, and the center is the half the
		// user actually chose.
		summarize: (rules) => buildRuleSummaries(rules, { metroCenters }),
	});

	const shell = createAppShell({
		breakpoint,
		footnote,
		headerControls,
		layout: 'sidebar',
		panelElement: panel.element,
		resultsGridElement: results.gridElement,
		resultsHeaderElement: results.headerElement,
		resultsInsetElement,
		subtitle,
	});

	const stopBreakpoint = breakpoint.subscribe(() => {
		// Order is load-bearing: reveal the panel FIRST, then tell Leaflet to re-measure. Asking it to
		// measure a container that is still `hidden` reads 0×0 all over again.
		shell.syncPanelVisibility();
		panel.invalidateMapSize();
	});

	return {
		dispose: () => {
			stopBreakpoint();
			breakpoint.dispose();
			results.dispose();
			panel.dispose();
		},
		element: shell.element,
		query: panel.query,
		setCount: results.setCount,
		setResults: results.setResults,
		setRules: (rules, bundle, recentRuleId) => {
			panel.update({ bundle, rules });
			results.setRules(rules, recentRuleId);
		},
	};
}
