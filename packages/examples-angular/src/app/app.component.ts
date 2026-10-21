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
 * A route that also names a loader (`ROUTE_BOOT_LOADER_KEY`, `/books-server`) gets the hero screen
 * instead: the brand loader with the caption beneath it, the connecting screen every app shows while
 * the Node server sends the corpus. The loader sits in a `@defer` block, so its geometry stays out of
 * the startup chunks; the caption paints at once and the loader follows a moment later.
 *
 * ### A failed navigation shows the page-error screen
 *
 * A page whose code does not load (a failed `loadComponent`, or a resolver's `import()` of its data
 * module) or whose resolver rejects ends its navigation with `NavigationError`, and the router renders
 * nothing new: on a direct visit, nothing at all. So a `NavigationError` puts the shared page-error
 * screen (`<fe-page-error>`) in place of the routed page, as the other apps do, and the next
 * navigation that ends clears it. A resolver whose ENGINE could not boot rejects with a
 * `DatasetBootError` instead, and that gets the dataset's boot-failure screen (`<fe-boot-failure>`,
 * worded by `BOOT_FAILURE_COPY`) rather than the page-error one. A page already on screen is hidden behind it rather than destroyed,
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

import { ROUTE_BOOT_CAPTION_KEY, ROUTE_BOOT_LOADER_KEY } from './app.routes.js';
import { BrainSynapseComponent } from './brand/brain-synapse.component.js';
import { BootFailureComponent } from './shell/boot-failure.component.js';
import { DatasetBootError } from './shell/dataset-boot-error.js';
import { PageErrorComponent } from './shell/page-error.component.js';

/** A base for reading the path out of the router's URL, which carries no origin. */
const URL_BASE = 'https://angular.filterenginez.com';

/** What the root component draws while a booting route's resolver works. */
export interface RouteBootScreen {
	/** The caption. */
	readonly caption: string;
	/** The hero loader's accessible name, or `null` for the caption alone, inline. */
	readonly loaderLabel: string | null;
}

/**
 * The boot screen the recognized route names in its static data, if any.
 *
 * @remarks
 * Read from the deepest recognized route, which is the one whose page will render; its `data` already
 * holds its static `data` before any resolver has run.
 *
 * @param root - The root of the recognized router state.
 * @returns The caption and the optional loader, or `null` for a route that names no caption.
 */
export function routeBootScreen(root: ActivatedRouteSnapshot): RouteBootScreen | null {
	let leaf = root;

	while (leaf.firstChild !== null) {
		leaf = leaf.firstChild;
	}

	const caption: unknown = leaf.data[ROUTE_BOOT_CAPTION_KEY];
	const loaderLabel: unknown = leaf.data[ROUTE_BOOT_LOADER_KEY];

	if (typeof caption !== 'string' || caption.length === 0) {
		return null;
	}

	return { caption, loaderLabel: typeof loaderLabel === 'string' && loaderLabel.length > 0 ? loaderLabel : null };
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [BootFailureComponent, BrainSynapseComponent, PageErrorComponent, RouterOutlet],
	selector: 'fe-root',
	// The hero boot screen's layout. The caption itself is styled by `.fe-boot-caption--hero` in
	// ui-styles, like every app's; ui-styles has no boot-stage component.
	styles: [
		`
			.fe-route-booting {
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				gap: 24px;
				min-height: 100vh;
				padding: 0 24px;
			}
		`,
	],
	template: `
		@if (pageFailure(); as failure) {
			@if (bootFailure(); as boot) {
				<fe-boot-failure [dataset]="boot.dataset" [message]="boot.message" />
			} @else {
				<fe-page-error [error]="failure.error" />
			}
		} @else if (bootScreen(); as screen) {
			<!-- A main landmark: while the route resolves, the boot screen is all the page shows. -->
			@if (screen.loaderLabel; as loaderLabel) {
				<main class="fe-route-booting">
					@defer (on immediate) {
						<fe-brain-synapse [loaderLabel]="loaderLabel" [width]="520" />
					}
					<p class="fe-boot-caption fe-boot-caption--hero">{{ screen.caption }}</p>
				</main>
			} @else {
				<main>
					<p class="fe-boot-caption fe-boot-caption--inline">{{ screen.caption }}</p>
				</main>
			}
		}
		<!-- Layout-transparent, so the routed page stays a direct layout child of the root; hidden, not
		     destroyed, behind a failure. An inline display, which no stylesheet can override. -->
		<div [style.display]="pageFailure() === null ? 'contents' : 'none'">
			<router-outlet (activate)="isOutletActive.set(true)" (deactivate)="isOutletActive.set(false)" />
		</div>
	`,
})
export class AppComponent {
	/** The boot screen of the route being navigated to, while that navigation is in flight. */
	private readonly _pendingBootScreen = signal<RouteBootScreen | null>(null);

	/** The last navigation's failure, until a navigation ends; `null` while navigations succeed. */
	protected readonly pageFailure = signal<{ readonly error: unknown } | null>(null);

	/** Whether the outlet currently holds a page. */
	protected readonly isOutletActive = signal(false);

	/** The boot screen to draw: the pending route's, only while nothing else is on screen. */
	protected readonly bootScreen = computed(() => (this.isOutletActive() ? null : this._pendingBootScreen()));

	/** The failed navigation's engine boot, when that is what failed; `null` for any other failure. */
	protected readonly bootFailure = computed(() => {
		const error = this.pageFailure()?.error;

		return error instanceof DatasetBootError ? { dataset: error.dataset, message: error.message } : null;
	});

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
				this._pendingBootScreen.set(routeBootScreen(event.state.root));
			} else if (
				event instanceof NavigationEnd ||
				event instanceof NavigationCancel ||
				event instanceof NavigationError ||
				event instanceof NavigationSkipped
			) {
				this._pendingBootScreen.set(null);
			}
		});

		events
			.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
			.subscribe((event) => {
				applyPageMeta(document, verticalPageMeta('angular', new URL(event.urlAfterRedirects, URL_BASE).pathname));
			});
	}
}
