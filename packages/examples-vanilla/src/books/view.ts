/**
 * `books/view` — the composed books route, over the shared app shell and results view.
 *
 * @remarks
 * This is the piece both demo routes share **verbatim**. It builds the DOM once and exposes granular
 * updaters; how those updaters get called is the ONLY difference between `/books` (one subscription
 * per engine signal, so each updater fires independently) and `/books-raw` (one coarse subscription,
 * then every updater called with freshly re-read values).
 *
 * Because the write path is identical on both routes — `SignalsEngine.core` and the bare engine are
 * the same `FilterEngine` — the panel and results write straight through the engine handed in here.
 *
 * The busy state is wired here too, so both routes get it identically: every write marks
 * {@link booksBusyCore}, the view paints it onto the header's computing indicator and the panel
 * body's `--busy` / `aria-busy`, and each engine change resolves it after one painted frame.
 *
 * What is left in this file is only what is books-SPECIFIC: the panel, the card, the summarizer and
 * the shared `RESULT_COPY.books` wording. The chrome lives in `../shell/appShell.ts` and the grid in
 * `../results/resultsView.ts`, shared with the real-estate and wine routes.
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
import type { AppHeaderSubtitle } from '@filter-enginez/examples-shared/app-header-core';
import type { Book } from '@filter-enginez/mock-data/books';

import { buildRuleSummaries } from '@filter-enginez/examples-shared/books-domain';
import { RESULT_COPY } from '@filter-enginez/examples-shared/verticals';

import { bindBusyState, booksBusyCore, type BusyCore, resolveAfterPaint } from '../busy/engineBusy.js';
import { createResultsView } from '../results/resultsView.js';
import { createAppShell } from '../shell/appShell.js';
import { trackDesktopBreakpoint } from '../viewport/desktopBreakpoint.js';
import { bookCard } from './bookCard.js';
import { createBooksPanel } from './panel.js';

/** The mounted books view. */
export interface BooksView {
	/** The app root element. */
	readonly element: HTMLElement;
	/** The bundle query the panel's predictive-disable needs (run it against the engine). */
	readonly query: FilterBundleQuery;
	/** Set the result count + corpus total (drives the ticking number). */
	readonly setCount: (count: number, total: number) => void;
	/** Replace the rendered result cards. */
	readonly setResults: (results: readonly Book[]) => void;
	/**
	 * Push the active-rule map + predictive-disable bundle into the panel and the filter pills.
	 * `recentRuleId` marks the just-changed rule so its pill gets the phosphor border.
	 */
	readonly setRules: (
		rules: ReadonlyMap<RuleId, FilterRule>,
		bundle: FilterBundle | null,
		recentRuleId: RuleId | null,
	) => void;
	/** Detach listeners + animations. */
	readonly dispose: () => void;
}

/** Construction options for the view. */
export interface BooksViewOptions {
	/**
	 * The books busy tracker. Defaults to {@link booksBusyCore}, the one both books routes share;
	 * injectable so a suite can observe a fresh instance.
	 */
	readonly busy?: BusyCore;
	/** Subtitle under the wordmark — names which reactive surface is driving this route. */
	readonly subtitle: AppHeaderSubtitle;
	/** Footer caption — spells out the wiring, so the two routes are distinguishable at a glance. */
	readonly footnote: string;
	/** Extra nodes for the header's right-hand control cluster (URL-format toggle, copy link). */
	readonly headerControls?: readonly HTMLElement[];
	/** Optional element between the results header and the grid — the devtools panel, in practice. */
	readonly resultsInsetElement?: HTMLElement;
}

/**
 * Build the books app view over a bare engine.
 *
 * @param core - The engine every control writes through.
 * @param options - Route-specific labelling + header controls.
 * @returns The mounted view with its granular updaters.
 */
export function createBooksView(core: FilterEngine<Book>, options: BooksViewOptions): BooksView {
	const { busy = booksBusyCore, footnote, headerControls = [], resultsInsetElement, subtitle } = options;
	const panel = createBooksPanel(core, { markBusy: busy.markUserAction });
	const breakpoint = trackDesktopBreakpoint();
	const results = createResultsView<Book>(core, {
		copy: RESULT_COPY.books,
		markBusy: busy.markUserAction,
		renderCard: bookCard,
		summarize: buildRuleSummaries,
	});

	const shell = createAppShell({
		breakpoint,
		footnote,
		headerControls,
		layout: 'books',
		panelElement: panel.element,
		resultsGridElement: results.gridElement,
		resultsHeaderElement: results.headerElement,
		resultsInsetElement,
		subtitle,
	});

	const stopBreakpoint = breakpoint.subscribe(shell.syncPanelVisibility);
	const stopBusy = bindBusyState(busy, (isBusy) => {
		results.setBusy(isBusy);
		panel.setBusy(isBusy);
	});
	// The books engine is main-thread, so every change event IS the settle of the writes marked
	// before it — including time travel, which emits `reset` rather than a rule event. Resolving after
	// a painted frame is what lets the busy state be seen at all.
	const stopResolve = core.subscribe(() => {
		resolveAfterPaint(busy);
	});

	return {
		dispose: () => {
			stopResolve();
			stopBusy();
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
