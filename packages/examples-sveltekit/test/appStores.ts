/**
 * The `$app/stores` module this package's component tests run against.
 *
 * @remarks
 * SvelteKit generates its `$app/*` modules from its own Vite plugin, and `vitest.config.ts` compiles
 * components with the plain Svelte plugin instead, so under test there is no `$app/stores` to import.
 * The config maps that one specifier here, which is what lets a component read the page the way the
 * app does (`$page.url`) and still be mounted by `@testing-library/svelte` — the header brand, the
 * Compare button, and the hub and error routes all do.
 *
 * The {@link page} store is the page a browser visit to jsdom's current address would produce: it
 * reads `window.location` each time a component subscribes. A test chooses the page by navigating
 * jsdom (`window.history.replaceState(null, '', '/wine')`) before it renders, as a visitor would by
 * opening that address; an error route's status and error are set with {@link showTestPageError}.
 * Only `page` is provided, because it is the only store the app reads; a component importing another
 * fails its test at import, loudly, rather than reading a stand-in nobody wrote.
 *
 * @packageDocumentation
 */

import type { Page } from '@sveltejs/kit';
import type { Readable } from 'svelte/store';

/** The status and error of the page, as SvelteKit reports them on an error route. */
interface TestPageOutcome {
	/** The error SvelteKit hands its error page, or `null` on a page that rendered. */
	readonly error: App.Error | null;
	/** The HTTP status of the response. */
	readonly status: number;
}

/** A page that rendered: status 200, no error. */
const RENDERED_PAGE: TestPageOutcome = { error: null, status: 200 };

/** What the next subscription reports for the page's status and error. */
let pageOutcome: TestPageOutcome = RENDERED_PAGE;

/**
 * Make the page an error route's: the next component to subscribe sees this status and error.
 *
 * @param status - The HTTP status SvelteKit would render the error page with, e.g. `404`.
 * @param message - The error's message, as SvelteKit's `error(status, message)` would set it.
 */
export function showTestPageError(status: number, message: string): void {
	pageOutcome = { error: { message }, status };
}

/** Make the page a rendered one again (status 200, no error). Call it after a test that set an error. */
export function resetTestPage(): void {
	pageOutcome = RENDERED_PAGE;
}

/**
 * Build the page a visit to jsdom's current address would produce.
 *
 * @returns A page whose URL is `window.location`'s, with no route data.
 */
function currentPage(): Page {
	return {
		data: {},
		error: pageOutcome.error,
		form: null,
		params: {},
		route: { id: null },
		state: {},
		status: pageOutcome.status,
		// SvelteKit brands the pathname as one of the app's resolved paths; jsdom's is a plain string.
		url: new URL(window.location.href) as Page['url'],
	};
}

/**
 * SvelteKit's `page` store, reporting the page jsdom is on.
 *
 * @remarks
 * It emits once, on subscription. A test that wants a different page renders the component again
 * after navigating, so nothing here needs to notice the navigation.
 */
export const page: Readable<Page> = {
	subscribe(run) {
		run(currentPage());

		return function unsubscribeFromTestPage(): void {
			// One emission and no listeners kept, so there is nothing to release.
		};
	},
};
