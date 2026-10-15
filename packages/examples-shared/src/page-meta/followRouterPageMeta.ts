/**
 * `followRouterPageMeta` — keep the document head's title, description and canonical link on the
 * route a data router is showing.
 *
 * @remarks
 * For the apps built on React Router's data router (the two React demo apps and the documentation
 * site): its `state.location` is the route being shown and `subscribe` reports every navigation, so
 * this applies the route's metadata once at startup and again on every change of path. A change of
 * query or hash alone (a filter state in `?f=`) is not a new page, and writes nothing.
 *
 * The metadata may arrive asynchronously, because the React apps load the documentation's titles on
 * demand. A resolution that arrives after a newer navigation has started is dropped, so a slow lookup
 * can never write the previous route's canonical over the current one.
 *
 * Typed structurally, against the two members it reads, so this module needs nothing from React Router.
 *
 * @packageDocumentation
 */

import { applyPageMeta } from './applyPageMeta.js';
import { type PageMeta } from './pageMeta.js';

/** The router state this module reads: the location being shown. */
export interface RouterLocationState {
	/** The location being shown. */
	readonly location: { readonly pathname: string };
}

/** The part of a data router this module uses. */
export interface PageMetaRouter {
	/** The current state. */
	readonly state: RouterLocationState;
	/**
	 * Subscribe to state changes.
	 *
	 * @param listener - Called with the new state on every change.
	 * @returns An unsubscribe.
	 */
	subscribe: (listener: (state: RouterLocationState) => void) => () => void;
}

/**
 * Apply each route's metadata as the router navigates.
 *
 * @param router - The app's data router.
 * @param resolve - The metadata for a path, now or once loaded.
 * @param document - The document to write; the app's own by default.
 * @returns A stop function, which also drops any resolution still in flight.
 */
export function followRouterPageMeta(
	router: PageMetaRouter,
	resolve: (pathname: string) => PageMeta | Promise<PageMeta>,
	document: Document = globalThis.document,
): () => void {
	let currentPathname = router.state.location.pathname;
	/** Incremented on every new path, so a resolution can tell whether it is still the newest. */
	let navigation = 0;

	const show = (pathname: string): void => {
		navigation += 1;
		const issuedFor = navigation;

		void Promise.resolve(resolve(pathname)).then(
			(meta) => {
				if (issuedFor === navigation) {
					applyPageMeta(document, meta);
				}
			},
			// A lookup that fails (a chunk that cannot load) leaves the head as the shell or the previous
			// route left it; the page itself reports the failure.
			() => undefined,
		);
	};

	show(currentPathname);
	const unsubscribe = router.subscribe((state) => {
		if (state.location.pathname === currentPathname) {
			return;
		}
		currentPathname = state.location.pathname;
		show(currentPathname);
	});

	return () => {
		navigation += 1;
		unsubscribe();
	};
}
