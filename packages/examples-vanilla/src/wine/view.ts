/**
 * `wine/view` — the composed wine route, over the shared app shell and results view.
 *
 * @remarks
 * The third and last of this app's dataset views, and the shortest, for the reason the other two are
 * short: the chrome lives in `../shell/appShell.ts` and the batching card grid in
 * `../results/resultsView.ts`, so what remains is only what is wine-SPECIFIC.
 *
 * `layout: 'sidebar'` — wine's filter column is a sticky card in the two-column grid, as real
 * estate's is. Books is the flex-row outlier.
 *
 * ## What wine adds that neither other dataset needs
 *
 * **The summarizer takes expression mode.** `buildWineRuleSummaries(rules, isExpressionMode)` returns
 * a single synthetic chip when a preset is driving the results, rather than listing flat rules that
 * are dormant. Listing them would show chips for filters that are not applying; listing nothing would
 * claim no filters are active over a visibly narrowed corpus.
 *
 * **The panel's state carries the expression, not a boolean.** The strip needs to know WHICH presets
 * are lit and the sections only need to know that some are, so passing the tree serves both from one
 * value — and keeps the route from computing a derived boolean the panel would have to trust.
 *
 * @packageDocumentation
 */

import type { FilterEngine, FilterRule, RuleId } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';

import {
	buildWineFilterSummaries,
	type WineBundleQuery,
} from '@filter-enginez/examples-shared/wine-domain';

import { createResultsView } from '../results/resultsView.js';
import { createAppShell } from '../shell/appShell.js';
import { trackDesktopBreakpoint } from '../viewport/desktopBreakpoint.js';
import { createWinePanel, type WinePanelState } from './panel.js';
import { wineCard } from './wineCard.js';

/** The mounted wine view. */
export interface WineView {
	/** Detach listeners and the breakpoint tracker. */
	readonly dispose: () => void;
	/** The app root element. */
	readonly element: HTMLElement;
	/** The `applyFiltersAndQuery` query the panel's predictive-disable needs. */
	readonly query: WineBundleQuery;
	/** Set the result count + corpus total (drives the ticking number). */
	readonly setCount: (count: number, total: number) => void;
	/** Push engine state into every panel section and the body modifiers. */
	readonly setPanelState: (state: WinePanelState) => void;
	/** Replace the rendered result cards. */
	readonly setResults: (results: readonly Wine[]) => void;
	/**
	 * Push the active-rule map into the filter pills. `recentRuleId` marks the just-changed rule so
	 * its pill gets the phosphor border.
	 */
	readonly setRules: (
		rules: ReadonlyMap<RuleId, FilterRule>,
		recentRuleId: RuleId | null,
		isExpressionMode: boolean,
	) => void;
}

/** Construction options for the view. */
export interface WineViewOptions {
	/** Footer caption — spells out the wiring, so routes are distinguishable at a glance. */
	readonly footnote: string;
	/** Extra nodes for the header's right-hand control cluster. */
	readonly headerControls?: readonly HTMLElement[];
	/** Optional element between the results header and the grid — the devtools panel, in practice. */
	readonly resultsInsetElement?: HTMLElement;
	/** Subtitle under the wordmark — names the dataset and the surface driving this route. */
	readonly subtitle: string;
}

/**
 * Build the wine app view over a bare engine.
 *
 * @param core - The engine every control writes through.
 * @param options - Route-specific labelling + header controls.
 * @returns The mounted view with its granular updaters.
 */
export function createWineView(core: FilterEngine<Wine>, options: WineViewOptions): WineView {
	const { footnote, headerControls = [], resultsInsetElement, subtitle } = options;

	const panel = createWinePanel(core);
	const breakpoint = trackDesktopBreakpoint();
	// Expression mode changes what the pills MEAN, so the summarizer needs it — but the results view
	// owns when it re-summarizes. Holding it here and reading it in the callback keeps the pills
	// honest without giving the results view a wine-shaped parameter.
	let isExpressionMode = false;
	const results = createResultsView<Wine>(core, {
		emptyHint: 'Try widening the price range — or clearing a varietal.',
		emptyTitle: 'No wines match these filters',
		listLabel: 'Matching wines',
		noun: 'bottles',
		renderCard: wineCard,
		scrollRegionLabel: 'Wine results',
		summarize: (rules) => buildWineFilterSummaries(rules, isExpressionMode),
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
		shell.syncPanelVisibility();
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
		setPanelState: panel.update,
		setResults: results.setResults,
		setRules: (rules, recentRuleId, nextIsExpressionMode) => {
			isExpressionMode = nextIsExpressionMode;
			results.setRules(rules, recentRuleId);
		},
	};
}
