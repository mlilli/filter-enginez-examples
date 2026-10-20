/**
 * `router` — a ~60-line History-API router, hand-written because this vertical has no framework.
 *
 * @remarks
 * The framework-less counterpart to React Router / SvelteKit's file routes / Vue Router. A route is
 * just a path plus a `render` function that populates its mount element and returns an optional
 * teardown — the same "mount / unmount" contract every framework binding gives you, expressed
 * directly. Each render gets its OWN mount element, which is what makes a navigation race safe here
 * without every route having to check whether it is still current; see {@link createRouteMount}.
 *
 * Navigation is intercepted at the document level: any same-origin `<a href>` without a modifier key or
 * `target` is handled client-side via `history.pushState`, so ordinary anchors behave like SPA links
 * without a `<Link>` component (this is what SvelteKit does natively and Vue does NOT — hence the Vue
 * app's `<RouterLink>` requirement).
 *
 * A route whose `render` throws or rejects shows the shared page-error screen in its mount
 * (`shell/pageErrorScreen.ts`), so a page whose code fails to load is never a blank page.
 *
 * @packageDocumentation
 */

import { createPageErrorScreen } from './shell/pageErrorScreen.js';

/** Tear down whatever a route's `render` set up (listeners, engine subscriptions, observers). */
export type RouteTeardown = () => void;

/**
 * What a route's `render` hands back: a teardown, or `undefined` when the route holds no resources.
 * Spelled `undefined` rather than `void` so it composes in a union (a bare `void` in a union is both a
 * lint error and a genuine type smell — it would swallow any return value).
 */
export type RouteRenderResult = RouteTeardown | undefined;

/** One route: an exact path (or the `'*'` catch-all) and its renderer. */
export interface Route {
	/** Exact pathname, or `'*'` for the catch-all (matched last). */
	readonly path: string;
	/**
	 * Populate this route's mount element.
	 *
	 * @remarks
	 * The element is EMPTY, already in the document, and belongs to this render alone — routes are
	 * free to `replaceChildren()` it after an async boot (all of them do), because a superseded
	 * render's mount is detached before its write lands. See {@link createRouteMount}.
	 *
	 * @param mount - This render's mount element, already attached beneath the app root.
	 * @returns A teardown run before the next navigation, or `undefined` when there's nothing to undo.
	 */
	readonly render: (mount: HTMLElement) => Promise<RouteRenderResult> | RouteRenderResult;
}

/** Handle returned by {@link startRouter} so callers (and tests) can navigate + tear down. */
export interface RouterHandle {
	/** Programmatically navigate (pushes history, then renders). */
	readonly navigate: (path: string) => void;
	/** Detach every listener and tear down the current route. */
	readonly dispose: () => void;
}

/**
 * Create the element one render paints into.
 *
 * @remarks
 * ### 🔴 Why each render gets its own element rather than sharing the app root
 *
 * Every page in this app boots asynchronously and then calls `replaceChildren()` on whatever it was
 * handed, to swap its boot screen for the real view. Handed the shared app root, a route that loses
 * a navigation race does that AFTER the winner has already painted — so clicking Books and then
 * Wine leaves the wine URL displaying the books app, because the slower boot wipes the live route
 * and installs itself. Discarding the loser's teardown (below) does not help: the damage is the
 * write, and the write happens inside `render` before any token can be compared.
 *
 * A per-render element closes that off structurally. `renderPath` detaches the previous mount as it
 * installs the next, so a superseded route's `replaceChildren()` and appends land on a node that is
 * no longer in the document. Nothing is forgotten and no route has to remember to check anything.
 *
 * ### `display: contents`, and why it is inline
 *
 * The mount must not exist for layout. `.fe-books-app` is `min-height: 100vh` and the sidebar card
 * is `position: sticky` with `max-height: calc(100vh - 2rem)`; both are viewport-anchored, so a
 * plain block here would probably be harmless — but a stray block wrapper is exactly what severs the
 * panel-scroller height chain (see `ui-styles`' `.fe-filter-collapse` block).
 * `display: contents` removes the box entirely, so the route's own root remains a direct layout
 * child of the app root. A bare `<div>` carries no implicit role, so this raises none of the
 * accessibility problems `display: contents` has on semantic elements.
 *
 * It is written inline rather than as a class in `app.css` — the one place the house styling rules
 * allow for it — because this is structural router plumbing, not a visual property of a
 * designed component, and because an inline declaration cannot be defeated by a stylesheet that
 * failed to load or by a later tidy-up of a file whose header says it holds no app CSS.
 *
 * @returns A fresh, layout-transparent mount element.
 *
 * @internal
 */
function createRouteMount(): HTMLElement {
	const mount = document.createElement('div');

	mount.style.display = 'contents';

	return mount;
}

/** Optional hooks for {@link startRouter}. */
export interface RouterOptions {
	/**
	 * Called with the pathname each time a route starts rendering, the first included — before the
	 * route's own boot, so the document head names the page while it loads. `main.ts` writes the page's
	 * title, description and canonical URL here (`examples-shared/page-meta`).
	 */
	readonly onNavigate?: (pathname: string) => void;
}

/**
 * Start the router: render the current location beneath `container`, then keep it in sync with
 * history navigation and intercepted link clicks.
 *
 * @param container - The app root element. The router owns its children.
 * @param routes - The route table; the `'*'` entry (if any) is the catch-all.
 * @param options - Optional hooks; see {@link RouterOptions}.
 * @returns A handle exposing `navigate` + `dispose`.
 */
export function startRouter(container: HTMLElement, routes: readonly Route[], options: RouterOptions = {}): RouterHandle {
	const { onNavigate } = options;
	let teardown: RouteRenderResult;
	// Monotonic token so a superseded render's TEARDOWN can't overwrite the live route's. Its paint
	// is handled separately, and structurally, by the per-render mount — see `createRouteMount`.
	let renderToken = 0;

	/** Pick the route for a pathname: exact match first, then the `'*'` catch-all. */
	function resolve(pathname: string): Route | undefined {
		return routes.find((route) => route.path === pathname) ?? routes.find((route) => route.path === '*');
	}

	/** Tear down the current route, then render the one for `pathname` into a fresh mount. */
	async function renderPath(pathname: string): Promise<void> {
		const token = (renderToken += 1);

		teardown?.();
		teardown = undefined;
		onNavigate?.(pathname);

		const route = resolve(pathname);

		if (route === undefined) {
			container.replaceChildren();

			return;
		}
		const mount = createRouteMount();

		// Installing the new mount is what detaches the previous one, so this single line both
		// clears the old route and gives the new one a surface no other render can reach.
		container.replaceChildren(mount);

		let result: RouteRenderResult;

		try {
			result = await route.render(mount);
		} catch (error) {
			// A page whose code did not load (a rejected `import()`) or whose render threw: its mount
			// shows the page-error screen rather than staying empty. A superseded route's failure lands
			// on its detached mount, as its paint would have, and it has no resources to release.
			mount.replaceChildren(createPageErrorScreen(error));

			return;
		}

		// A newer navigation started while this route was still resolving. Whatever it just painted
		// went into a mount that navigation already detached, so only the route's own resources are
		// left to release — and the live route's teardown must not be overwritten with this one.
		if (token !== renderToken) {
			result?.();

			return;
		}
		teardown = result;
	}

	function navigate(path: string): void {
		if (path !== window.location.pathname) {
			window.history.pushState({}, '', path);
		}
		void renderPath(window.location.pathname);
	}

	/** Intercept plain same-origin left-clicks on anchors so they route client-side. */
	function handleClick(event: MouseEvent): void {
		if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
			return;
		}
		const anchor = (event.target as HTMLElement | null)?.closest('a');

		if (anchor === null || anchor === undefined) {
			return;
		}
		const href = anchor.getAttribute('href');

		// Leave hash links, external targets, downloads, and absolute URLs to the browser.
		if (href === null || !href.startsWith('/') || anchor.hasAttribute('download') || anchor.target !== '') {
			return;
		}
		event.preventDefault();
		navigate(href);
	}

	function handlePopState(): void {
		void renderPath(window.location.pathname);
	}

	document.addEventListener('click', handleClick);
	window.addEventListener('popstate', handlePopState);
	void renderPath(window.location.pathname);

	return {
		dispose: () => {
			document.removeEventListener('click', handleClick);
			window.removeEventListener('popstate', handlePopState);
			teardown?.();
			teardown = undefined;
		},
		navigate,
	};
}
