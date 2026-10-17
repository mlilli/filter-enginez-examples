/**
 * Root component — the router outlet, the document head kept on the route it shows, and the boot
 * caption a resolving route shows before it can render.
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
	imports: [RouterOutlet],
	selector: 'fe-root',
	template: `
		@if (bootCaption(); as caption) {
			<p class="fe-boot-caption fe-boot-caption--inline">{{ caption }}</p>
		}
		<router-outlet (activate)="isOutletActive.set(true)" (deactivate)="isOutletActive.set(false)" />
	`,
})
export class AppComponent {
	/** The caption of the route being navigated to, while that navigation is in flight. */
	private readonly _pendingBootCaption = signal<string | null>(null);

	/** Whether the outlet currently holds a page. */
	protected readonly isOutletActive = signal(false);

	/** The caption to draw: the pending route's, only while nothing else is on screen. */
	protected readonly bootCaption = computed(() => (this.isOutletActive() ? null : this._pendingBootCaption()));

	/** Subscribe to navigations for the component's life. */
	constructor() {
		const document = inject(DOCUMENT);
		const events = inject(Router).events.pipe(takeUntilDestroyed());

		events.subscribe((event) => {
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
