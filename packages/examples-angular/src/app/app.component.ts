/**
 * Root component — the router outlet, and the document head kept on the route it shows.
 *
 * @remarks
 * Kept deliberately empty so every route owns its own layout, matching the React / Svelte / Vue shells.
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
 * @packageDocumentation
 */

import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { applyPageMeta, verticalPageMeta } from '@filter-enginez/examples-shared/page-meta';
import { filter } from 'rxjs';

/** A base for reading the path out of the router's URL, which carries no origin. */
const URL_BASE = 'https://angular.filterenginez.com';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [RouterOutlet],
	selector: 'fe-root',
	template: '<router-outlet />',
})
export class AppComponent {
	/** Subscribe to navigations for the component's life. */
	constructor() {
		const document = inject(DOCUMENT);

		inject(Router)
			.events.pipe(
				filter((event): event is NavigationEnd => event instanceof NavigationEnd),
				takeUntilDestroyed(),
			)
			.subscribe((event) => {
				applyPageMeta(document, verticalPageMeta('angular', new URL(event.urlAfterRedirects, URL_BASE).pathname));
			});
	}
}
