/**
 * `<fe-real-estate-page>` — the Angular real-estate demo, and the widest panel in this vertical.
 *
 * @remarks
 * Fourteen sections including a Leaflet geo-radius map, over the same engine and the same
 * `ui-styles` classes as the other five verticals. Structurally it is `/books` with a bigger panel:
 * the route resolver boots the engine, this component republishes it into component-scoped DI, and
 * every descendant reads it with `injectFilterEngine()`.
 *
 * ### What differs from `/books`, and why
 *
 * **A third provider.** `provideRealEstateFacets` publishes the slider baselines, chip vocabularies,
 * location hierarchy and metro centroids the resolver derived. Books needs none of that — its panel
 * derives its four vocabularies from `core.getSourceData()` on the spot, which is affordable for
 * four `Set`s and is not for fourteen sections including two full tree builds.
 *
 * **The sidebar layout, not the books one.** `.fe-sidebar-app__main` is a two-column grid whose
 * filter column is a sticky card capped at `calc(100vh - 2rem)`; `.fe-books-app__main` is a flex row.
 * Both are in `ui-styles` already. The header, footer, brand and filters-toggle chrome is still
 * `.fe-books-app__*` — a documented misnomer for the SHARED app chrome every vertical composes, and
 * one that must not be copied under a new prefix.
 *
 * **A `noun` and a summarizer on the results header.** `metroCenters` is what lets the Distance chip
 * read "≤ 15 mi of Greater Denver" instead of "≤ 15 mi" — a radius without its center states half a
 * filter, and the center is the half the user actually chose.
 *
 * ### The resolver never rejects on a bad `?f`
 *
 * `realEstateResolver` swallows a malformed URL config rather than letting it fail the navigation.
 * A rejected resolver aborts the route, which presents as a link that simply does nothing — worse
 * than opening on the neutral corpus.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
	injectEngineBusy,
	injectFilterEngine,
	provideEngineBusy,
	provideFilterEngineFactory,
} from '@filter-enginez/angular-rxjs';
import {
	buildRuleSummaries,
	type FilterSummary,
} from '@filter-enginez/examples-shared/real-estate-domain';
import { RESULT_COPY } from '@filter-enginez/examples-shared/verticals';
import { type Observable } from 'rxjs';

import { REAL_ESTATE_ROUTE_DATA_KEY, type RealEstateRouteData } from '../app.routes.js';
import { DevtoolsPanelComponent } from '../controls/devtools-panel.component.js';
import { FiltersToggleComponent } from '../controls/filters-toggle.component.js';
import { ResultCardDirective, ResultGridComponent } from '../controls/result-grid.component.js';
import {
	ResultsHeaderComponent,
	type RuleSummarizer,
} from '../controls/results-header.component.js';
import { TimeTravelControlsComponent } from '../controls/time-travel-controls.component.js';
import { ListingCardComponent } from '../real-estate/listing-card.component.js';
import { realEstateBusyStream } from '../real-estate/real-estate-busy.js';
import { provideRealEstateFacets } from '../real-estate/real-estate-facets.js';
import { RealEstateFilterPanelComponent } from '../real-estate/real-estate-filter-panel.component.js';
import { AppHeaderBrandComponent } from '../shell/app-header-brand.component.js';
import { CompareLinkButtonComponent } from '../url/compare-link-button.component.js';
import { CopyLinkButtonComponent } from '../url/copy-link-button.component.js';
import { UrlFormatToggleComponent } from '../url/url-format-toggle.component.js';
import { startEngineUrlSync } from '../url/url-state.js';
import { trackDesktopBreakpoint } from '../viewport/desktop-breakpoint.js';

/**
 * Pull the resolved real-estate bundle off the activated route.
 *
 * @remarks
 * The type assertion is safe because the router will not activate this component until
 * `realEstateResolver` settles — which is why the boot lives in a resolver rather than in an effect.
 * `ActivatedRoute.snapshot.data` is an index signature, so the shape has to be asserted; the
 * guarantee is the router's, not the type system's.
 *
 * @returns The booted engine, the derived facets and boot metadata.
 */
function injectRealEstateRouteData(): RealEstateRouteData {
	return inject(ActivatedRoute).snapshot.data[REAL_ESTATE_ROUTE_DATA_KEY] as RealEstateRouteData;
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		AppHeaderBrandComponent,
		AsyncPipe,
		DevtoolsPanelComponent,
		CompareLinkButtonComponent,
		CopyLinkButtonComponent,
		FiltersToggleComponent,
		ListingCardComponent,
		RealEstateFilterPanelComponent,
		ResultCardDirective,
		ResultGridComponent,
		ResultsHeaderComponent,
		TimeTravelControlsComponent,
		UrlFormatToggleComponent,
	],
	providers: [
		provideFilterEngineFactory<Listing>(() => injectRealEstateRouteData().engine),
		provideEngineBusy(realEstateBusyStream),
		provideRealEstateFacets(() => injectRealEstateRouteData().facets),
	],
	selector: 'fe-real-estate-page',
	template: `
		<div class="fe-books-app">
			<header class="fe-books-app__header">
				<nav fe-app-header-brand page="Real estate"></nav>

				<div class="fe-books-app__url-controls">
					<!--
						Time travel is an ENGINE feature, not a React one. Same three controls, same icons,
						same order as every other vertical's header.
					-->
					<fe-time-travel-controls
						[isDevtoolsOpen]="isDevtoolsOpen()"
						(toggled)="isDevtoolsOpen.set(!isDevtoolsOpen())"
					/>
					<fe-url-format-toggle />
					<fe-copy-link-button />
					<fe-compare-link-button dataset="real-estate" />
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
						Hidden, NOT removed — and on THIS route that is load-bearing beyond preserving control
						state. An @if would destroy the Leaflet map on every mobile filter close, refetching
						tiles and discarding the user's zoom and pan.

						fe-filter-collapse supplies a display ONLY via :not([hidden]), because an
						unconditional one beats the hidden attribute (a UA rule). Without any display it is a
						plain block, which severs the flex height chain from the aside's max-height down to
						the panel scroller — the panel then never scrolls and the bottom sections are
						unreachable.
					-->
					<div class="fe-filter-collapse" [hidden]="!breakpoint.shouldShowPanel()">
						<fe-real-estate-filter-panel [isPanelVisible]="breakpoint.shouldShowPanel()" />
					</div>
				</aside>

				<div class="fe-sidebar-app__results">
					<fe-results-header [noun]="resultNoun" [summarize]="summarizeListingRules" />

					<!--
						An inline card in the document flow, not an overlay: it pushes the grid down rather
						than covering it, because the point of scrubbing the timeline is watching the RESULTS
						change.
					-->
					@if (isDevtoolsOpen()) {
						<fe-devtools-panel
							[isComputing]="(busy.isBusy$ | async) ?? false"
							(closed)="isDevtoolsOpen.set(false)"
						/>
					}

					@if (results$ | async; as results) {
						<fe-result-grid
							[results]="results"
							[card]="listingCard"
							[itemKey]="listingKey"
							dataset="real-estate"
						/>
						<ng-template #listingCard [feResultCardOf]="results" let-listing>
							<fe-listing-card [listing]="listing" />
						</ng-template>
					}
				</div>
			</main>

			<footer class="fe-books-app__footer">
				Booted {{ totalCount.toLocaleString() }} listings in {{ bootMs }}&thinsp;ms · same engine,
				bound to Angular
			</footer>
		</div>
	`,
})
export class RealEstatePageComponent {
	private readonly _busy = injectEngineBusy();

	/** The word after the results-header count, the same in every app. */
	protected readonly resultNoun = RESULT_COPY['real-estate'].noun;

	/** Devtools panel visibility. Hidden by default so a first visit gets a clean page. */
	protected readonly isDevtoolsOpen = signal(false);

	/**
	 * The busy stream, exposed to the template.
	 *
	 * @remarks
	 * `_busy` is private and the panel needs `isBusy$` for its dimmed state, so this is the same
	 * object under a template-visible name rather than a second injection.
	 */
	protected readonly busy = this._busy;
	private readonly _engine = injectFilterEngine<Listing>();
	private readonly _routeData = injectRealEstateRouteData();

	/** Boot duration, rounded — footer telemetry, matching the other verticals. */
	protected readonly bootMs = Math.round(this._routeData.meta.bootMs);

	/** The corpus size, for the "filtered from N total" line. */
	protected readonly totalCount = this._routeData.meta.listingCount;

	/** The full result set. `<fe-result-grid>` owns the paging. */
	protected readonly results$: Observable<readonly Listing[]> = this._engine.results$;

	/** Sidebar-or-collapse, and the collapse's open state. */
	protected readonly breakpoint = trackDesktopBreakpoint();

	/** Stable card key — a bound method, so the grid's input identity is stable across ticks. */
	protected readonly listingKey = (listing: Listing): string => listing.id;

	/**
	 * The chip summarizer, pre-bound with this route's metro centroids.
	 *
	 * @remarks
	 * A field rather than an inline arrow in the template: an inline arrow is a fresh function
	 * identity on every change-detection pass, so the header's `summarize` input would read as
	 * changed on every tick and recompute the whole chip list.
	 */
	protected readonly summarizeListingRules: RuleSummarizer = (rules): readonly FilterSummary[] =>
		buildRuleSummaries(rules, { metroCenters: this._routeData.facets.metroCenters });

	/**
	 * The engine's most recent change EVENT, read only to be tracked.
	 *
	 * @remarks
	 * Anchored on the event and not on `lastChangeTimestamp$` for the reason `/books` documents at
	 * length: a timestamp is a millisecond-resolution value that two commits can share, and a
	 * collapsed emission would latch the indicator on. A `ChangeEvent` is freshly allocated per
	 * emission, so its identity always differs.
	 */
	private readonly _lastChangeEvent = toSignal(this._engine.lastChangeEvent$, {
		initialValue: null,
	});

	public constructor() {
		const stopUrlSync = startEngineUrlSync(this._engine);

		inject(DestroyRef).onDestroy(stopUrlSync);

		// Resolve the busy tracker on every settle. `markUserAction()` bumps a monotonic version and the
		// indicator stays lit while that version leads the resolved one — so marking without ever
		// resolving latches it on permanently after the first commit. Main-thread tier, so "settled" is
		// simply the next change snapshot.
		effect(() => {
			this._lastChangeEvent();
			this._busy.markResolvedAtLeast(this._busy.captureCurrentVersion());
		});
	}
}
