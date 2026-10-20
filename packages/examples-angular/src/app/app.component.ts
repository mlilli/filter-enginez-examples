/**
 * Root component — the router outlet, the document head kept on the route it shows, the boot
 * caption a resolving route shows before it can render, and the page-error screen a failed navigation
 * shows.
 *
 * @remarks
 * Kept deliberately thin so every route owns its own layout, matching the React / Svelte / Vue shells.
 * `ChangeDetectionStrategy.OnPush` is set on every component in this app: with zoneless change
 * detection, `OnPush` is the only strategy that actually describes what happens (dirty-marking driven
 * by `async` pipe emissions and signal reads), and stating it keeps the intent legible.
 *
 * ### The head follows the route
 *
 * One static shell (`src/index.html`) serves every route, so after each navigation this writes the
 * route's own title, description and canonical URL, or `noindex` for the not-found page, with the
 * values `examples-shared/page-meta` decides for all six apps. It listens for `NavigationEnd`, which
 * also ends the first navigation, and reads the path after redirects.
 *
 * ### A first frame before the engine boots
 *
 * `/books` and `/real-estate` boot their engines in route resolvers, and the router renders nothing
 * of a route until its resolvers settle. Opened directly, those pages would stay blank for the whole
 * download and boot. So once the router has recognized a route that names a boot caption in its
 * static data (`ROUTE_BOOT_CAPTION_KEY`, set in `app.routes.ts`), this component shows that caption —
 * the same idle sentence the other verticals' books and real-estate pages show while they boot — until
 * the navigation ends or the outlet holds a page.
 *
 * Only while the outlet is EMPTY. A navigation from a page already on screen, the landing hub for
 * instance, keeps that page until the new one activates, so the caption never sits beside a page or
 * replaces one that is still usable.
 *
 * ### A failed navigation shows the page-error screen
 *
 * A page whose code does not load (a failed `loadComponent`, or a resolver's `import()` of its data
 * module) or whose resolver rejects ends its navigation with `NavigationError`, and the router renders
 * nothing new: on a direct visit, nothing at all. So a `NavigationError` puts the shared page-error
 * screen (`<fe-page-error>`) in place of the routed page, as the other apps do, and the next
 * navigation that ends clears it. A page already on screen is hidden behind it rather than destroyed,
 * so the outlet and the router's state are left exactly as the router has them. `main.ts`'s
 * navigation-error handler still logs the error.
 *
 * @packageDocumentation
 */

import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
	type ActivatedRouteSnapshot,
	NavigationCancel,
	NavigationEnd,
	NavigationError,
	NavigationSkipped,
	Router,
	RouterOutlet,
	RoutesRecognized,
} from '@angular/router';
import { applyPageMeta, verticalPageMeta } from '@filter-enginez/examples-shared/page-meta';
import { filter } from 'rxjs';

import { ROUTE_BOOT_CAPTION_KEY } from './app.routes.js';
import { PageErrorComponent } from './shell/page-error.component.js';

/** A base for reading the path out of the router's URL, which carries no origin. */
const URL_BASE = 'https://angular.filterenginez.com';

/**
 * The boot caption the recognized route names in its static data, if any.
 *
 * @remarks
 * Read from the deepest recognized route, which is the one whose page will render; its `data` already
 * holds its static `data` before any resolver has run.
 *
 * @param root - The root of the recognized router state.
 * @returns The caption, or `null` for a route that names none.
 */
export function routeBootCaption(root: ActivatedRouteSnapshot): string | null {
	let leaf = root;

	while (leaf.firstChild !== null) {
		leaf = leaf.firstChild;
	}

	const caption: unknown = leaf.data[ROUTE_BOOT_CAPTION_KEY];

	return typeof caption === 'string' && caption.length > 0 ? caption : null;
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [PageErrorComponent, RouterOutlet],
	selector: 'fe-root',
	template: `
		@if (pageFailure(); as failure) {
			<fe-page-error [error]="failure.error" />
		} @else if (bootCaption(); as caption) {
			<!-- A main landmark: while the route resolves, the caption is all the page shows. -->
			<main>
				<p class="fe-boot-caption fe-boot-caption--inline">{{ caption }}</p>
			</main>
		}
		<!-- Layout-transparent, so the routed page stays a direct layout child of the root; hidden, not
		     destroyed, behind a failure. An inline display, which no stylesheet can override. -->
		<div [style.display]="pageFailure() === null ? 'contents' : 'none'">
			<router-outlet (activate)="isOutletActive.set(true)" (deactivate)="isOutletActive.set(false)" />
		</div>
	`,
})
export class AppComponent {
	/** The caption of the route being navigated to, while that navigation is in flight. */
	private readonly _pendingBootCaption = signal<string | null>(null);

	/** The last navigation's failure, until a navigation ends; `null` while navigations succeed. */
	protected readonly pageFailure = signal<{ readonly error: unknown } | null>(null);

	/** Whether the outlet currently holds a page. */
	protected readonly isOutletActive = signal(false);

	/** The caption to draw: the pending route's, only while nothing else is on screen. */
	protected readonly bootCaption = computed(() => (this.isOutletActive() ? null : this._pendingBootCaption()));

	/** Subscribe to navigations for the component's life. */
	constructor() {
		const document = inject(DOCUMENT);
		const events = inject(Router).events.pipe(takeUntilDestroyed());

		events.subscribe((event) => {
			if (event instanceof NavigationError) {
				this.pageFailure.set({ error: event.error });
			} else if (event instanceof NavigationEnd) {
				this.pageFailure.set(null);
			}

			if (event instanceof RoutesRecognized) {
				this._pendingBootCaption.set(routeBootCaption(event.state.root));
			} else if (
				event instanceof NavigationEnd ||
				event instanceof NavigationCancel ||
				event instanceof NavigationError ||
				event instanceof NavigationSkipped
			) {
				this._pendingBootCaption.set(null);
			}
		});

		events
			.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
			.subscribe((event) => {
				applyPageMeta(document, verticalPageMeta('angular', new URL(event.urlAfterRedirects, URL_BASE).pathname));
			});
	}
}
