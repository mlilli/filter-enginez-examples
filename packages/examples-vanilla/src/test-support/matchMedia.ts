/**
 * A controllable `window.matchMedia` for jsdom suites.
 *
 * @remarks
 * ### Why this exists at all
 *
 * jsdom does not implement `matchMedia`, so `trackDesktopBreakpoint` takes its "hostile environment,
 * treat it as desktop" fallback in every test in this package that does not install a stub. That
 * makes the fallback the default path and leaves the three states that actually decide anything —
 * mobile, mobile-with-collapse-open, and a breakpoint CROSS — unreachable. A stub is not a convenience
 * here; it is the only way to reach the code that makes decisions.
 *
 * ### 🔴 It answers ONE query, and the query is the caller's to name
 *
 * A helper that handed the SAME `MediaQueryList` back for every query would let its single
 * `matches` flag answer all of them. A stub installed for the desktop breakpoint would then also tell
 * `@filter-enginez/brand/motion` that the person had asked for reduced motion — and
 * `results/resultsView.ts`'s reduced-motion snap path would be reached entirely by that accident,
 * with nothing in the source saying so and no assertion mentioning it.
 *
 * So the controlled query is a REQUIRED argument rather than an optional one with a viewport-shaped
 * default. Every call site states which media feature it is simulating. Every OTHER query gets a
 * list of its own that reports `false` — the browser's answer for an unset preference, and the one
 * that cannot quietly satisfy a branch nobody aimed at.
 *
 * ### Why it lives in `test-support/`
 *
 * `viewport/desktopBreakpoint.test.ts`, `real-estate/view.test.ts` (whose breakpoint subscription is
 * reachable only by crossing the breakpoint), `real-estate/radiusMap.test.ts`, `books/view.test.ts`
 * and `results/resultsView.test.ts` all need it, and one shared, precise helper is what keeps them from each hand-rolling a fake. The
 * scope is this package: `brand/src/motion.test.ts` stubs `matchMedia` too, but promoting a helper
 * across a package boundary for a caller with different needs would be widening the surface to avoid
 * a copy, which is the worse trade.
 *
 * `**\/test-support\/**` is a whole-file coverage exclusion (`vitest.coverage.config.ts`).
 *
 * ### It is deliberately partial
 *
 * The modules under test use `matches` plus `addEventListener` / `removeEventListener`, and nothing
 * else. `media` is here because the list is per-query and reporting a query it is not about would
 * be the same class of lie the per-query design avoids — not because anything reads it. A fuller
 * fake would start asserting things about the DOM rather than about them.
 *
 * @packageDocumentation
 */

import { vi } from 'vitest';

/**
 * Brands the installed stub, so a second install can refuse instead of silently orphaning the first.
 *
 * @remarks
 * A `Symbol.for` key rather than module state: `vi.unstubAllGlobals()` restores jsdom's own (absent)
 * `matchMedia`, which takes the brand with it, so the check resets itself at every suite teardown
 * with nothing to remember to clear.
 */
const STUB_MARKER = Symbol.for('filter-enginez.examples-vanilla.test-support.matchMedia');

/** Drives the stubbed media query from a test. */
export interface MediaQueryController {
	/** How many `change` listeners are attached to the CONTROLLED query. */
	readonly listenerCount: () => number;
	/** Every query string `matchMedia` was called with, in order — controlled or not. */
	readonly queries: readonly string[];
	/** Flip the controlled query and fire its `change` listeners, as a real resize would. */
	readonly setMatches: (isMatching: boolean) => void;
}

/**
 * Build one fake `MediaQueryList`.
 *
 * @remarks
 * Shared by the controlled query and the inert ones so the two cannot drift into different fakes —
 * they differ only in where `matches` reads from and whose listeners they collect.
 *
 * @param media - The query string this list is about.
 * @param readMatches - Consulted on every `matches` read, so the value can change under the caller.
 * @param listeners - The set `change` listeners register into.
 * @returns The list, cast to the DOM type the modules under test expect.
 */
function createMediaQueryList(
	media: string,
	readMatches: () => boolean,
	listeners: Set<() => void>,
): MediaQueryList {
	const list = {
		addEventListener: (_type: string, listener: () => void) => {
			listeners.add(listener);
		},
		get matches(): boolean {
			return readMatches();
		},
		get media(): string {
			return media;
		},
		removeEventListener: (_type: string, listener: () => void) => {
			listeners.delete(listener);
		},
	};

	return list as unknown as MediaQueryList;
}

/**
 * Refuse a second install rather than replacing the first one where nobody can see it.
 *
 * @remarks
 * `vi.stubGlobal` swaps the global wholesale, so a suite installing two controlled queries would
 * leave the first controller alive but inert: its `setMatches` would still fire listeners, and
 * nothing would be reading them. That is an assertion that cannot fail wearing the clothes of one
 * that passed, so it throws instead.
 *
 * If a suite ever genuinely needs two live queries, the answer is a record-shaped argument here, not
 * two installs.
 */
function assertNoStubInstalled(): void {
	const current = globalThis.matchMedia as unknown as Partial<Record<symbol, unknown>> | undefined;

	if (current?.[STUB_MARKER] === true) {
		throw new Error(
			'installMatchMedia: a stub is already installed, and installing a second would silently ' +
				'orphan the first controller. Call vi.unstubAllGlobals() first.',
		);
	}
}

/**
 * Install a controllable `window.matchMedia` that answers one named query.
 *
 * @remarks
 * Call `vi.unstubAllGlobals()` from the suite's `afterEach` — this helper deliberately does not
 * register that itself, so a spec that installs the stub per-test and one that installs it once
 * share the same teardown story rather than acquiring a hidden hook.
 *
 * @param query - The media query this stub is about. Every other query reports `false`.
 * @param initialMatches - What {@link query} reports at construction time.
 * @returns A controller for driving it.
 */
export function installMatchMedia(query: string, initialMatches: boolean): MediaQueryController {
	assertNoStubInstalled();

	const queries: string[] = [];
	const listeners = new Set<() => void>();
	const inertLists = new Map<string, MediaQueryList>();
	let isMatching = initialMatches;

	const controlled = createMediaQueryList(query, () => isMatching, listeners);

	const stub = Object.assign(
		(asked: string): MediaQueryList => {
			queries.push(asked);

			if (asked === query) {
				return controlled;
			}

			// Cached per query string so a module that reads the same feature twice sees one list, and
			// so a listener attached to an unwatched query is held rather than dropped on the floor.
			let inert = inertLists.get(asked);

			if (inert === undefined) {
				inert = createMediaQueryList(asked, () => false, new Set());
				inertLists.set(asked, inert);
			}

			return inert;
		},
		{ [STUB_MARKER]: true },
	);

	vi.stubGlobal('matchMedia', stub);

	return {
		listenerCount: () => listeners.size,
		queries,
		setMatches: (next) => {
			isMatching = next;
			for (const listener of [...listeners]) {
				listener();
			}
		},
	};
}
