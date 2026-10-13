/**
 * `<fe-books-page>` — the Angular books demo.
 *
 * @remarks
 * **This is the vertical slice that proves the RxJS surface**, at nine-rule parity with the other
 * verticals. The page itself is only a shell — the panel and the header own their own engine reads via
 * DI. What it demonstrates end to end:
 *
 *   - **Reads** flow `engine.<field>$ | async`. No adapter, no wrapper, no `useSyncExternalStore`
 *     equivalent — Angular consumes the engine's `Observable`s natively, which is why
 *     `@filter-enginez/angular-rxjs` is DI plumbing and nothing more.
 *   - **Writes** are `engine.core.addRule(...)` — byte-identical to the React, Svelte, Vue and vanilla
 *     verticals, because `SignalsEngine.core`, `RxJsEngine.core` and a bare engine are all the same
 *     `FilterEngine<T>`. Only the read path was ever framework-shaped.
 *   - **DI** is component-scoped: the route resolver booted the engine (see `app.routes.ts`), and this
 *     component republishes it through `provideFilterEngineFactory` so every descendant can
 *     `injectFilterEngine()` without a single `@Input`.
 *
 * The busy tracker comes from `books-busy.ts` as a module singleton rather than a per-mount factory, so
 * the panel's commits and the header's indicator observe one monotonic version counter even across a
 * re-navigation that reuses the cached engine. **Both halves of that counter have to be driven** — see
 * the settle effect in the constructor.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
	injectEngineBusy,
	injectFilterEngine,
	provideEngineBusy,
	provideFilterEngineFactory,
} from '@filter-enginez/angular-rxjs';
import { verticalSubtitle } from '@filter-enginez/examples-shared/verticals';
import { type Observable } from 'rxjs';

import { BOOKS_ROUTE_DATA_KEY, type BooksRouteData } from '../app.routes.js';
import { BookCardComponent } from '../books/book-card.component.js';
import { booksBusyStream } from '../books/books-busy.js';
import { BooksFilterPanelComponent } from '../books/books-filter-panel.component.js';
import { DevtoolsPanelComponent } from '../controls/devtools-panel.component.js';
import { FiltersToggleComponent } from '../controls/filters-toggle.component.js';
import {
	ResultCardDirective,
	ResultGridComponent,
} from '../controls/result-grid.component.js';
import { ResultsHeaderComponent } from '../controls/results-header.component.js';
import { TimeTravelControlsComponent } from '../controls/time-travel-controls.component.js';
import { CompareLinkButtonComponent } from '../url/compare-link-button.component.js';
import { CopyLinkButtonComponent } from '../url/copy-link-button.component.js';
import { UrlFormatToggleComponent } from '../url/url-format-toggle.component.js';
import { startEngineUrlSync } from '../url/url-state.js';
import { trackDesktopBreakpoint } from '../viewport/desktop-breakpoint.js';

/**
 * Pull the resolved books bundle off the activated route.
 *
 * @remarks
 * Safe to assert non-null: the router will not activate this component until `booksResolver` settles,
 * which is precisely why the boot lives in a resolver rather than in an effect.
 *
 * @returns The booted engine + boot metadata.
 */
function injectBooksRouteData(): BooksRouteData {
	return inject(ActivatedRoute).snapshot.data[BOOKS_ROUTE_DATA_KEY] as BooksRouteData;
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		AsyncPipe,
		DevtoolsPanelComponent,
		BookCardComponent,
		BooksFilterPanelComponent,
		CompareLinkButtonComponent,
		CopyLinkButtonComponent,
		FiltersToggleComponent,
		ResultCardDirective,
		ResultGridComponent,
		ResultsHeaderComponent,
		RouterLink,
		TimeTravelControlsComponent,
		UrlFormatToggleComponent,
	],
	providers: [
		provideFilterEngineFactory<Book>(() => injectBooksRouteData().engine),
		provideEngineBusy(booksBusyStream),
	],
	selector: 'fe-books-page',
	template: `
		<div class="fe-books-app">
			<header class="fe-books-app__header">
				<a class="fe-books-app__brand" routerLink="/" aria-label="Filter EngineZ — back to the dataset hub">
					<img class="fe-books-app__mark" src="/mark.svg" width="36" height="36" alt="" />
					<span class="fe-books-app__wordmark">
						<span class="fe-books-app__name">Filter EngineZ</span>
						<span class="fe-books-app__subtitle">{{ subtitle }}</span>
					</span>
				</a>

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
					<fe-compare-link-button dataset="books" />
				</div>
			</header>

			<main class="fe-books-app__main">
				<aside class="fe-books-app__sidebar">
					@if (!breakpoint.isDesktop()) {
						<fe-filters-toggle
							[isOpen]="breakpoint.isFilterOpen()"
							(toggled)="breakpoint.toggleFilters()"
						/>
					}
					<!--
						Hidden, NOT removed. An @if would destroy and rebuild the panel on every mobile
						filter close, discarding each control's uncommitted local state.

						fe-filter-collapse gives the wrapper a display ONLY via :not([hidden]) — an
						unconditional one would beat the hidden attribute, which is a UA rule and nothing
						more. Without any display it is a plain block, and a plain block in this slot severs
						the flex height chain between the aside's max-height and the panel's scroller, so
						the scroller never bounds and the bottom sections become unreachable.
					-->
					<div class="fe-filter-collapse" [hidden]="!breakpoint.shouldShowPanel()">
						<fe-books-filter-panel />
					</div>
				</aside>

				<section class="fe-books-app__results">
					<fe-results-header noun="books" />

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
							[card]="bookCard"
							[itemKey]="bookKey"
							emptyTitle="No books match the current filters."
							emptyHint="Try a shorter search term."
							listLabel="Matching books"
							scrollRegionLabel="Book results"
							noun="books"
						/>
						<ng-template #bookCard [feResultCardOf]="results" let-book>
							<fe-book-card [book]="book" />
						</ng-template>
					}
				</section>
			</main>

			<footer class="fe-books-app__footer">
				Booted {{ totalCount.toLocaleString() }} books in {{ bootMs }}&thinsp;ms · same engine, bound
				to Angular
			</footer>
		</div>
	`,
})
export class BooksPageComponent {
	private readonly _busy = injectEngineBusy();

	/** Header subtitle — the dataset and the stack, from the shared registry. */
	protected readonly subtitle = verticalSubtitle('Books', 'angular');

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
	private readonly _engine = injectFilterEngine<Book>();
	private readonly _meta = injectBooksRouteData().meta;

	/** Boot duration, rounded — footer telemetry, matching the other verticals. */
	protected readonly bootMs = Math.round(this._meta.bootMs);

	/** The corpus size, for the "filtered from N total" line. */
	protected readonly totalCount = this._meta.bookCount;

	/**
	 * The full result set. `<fe-result-grid>` does its own paging — render limit, sentinel observer,
	 * hard cap — so this is deliberately unsliced.
	 */
	protected readonly results$: Observable<readonly Book[]> = this._engine.results$;

	/** Sidebar-or-drawer, and the drawer's open state. */
	protected readonly breakpoint = trackDesktopBreakpoint();

	/**
	 * Stable card key. A bound method rather than an inline arrow: an arrow in the template is a new
	 * function identity every change-detection pass, which makes the grid's `itemKey` input look
	 * changed on every tick.
	 */
	protected readonly bookKey = (book: Book): string => book.id;

	/**
	 * The engine's most recent change EVENT. Read only to be *tracked* — its value is never
	 * displayed; it exists so the settle effect below re-runs once per recompute.
	 *
	 * @remarks
	 * Anchored on the event rather than on `lastChangeTimestamp$`. A timestamp is a VALUE, so two
	 * changes carrying the same value are indistinguishable to `distinctUntilChanged`, and `Date.now()`
	 * is only millisecond-resolution: two commits inside one millisecond collapse into one emission,
	 * and a settle anchored on them would latch the indicator on.
	 *
	 * A `ChangeEvent` is freshly allocated per emission, so its identity always differs and
	 * `lastChangeEvent$` deliberately carries no dedupe. React, Vue and Svelte get the same property by
	 * composing an object that INCLUDES the event; here the anchor is the event itself, so it does not
	 * depend on a value happening to change.
	 */
	private readonly _lastChangeEvent = toSignal(this._engine.lastChangeEvent$, { initialValue: null });

	public constructor() {
		// Mirror every engine change into the address bar (debounced). Torn down with the route so a
		// navigation away doesn't leave a subscription rewriting someone else's URL.
		const stopUrlSync = startEngineUrlSync(this._engine);

		inject(DestroyRef).onDestroy(stopUrlSync);

		// ─── Resolve the busy tracker on every settle ────────────────────────────────────────────
		// `markUserAction()` bumps a monotonic version; the indicator is "computing" for exactly as
		// long as that version leads the RESOLVED version. Marking without ever resolving therefore
		// latches the indicator on permanently after the first filter commit — which is precisely what
		// this effect prevents.
		//
		// The books engine is synchronous main-thread, so "settled" is simply the next `lastChange`
		// snapshot: advancing the resolved version there clears the indicator a tick after the
		// recompute lands. Exact parity with Vue's `watch(lastChange, …, { immediate: true })`, Svelte's
		// `$effect`, and React's `useEffect(() => markResolvedAtLeast(captureCurrentVersion()))`.
		//
		// (Async tiers — the worker bridge and the server-backed engine — are the reason the tracker is
		// version-based rather than a boolean: they capture a version BEFORE the round-trip and resolve
		// that same version after, so a stale response can't clear a newer action's spinner.)
		effect(() => {
			this._lastChangeEvent();
			this._busy.markResolvedAtLeast(this._busy.captureCurrentVersion());
		});
	}
}
