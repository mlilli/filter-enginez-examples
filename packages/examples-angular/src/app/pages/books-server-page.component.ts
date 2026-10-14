/**
 * `<fe-books-server-page>` — the Angular books demo with the filtering moved off the browser.
 *
 * @remarks
 * **The browser runs no filtering on this route.** Every chip, slider and keystroke round-trips to the
 * `@filter-enginez/examples-server` Node process, which owns the config → results decision; the tab
 * holds only a resident corpus copy so it can turn returned indices back into records.
 *
 * ### What this proves that `/books` doesn't
 *
 * `/books` demonstrates that the RxJS surface can bind a main-thread engine. This route demonstrates
 * that the *async engine abstraction* composes with that surface — that `FilterEngineAsync` →
 * `createRxJsEngineFromAsync` → `RxJsEngine` is a real seam and not a signals-only one. The evidence is
 * what ISN'T here: `<fe-books-filter-panel>`, `<fe-results-header>` and `<fe-book-card>` are the exact
 * components `/books` mounts, imported unchanged. They only ever touch `injectFilterEngine()` and
 * `injectEngineBusy()`, and neither of those has any idea where the compute happens.
 *
 * Exactly one line of shared code knows the difference: the panel's `bundle` routes through
 * `engine.asyncEngine.applyFiltersAndQuery` when an async engine is present, because the sync `.core`
 * shim throws on that method. The React apps' shared `filterBundle` module applies the identical
 * one-branch rule. See `books-filter-panel.component.ts`'s class remarks.
 *
 * ### Why this component tolerates a null engine
 *
 * A route whose engine lives in another process has a failure mode the in-browser routes don't: the
 * process isn't running. Rather than let the resolver reject — which fails the navigation and leaves
 * whatever was on screen before, or nothing — `booksServerResolver` catches and reports the failure as
 * data. This component renders the offline panel in that case, and never touches the engine.
 *
 * That is safe because `provideFilterEngineFactory` is a `useFactory` provider: Angular runs the
 * factory on first injection, not when the providers array is evaluated. No descendant that injects the
 * engine is instantiated on the offline branch, so the factory never runs and never sees the `null`.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';
import type { RxJsEngine } from '@filter-enginez/reactive-rxjs';

import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
	injectEngineBusy,
	provideEngineBusy,
	provideFilterEngineFactory,
} from '@filter-enginez/angular-rxjs';
import { type Observable } from 'rxjs';

import { BOOKS_SERVER_ROUTE_DATA_KEY, type BooksServerRouteData } from '../app.routes.js';
import { BookCardComponent } from '../books/book-card.component.js';
import { booksBusyStream } from '../books/books-busy.js';
import { BooksFilterPanelComponent } from '../books/books-filter-panel.component.js';
import { FiltersToggleComponent } from '../controls/filters-toggle.component.js';
import {
	ResultCardDirective,
	ResultGridComponent,
} from '../controls/result-grid.component.js';
import { ResultsHeaderComponent } from '../controls/results-header.component.js';
import { AppHeaderBrandComponent } from '../shell/app-header-brand.component.js';
import { CompareLinkButtonComponent } from '../url/compare-link-button.component.js';
import { CopyLinkButtonComponent } from '../url/copy-link-button.component.js';
import { UrlFormatToggleComponent } from '../url/url-format-toggle.component.js';
import { startEngineUrlSync } from '../url/url-state.js';
import { trackDesktopBreakpoint } from '../viewport/desktop-breakpoint.js';

/** The command that starts the filtering server, quoted verbatim on the offline screen. */
const SERVE_COMMAND = 'pnpm --filter @filter-enginez/examples-server serve:api';

/**
 * Pull the resolved server-backed bundle off the activated route.
 *
 * @remarks
 * Safe to assert non-null for the same reason `/books` is: the router will not activate this component
 * until `booksServerResolver` settles. Unlike `/books`, though, "settled" here may mean "settled with
 * an error" — hence the nullable `engine`.
 *
 * @returns The engine (or `null`) plus boot metadata.
 */
function injectBooksServerRouteData(): BooksServerRouteData {
	return inject(ActivatedRoute).snapshot.data[BOOKS_SERVER_ROUTE_DATA_KEY] as BooksServerRouteData;
}

/**
 * Narrow the resolved route data to a live engine, for the DI factory.
 *
 * @remarks
 * Only ever reached on the healthy branch — see the class remarks on why the factory can't run when the
 * boot failed. The throw is a genuine "unreachable" guard, not a runtime path.
 *
 * @returns The booted engine.
 * @throws When called on a failed boot, which would be a bug in the template's `@if`.
 */
function injectBooksServerEngine(): RxJsEngine<Book> {
	const { engine } = injectBooksServerRouteData();

	if (engine === null) {
		throw new Error('books-server: the engine was injected on a route whose boot failed.');
	}

	return engine;
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		AppHeaderBrandComponent,
		AsyncPipe,
		BookCardComponent,
		BooksFilterPanelComponent,
		CompareLinkButtonComponent,
		CopyLinkButtonComponent,
		FiltersToggleComponent,
		ResultCardDirective,
		ResultGridComponent,
		ResultsHeaderComponent,
		RouterLink,
		UrlFormatToggleComponent,
	],
	providers: [
		provideFilterEngineFactory<Book>(injectBooksServerEngine),
		provideEngineBusy(booksBusyStream),
	],
	selector: 'fe-books-server-page',
	template: `
		@if (error !== null) {
			<main class="fe-server-offline">
				<p class="fe-server-offline__title">Can't reach the filter server</p>
				<p class="fe-server-offline__detail">{{ error.message }}</p>
				<p class="fe-server-offline__hint">
					This route filters on a Node process rather than in your browser. Start it with
					<code class="fe-server-offline__command">{{ serveCommand }}</code>
					and reload.
				</p>
				<a class="fe-server-offline__back" routerLink="/books">Use the in-browser demo instead →</a>
			</main>
		} @else {
			<div class="fe-books-app">
				<header class="fe-books-app__header">
					<nav fe-app-header-brand page="Books" tier="server"></nav>

					<div class="fe-books-app__url-controls">
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
						<!-- Hidden, not removed, and fe-filter-collapse restores the flex height chain the
						     bare wrapper severed. Full rationale on the same element in books-page. -->
						<div class="fe-filter-collapse" [hidden]="!breakpoint.shouldShowPanel()">
							<fe-books-filter-panel />
						</div>
					</aside>

					<section class="fe-books-app__results">
						<fe-results-header noun="books" />

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
					Connected to {{ totalCount.toLocaleString() }} books in {{ bootMs }}&thinsp;ms · every
					filter runs on the Node server
				</footer>
			</div>
		}
	`,
})
export class BooksServerPageComponent {
	private readonly _busy = injectEngineBusy();

	private readonly _routeData = injectBooksServerRouteData();

	/** Boot duration, rounded — here it measures the corpus fetch + initial state pull, not a build. */
	protected readonly bootMs = Math.round(this._routeData.bootMs);

	/** Set when the server was unreachable. Non-null switches the template to the offline panel. */
	protected readonly error: Error | null = this._routeData.error;

	/** The command that starts the server, for the offline panel. */
	protected readonly serveCommand = SERVE_COMMAND;

	/** The corpus size, for the "filtered from N total" line. Zero on the offline branch. */
	protected readonly totalCount = this._routeData.bookCount;

	/**
	 * The full result set — `<fe-result-grid>` pages it, exactly as on `/books`.
	 *
	 * @remarks
	 * `null` on the offline branch, where the template never reads it. A field rather than a getter so
	 * the `| async` pipe keeps subscribing to one stream instead of a fresh pipe per change detection.
	 */
	protected readonly results$: Observable<readonly Book[]> | null = null;

	/** Sidebar-or-drawer, and the drawer's open state. */
	protected readonly breakpoint = trackDesktopBreakpoint();

	/** Stable card key — a bound method, so the grid's input identity is stable across ticks. */
	protected readonly bookKey = (book: Book): string => book.id;

	public constructor() {
		const { engine } = this._routeData;

		if (engine === null) {
			return;
		}

		// Same URL mirroring as `/books`. `startEngineUrlSync` already branches on `asyncEngine` for
		// `exportConfig` (the sync shim throws on it), which is why it needs no change here.
		const stopUrlSync = startEngineUrlSync(engine);

		inject(DestroyRef).onDestroy(stopUrlSync);

		this.results$ = engine.results$;

		// ─── Resolve the busy tracker on every settle ────────────────────────────────────────────
		// The same settle-resolves-the-tracker pattern as `/books`, and materially more useful here. On
		// the main-thread engine "computing" is over before the browser paints; over HTTP it lasts an
		// actual round-trip, so
		// this is the route where the version-based tracker earns its design: `markUserAction()`
		// captures a version before the request goes out, and the indicator stays lit until a
		// `lastChange` snapshot lands to resolve it. Marking without ever resolving would latch the
		// indicator on permanently after the first commit.
		const lastChangeAt = toSignal(engine.lastChangeTimestamp$, { requireSync: true });

		effect(() => {
			lastChangeAt();
			this._busy.markResolvedAtLeast(this._busy.captureCurrentVersion());
		});
	}
}
