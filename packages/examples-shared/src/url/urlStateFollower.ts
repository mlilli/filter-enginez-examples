/**
 * `@filter-enginez/examples-shared/url-state-follower` — keep a route's engine following the `?f=`
 * parameter while the route stays mounted, in the four apps whose URL layer is their own.
 *
 * @remarks
 * The React apps bind the engine to the URL with `@filter-enginez/url-state-router`'s
 * `<FilterEngineUrlSync>`, which loads every `?f=` the router renders, Back and Forward included. Vue,
 * SvelteKit, Angular and the framework-free app write `?f=` themselves, with `history.replaceState`
 * (each app's `urlState`), and read it once, when a route boots. This module gives those four the
 * other half, with the same semantics, so the six behave as one:
 *
 * - **What triggers a look at the URL.** The browser's `popstate` (Back, Forward, and any other
 *   history traversal), and {@link notifyUrlNavigation}, which each app's router calls after an in-app
 *   navigation that kept the route and changed its query. `history.replaceState` fires neither, so the
 *   app's own debounced writes never trigger one.
 * - **What gets applied.** A `?f=` that differs from the value last seen is decoded and loaded into the
 *   route's EXISTING engine with `loadConfig`, the same restore path the route's boot takes: no
 *   reload, no re-mount, no new engine, no corpus fetch. Every surface that reads the engine — the
 *   panel, the pills, the count, the results, the preset chips — follows from that one call.
 * - **What is skipped.** A URL on another path: the navigation is leaving the route, whose engine
 *   (cached for the next visit, in most apps) must not take another dataset's filter state while the
 *   router tears the route down; in the React apps the route is simply gone before it could look. A
 *   value equal to the state the engine is known to hold (the last value the app wrote or this module
 *   loaded, forgotten on the engine's next change), as `<FilterEngineUrlSync>` skips it. A `POP` is the user's navigation, so Back to a value the app wrote itself loads unless
 *   the engine already holds it. A URL with no `?f=` leaves the engine as it is, as in the React apps.
 *   A value that does not decode, or that the engine refuses, is ignored the same way a malformed link
 *   is at boot.
 *
 * Writes are reported through {@link noteUrlStateWrite} rather than to one follower, because an app's
 * format toggle re-encodes the URL from a module that holds no route's state; every live follower hears
 * it. A route holds one follower for the life of its engine and disposes it with the engine.
 *
 * Framework-free and React-free: it touches only the `window` event target it is given.
 *
 * @packageDocumentation
 */

/** The query parameter every app keeps the encoded filter state in (`<FilterEngineUrlSync>`'s default). */
export const URL_STATE_PARAM = 'f';

/**
 * The event {@link notifyUrlNavigation} dispatches on `window`: an in-app navigation changed the URL
 * without a `popstate`.
 */
export const URL_NAVIGATION_EVENT = 'fe:url-navigation';

/** What a follower needs of the route's engine: its change stream and its restore path. */
export interface FollowedEngine<C> {
	/**
	 * Run `listener` on every change of the engine's state.
	 *
	 * @returns An unsubscribe.
	 */
	readonly subscribe: (listener: () => void) => () => void;
	/** Replace the engine's filter state with `config`, as a route's boot does from a shared link. */
	readonly loadConfig: (config: C) => void;
}

/** Options for {@link createUrlStateFollower}. */
export interface UrlStateFollowerOptions<C> {
	/** The route's engine (its `core`, for a reactive facade). */
	readonly engine: FollowedEngine<C>;
	/** Read the encoded state from the current URL; `null` when there is none. */
	readonly read: () => string | null;
	/** Decode an encoded state. Throws on a value that is not one. */
	readonly decode: (serialized: string) => C;
	/** Called after a value from the URL has been loaded into the engine, with that value. */
	readonly onExternal?: (serialized: string) => void;
	/** Where `popstate` and {@link URL_NAVIGATION_EVENT} arrive. Defaults to `window`. */
	readonly target?: EventTarget;
	/**
	 * Read the current path. Defaults to the window's `location.pathname`. The path when the follower
	 * starts is the route's; a URL on any other path is not followed.
	 */
	readonly readPath?: () => string;
}

/** A running follower. */
export interface UrlStateFollower {
	/**
	 * Look at the URL now, and load its `?f=` into the engine when it changed and the engine does not
	 * already hold it. The event listeners call this; a test or a router hook may too.
	 *
	 * @returns `true` when a value was loaded.
	 */
	readonly follow: () => boolean;
	/** Stop listening, to the URL and to the engine. Safe to call more than once. */
	readonly dispose: () => void;
}

/** The bookkeeping {@link noteUrlStateWrite} updates in every live follower. */
interface FollowerState {
	/** The URL value the follower last saw, written, or loaded. */
	lastSeen: string | null;
	/** The value the engine is known to hold, or `null` once the engine has moved on. */
	engineState: string | null;
}

/** Every live follower's bookkeeping, so a write made anywhere in the app reaches each of them. */
const LIVE_FOLLOWERS = new Set<FollowerState>();

/**
 * The encoded state in the current address, or `null` when there is none.
 *
 * @param search - A `location.search`. Defaults to the window's.
 * @returns The `?f=` value, with an empty one read as absent.
 */
export function readUrlStateParam(search: string = window.location.search): string | null {
	const serialized = new URLSearchParams(search).get(URL_STATE_PARAM);

	return serialized === '' ? null : serialized;
}

/**
 * Record that the app wrote `serialized` into the URL as the engine's current state.
 *
 * @remarks
 * Call it right after the `history.replaceState` that writes `?f=`, and after a format switch
 * re-encodes it. A follower then neither reloads that value nor treats the URL as changed.
 *
 * @param serialized - The value written.
 */
export function noteUrlStateWrite(serialized: string): void {
	for (const follower of LIVE_FOLLOWERS) {
		follower.lastSeen = serialized;
		follower.engineState = serialized;
	}
}

/**
 * Tell every live follower that an in-app navigation may have changed `?f=` on the current route.
 *
 * @remarks
 * A router's own navigation (Vue Router's `push`, SvelteKit's `goto`, Angular's `navigate`, the
 * framework-free app's link handling) creates or replaces a history entry with `pushState` or
 * `replaceState`, and neither fires an event. Each app's router calls this after such a navigation
 * that kept the route, so a link to the same page with another filter state applies in place.
 *
 * @param target - Where followers listen. Defaults to `window`.
 */
export function notifyUrlNavigation(target: EventTarget = window): void {
	target.dispatchEvent(new Event(URL_NAVIGATION_EVENT));
}

/**
 * Start following the URL with a route's engine.
 *
 * @remarks
 * Create it once the route has restored the engine from the URL it booted on: the value in the URL
 * at that moment is taken as the engine's state, so it is not loaded a second time, and the path at
 * that moment is the route's, the only one it follows.
 *
 * @param options - The engine, how to read and decode the URL, and who to tell.
 * @returns The follower.
 *
 * @example
 * ```ts
 * const follower = createUrlStateFollower({
 * 	decode: (serialized) => createLinkSerializer(format).decode(serialized),
 * 	engine: engine.core,
 * 	onExternal: publishSerializedFilterState,
 * 	read: () => readUrlStateParam(),
 * });
 * // …on teardown:
 * follower.dispose();
 * ```
 */
export function createUrlStateFollower<C>(options: UrlStateFollowerOptions<C>): UrlStateFollower {
	const { decode, engine, onExternal, read, readPath = () => window.location.pathname, target = window } = options;
	const routePath = readPath();
	const initial = read();
	const state: FollowerState = { engineState: initial, lastSeen: initial };

	const follow = (): boolean => {
		if (readPath() !== routePath) {
			return false;
		}
		const serialized = read();

		if (serialized === state.lastSeen) {
			return false;
		}
		state.lastSeen = serialized;
		if (serialized === null || serialized === state.engineState) {
			return false;
		}
		try {
			engine.loadConfig(decode(serialized));
		} catch {
			// A link that does not decode, or a state this engine refuses: the engine keeps its state, as
			// it does when a route boots on such a link.
			return false;
		}
		state.engineState = serialized;
		onExternal?.(serialized);

		return true;
	};

	const onNavigation = (): void => {
		follow();
	};
	const unsubscribe = engine.subscribe(() => {
		state.engineState = null;
	});

	LIVE_FOLLOWERS.add(state);
	target.addEventListener('popstate', onNavigation);
	target.addEventListener(URL_NAVIGATION_EVENT, onNavigation);

	let isDisposed = false;

	return {
		dispose: () => {
			if (isDisposed) {
				return;
			}
			isDisposed = true;
			LIVE_FOLLOWERS.delete(state);
			target.removeEventListener('popstate', onNavigation);
			target.removeEventListener(URL_NAVIGATION_EVENT, onNavigation);
			unsubscribe();
		},
		follow,
	};
}
