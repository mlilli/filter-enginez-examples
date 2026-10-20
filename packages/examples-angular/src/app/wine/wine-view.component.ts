/**
 * `<fe-wine-view>` — the wine route's shell, rendered only once the boot has resolved.
 *
 * @remarks
 * ## Its providers are the whole reason it is a separate component
 *
 * `WineBootStore` is provided by the PAGE and filled asynchronously. This component is rendered under
 * the page's `@if (store.isReady())`, so by the time these three factories run the engine and its
 * facets are both in hand — which is what lets the entire subtree keep using `injectFilterEngine()`
 * unconditionally, exactly as the resolver-backed routes do. The waiting stops at this
 * boundary and nothing below it knows there was one.
 *
 * ## This view owns the bundle; the thirteen sections read it
 *
 * Predictive disable needs one bundle per engine change and exactly one fetcher. A panel fetching its
 * own would re-request on every re-render, and each section fetching its own facet would turn one
 * round trip into thirteen — across a Comlink boundary, against 150k records. So the loop lives here
 * and the result is provided through `WINE_BUNDLE`.
 *
 * A failed fetch keeps the PREVIOUS bundle. Predictive disable is an enhancement: slightly stale hints
 * beat a panel where every control blanks because one worker round trip failed.
 *
 * **The fetcher carries `captureVersion` and `onSettled`, which real estate's omits.** That pair is
 * what makes the "computing" indicator honest on a tier where a round trip takes real time: the fetch
 * captures the user-action version at start and resolves it at settle, so the busy predicate stays lit
 * through a burst of clicks instead of flickering once per settle.
 *
 * ## Two things wine's results header does that no other vertical's does
 *
 * **"Clear all" calls `clearAllWineFilters`** — the flat rules AND the expression, as one operation.
 * Splitting them is how a clear-all comes to drop the facets while leaving a preset driving the
 * results, with every control blank.
 *
 * **`SMART_FILTER_CHIP_ID` is a synthetic chip, not a rule.** Its × (through the shared
 * `removeWineFilterChip`, which every vertical's header calls) exits expression mode, which is the
 * only way back to the flat facets once a preset is driving the results — and it clears the facets
 * too, deliberately. `core.removeRule` on it is a silent no-op, which is why `fe-results-header` has
 * its two handler inputs.
 *
 * ## Time travel on the worker tier
 *
 * `<fe-time-travel-controls>` and `<fe-devtools-panel>` both read `engine.core.devtools` in a FIELD
 * INITIALIZER. A field initializer has no seam, so an engine surface whose `devtools` getter threw
 * would take the WHOLE VIEW down at construction rather than degrading. On this tier the getter is
 * answered by the async devtools shim `@filter-enginez/worker-bridge` shares between both adapters,
 * fed by `reactive-rxjs`'s action-log and devtools-state mirror, so it never throws and both
 * controls render here exactly as they do on the main-thread routes.
 *
 * ## The chips describe the ENGINE, not the panel
 *
 * The summaries derive from `activeRules$`, never from the sections' painted state. On this tier those
 * differ for a round trip, and a chip for a rule the engine has not applied yet would offer a remove
 * button for a filter that is not on.
 *
 * @packageDocumentation
 */

import type { FilterSummary } from '@filter-enginez/examples-shared/books-domain';
import type { Wine } from '@filter-enginez/mock-data/wine';

import { AsyncPipe } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	effect,
	inject,
	signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
	injectEngineBusy,
	injectFilterEngine,
	provideEngineBusy,
	provideFilterEngineFactory,
} from '@filter-enginez/angular-rxjs';
import {
	buildWineBundleQuery,
	buildWineFilterSummaries,
	clearAllWineFilters,
	createBundleFetcher,
	removeWineFilterChip,
	wineBusyCore,
} from '@filter-enginez/examples-shared/wine-domain';

import { DevtoolsPanelComponent } from '../controls/devtools-panel.component.js';
import { FiltersToggleComponent } from '../controls/filters-toggle.component.js';
import { ResultCardDirective, ResultGridComponent } from '../controls/result-grid.component.js';
import {
	ResultsHeaderComponent,
	type RuleSummarizer,
} from '../controls/results-header.component.js';
import { TimeTravelControlsComponent } from '../controls/time-travel-controls.component.js';
import { AppHeaderBrandComponent } from '../shell/app-header-brand.component.js';
import { CompareLinkButtonComponent } from '../url/compare-link-button.component.js';
import { CopyLinkButtonComponent } from '../url/copy-link-button.component.js';
import { UrlFormatToggleComponent } from '../url/url-format-toggle.component.js';
import { startEngineUrlSync } from '../url/url-state.js';
import { trackDesktopBreakpoint } from '../viewport/desktop-breakpoint.js';
import { WineBootStore } from './wine-boot-store.js';
import { provideWineBundle } from './wine-bundle.js';
import { wineBusyStream } from './wine-busy.js';
import { WineCardComponent } from './wine-card.component.js';
import { provideWineFacets } from './wine-facets.js';
import { WineFilterPanelComponent } from './wine-filter-panel.component.js';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		AppHeaderBrandComponent,
		AsyncPipe,
		CompareLinkButtonComponent,
		CopyLinkButtonComponent,
		DevtoolsPanelComponent,
		FiltersToggleComponent,
		ResultCardDirective,
		ResultGridComponent,
		ResultsHeaderComponent,
		TimeTravelControlsComponent,
		UrlFormatToggleComponent,
		WineCardComponent,
		WineFilterPanelComponent,
	],
	providers: [
		provideEngineBusy(wineBusyStream),
		provideFilterEngineFactory<Wine>(() => inject(WineBootStore).requireEngine()),
		provideWineFacets(() => inject(WineBootStore).requireFacets()),
		// Sections read this through `injectWineBundle()`. The holder lives on the store because a
		// providers array cannot reference a component field — see `wine-bundle.ts`.
		provideWineBundle(() => {
			const store = inject(WineBootStore);

			return { baselines: store.requireFacets().baselines, current: store.bundle };
		}),
	],
	selector: 'fe-wine-view',
	template: `
		<div class="fe-books-app">
			<header class="fe-books-app__header">
				<nav fe-app-header-brand page="Wine" tier="worker"></nav>

				<div class="fe-books-app__url-controls">
					<!--
						Time travel works on this route — see the class remarks. It must stay FIRST:
						tests/tooling/headerControlOrder.test.ts asserts every header's render order is a
						subsequence of time-travel, URL format, copy link, compare link. No backticks in this
						comment; it lives inside a template literal, so one would close the string.
					-->
					<fe-time-travel-controls
						[isDevtoolsOpen]="isDevtoolsOpen()"
						(toggled)="isDevtoolsOpen.set(!isDevtoolsOpen())"
					/>
					<fe-url-format-toggle />
					<fe-copy-link-button />
					<fe-compare-link-button dataset="wine" />
				</div>
			</header>

			<main class="fe-books-app__main fe-sidebar-app__main">
				<aside class="fe-sidebar-app__filters">
					@if (!breakpoint.isDesktop()) {
						<fe-filters-toggle
							[isOpen]="breakpoint.isFilterOpen()"
							(toggled)="breakpoint.toggleFilters()"
						/>
					}
					<!--
						Hidden, NOT removed — control state survives a mobile drawer close. And no backticks in
						this comment: it lives inside a template literal, so one would close the string.
						fe-filter-collapse supplies its display via :not([hidden]) by design, which is why the
						attribute drives it rather than a class.
					-->
					<div class="fe-filter-collapse" [hidden]="!breakpoint.shouldShowPanel()">
						<fe-wine-filter-panel
							[isComputing]="isEngineBusy()"
							[isExpressionMode]="isExpressionMode()"
							[originSpecs]="facets.originSpecs"
							[originTree]="facets.originTree"
							[vocabularies]="facets.vocabularies"
						/>
					</div>
				</aside>

				<div class="fe-sidebar-app__results">
					<fe-results-header
						[clearAllHandler]="clearAll"
						noun="bottles"
						[removeRuleHandler]="removeChip"
						[summarize]="summarizeWineRules"
					/>

					<!--
						An inline card in the document flow, not an overlay: it pushes the grid down rather
						than covering it, because the point of scrubbing the timeline is watching the RESULTS
						change. Same placement as the real-estate route.
					-->
					@if (isDevtoolsOpen()) {
						<fe-devtools-panel
							[isComputing]="isEngineBusy()"
							(closed)="isDevtoolsOpen.set(false)"
						/>
					}

					@if (results$ | async; as results) {
						<fe-result-grid
							[results]="results"
							[card]="wineCard"
							[itemKey]="wineKey"
							emptyTitle="No wines match the current filters."
							emptyHint="Try widening the price range or clearing a varietal."
							listLabel="Matching wines"
							scrollRegionLabel="Wine results"
							noun="bottles"
						/>
						<ng-template #wineCard [feResultCardOf]="results" let-wine>
							<fe-wine-card [wine]="wine" />
						</ng-template>
					}
				</div>
			</main>

			<footer class="fe-books-app__footer">
				Booted {{ store.wineCount().toLocaleString() }} bottles ({{ store.corpusTier() }}) in
				{{ bootMs() }}&thinsp;ms · same engine, bound to Angular
			</footer>
		</div>
	`,
})
export class WineViewComponent {
	/** Read in the template for the footer; public on the store, so bound directly. */
	protected readonly store = inject(WineBootStore);

	/** Everything derived from the booted corpus. Fixed after boot, so read once. */
	protected readonly facets = inject(WineBootStore).requireFacets();

	/** Mobile drawer state. */
	protected readonly breakpoint = trackDesktopBreakpoint();

	/** Whether the inline devtools panel is showing. Same shape as the real-estate route. */
	protected readonly isDevtoolsOpen = signal(false);

	private readonly _busy = injectEngineBusy();

	private readonly _engine = injectFilterEngine<Wine>();

	/** The filtered wines. */
	protected readonly results$ = this._engine.results$;

	/** Whether the engine reports itself mid-recompute. */
	protected readonly bootMs = computed(() => Math.round(this.store.bootMs()));

	protected readonly isEngineBusy = toSignal(this._busy.isBusy$, { requireSync: true });

	private readonly _mode = toSignal(this._engine.mode$, { requireSync: true });

	/** Whether a preset is driving the results. */
	protected readonly isExpressionMode = computed(() => this._mode() === 'expression');


	private readonly _lastChangeEvent = toSignal(this._engine.lastChangeEvent$, {
		requireSync: true,
	});

	/**
	 * The one fetcher.
	 *
	 * @remarks
	 * `captureVersion` / `onSettled` are the pair real estate's omits — see the class remarks.
	 */
	private readonly _fetcher = createBundleFetcher(this._engine, {
		captureVersion: wineBusyCore.captureCurrentVersion,
		onBundle: (next) => {
			this.store.bundle.set(next);
		},
		onError: (error) => {
			// Keep the previous bundle — see the class remarks.
			console.error('[wine] bundle fetch failed:', error);
		},
		onSettled: wineBusyCore.markResolvedAtLeast,
	});

	/**
	 * The removable chips. Derived from the ENGINE's rules — see the class remarks.
	 *
	 * @remarks
	 * A field holding an arrow rather than an inline template expression: an inline arrow is a fresh
	 * function identity on every change-detection pass, so the header's `summarize` input would read as
	 * perpetually changed. The arrow reads `isExpressionMode()` inside the header's own `computed`, so
	 * it stays reactive.
	 */
	protected readonly summarizeWineRules: RuleSummarizer = (rules): readonly FilterSummary[] =>
		buildWineFilterSummaries(rules, this.isExpressionMode());

	/** Clear every filter — flat facets AND expression mode, as one operation. */
	protected readonly clearAll = (): void => {
		clearAllWineFilters(this._engine);
	};

	/**
	 * Remove one chip.
	 *
	 * @remarks
	 * The synthetic smart-filter id names no rule, so `removeWineFilterChip` sends it through
	 * `clearAllWineFilters` rather than `removeFacet` — see the class remarks.
	 */
	protected readonly removeChip = (ruleId: string): void => {
		removeWineFilterChip(this._engine, ruleId);
	};

	/** Stable key for the result grid's `track`. */
	protected readonly wineKey = (wine: Wine): string => wine.id;

	public constructor() {
		// Mirror every engine change into the address bar (debounced), and tear it down with the route
		// so a navigation away does not leave a subscription rewriting someone else's URL. Every other
		// route in this app does this in its PAGE component; wine's page owns the boot rather than the
		// engine, so it belongs here — the first place the engine exists.
		//
		// `WineBootStore` already reads `?f` at boot. Reading without writing is a half-wired shareable
		// link: the restore works, and nothing a user then does is ever reflected back into the URL, so
		// the link they copy describes the state they arrived with rather than the one they built.
		// `startEngineUrlSync` branches on `asyncEngine` internally, which is what makes it work on this
		// tier where the sync shim's `exportConfig` is deliberately unsupported.
		inject(DestroyRef).onDestroy(startEngineUrlSync(this._engine));

		// Re-fetch on every engine change. Reading `_lastChangeEvent` is what registers the dependency;
		// the value itself is unused, so the read looks pointless and is load-bearing. The EVENT rather
		// than a timestamp: an event is freshly allocated per emission so its identity always differs,
		// whereas two commits inside one millisecond share a timestamp.
		effect(() => {
			this._lastChangeEvent();
			this._fetcher.request(
				buildWineBundleQuery(this.facets.baselines, this.facets.vocabularies, this.facets.originSpecs),
			);
		});

		inject(DestroyRef).onDestroy(() => {
			this._fetcher.dispose();
		});
	}
}
