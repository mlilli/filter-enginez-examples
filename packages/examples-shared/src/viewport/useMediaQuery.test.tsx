/**
 * Tests for the media-query hook behind the responsive panel layout.
 *
 * @remarks
 * jsdom has no `matchMedia`, so it is stubbed with a controllable fake that can fire `change` events
 * — the same gap that can hide reduced-motion behavior in `brand` and `react-ui` from their tests.
 * Without a stub these hooks are not merely untested, they throw.
 *
 * The listener lifecycle is the part worth protecting. This drives whether the filter panel is an
 * open sidebar or collapsed behind a "Filters" button, so a subscription that never fires leaves the
 * layout stuck at whatever the viewport was on mount — rotating a tablet, or dragging a window across
 * the breakpoint, would leave a collapsed panel and its button on a desktop layout with no way to
 * notice from the code.
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DESKTOP_MIN_WIDTH_PX, useIsDesktop, useMediaQuery } from './useMediaQuery.js';

/** Listeners registered against the fake, keyed by the query they were registered for. */
let listeners: Map<string, Set<() => void>>;
/** Which queries currently match. */
let matching: Set<string>;
/** Queries the fake was asked about, in call order. */
let asked: string[];

/**
 * Install a controllable `matchMedia`.
 *
 * @param initiallyMatching - Queries that should report `matches: true` at first.
 */
function stubMatchMedia(initiallyMatching: readonly string[] = []): void {
	listeners = new Map();
	matching = new Set(initiallyMatching);
	asked = [];

	vi.stubGlobal('matchMedia', (query: string) => {
		asked.push(query);

		return {
			addEventListener: (_event: string, listener: () => void): void => {
				const set = listeners.get(query) ?? new Set();

				set.add(listener);
				listeners.set(query, set);
			},
			get matches(): boolean {
				return matching.has(query);
			},
			removeEventListener: (_event: string, listener: () => void): void => {
				listeners.get(query)?.delete(listener);
			},
		};
	});
}

/**
 * Flip a query's match state and notify its listeners, as a real viewport change would.
 *
 * @param query - The query to flip.
 * @param matches - Its new state.
 */
function setMatches(query: string, matches: boolean): void {
	if (matches) {
		matching.add(query);
	} else {
		matching.delete(query);
	}
	act(() => {
		for (const listener of listeners.get(query) ?? []) {
			listener();
		}
	});
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
	it('reports the current match state on mount', () => {
		stubMatchMedia(['(min-width: 500px)']);

		expect(renderHook(() => useMediaQuery('(min-width: 500px)')).result.current).toBe(true);
	});

	it('reports false for a query that does not match', () => {
		stubMatchMedia();

		expect(renderHook(() => useMediaQuery('(min-width: 500px)')).result.current).toBe(false);
	});

	it('re-renders when the viewport crosses the query', () => {
		// The reason this is a subscription rather than a one-shot read. Rotating a device or dragging
		// a window must move the layout; without this the panel keeps whatever it had on mount.
		stubMatchMedia();

		const { result } = renderHook(() => useMediaQuery('(min-width: 500px)'));

		expect(result.current).toBe(false);

		setMatches('(min-width: 500px)', true);

		expect(result.current).toBe(true);
	});

	it('detaches its listener on unmount', () => {
		stubMatchMedia();

		const { unmount } = renderHook(() => useMediaQuery('(min-width: 500px)'));

		expect(listeners.get('(min-width: 500px)')?.size).toBe(1);

		unmount();

		expect(listeners.get('(min-width: 500px)')?.size).toBe(0);
	});

	it('re-subscribes when the query itself changes', () => {
		// `subscribe` is memoized on `query`. If it were memoized on nothing, a component that switched
		// breakpoints would keep listening to the old one and silently stop responding to the new.
		stubMatchMedia(['(min-width: 900px)']);

		const { rerender, result } = renderHook(({ query }) => useMediaQuery(query), {
			initialProps: { query: '(min-width: 500px)' },
		});

		expect(result.current).toBe(false);

		rerender({ query: '(min-width: 900px)' });

		expect(result.current).toBe(true);
		expect(listeners.get('(min-width: 500px)')?.size).toBe(0);
		expect(listeners.get('(min-width: 900px)')?.size).toBe(1);
	});
});

describe('server rendering', () => {
	it('reports false during SSR, without touching matchMedia', () => {
		// `getServerSnapshot` is unreachable from a DOM render — `useSyncExternalStore` only calls it
		// when React renders on the server, so `renderToString` is the ONLY way to exercise it.
		//
		// The value is a deliberate mobile-first default: the server cannot measure a viewport, so it
		// assumes the small one. Returning `true` would make every SSR pass emit the desktop layout and
		// then snap to the collapsed panel on hydration — a visible jump on exactly the devices least able to
		// absorb it. Returning `window.matchMedia(...)` would instead throw, since there is no window.
		const Probe = (): React.ReactElement => <span>{String(useIsDesktop())}</span>;

		expect(renderToString(<Probe />)).toContain('false');
	});
});

describe('useIsDesktop', () => {
	it('asks for the desktop breakpoint', () => {
		stubMatchMedia();
		renderHook(() => useIsDesktop());

		expect(asked).toContain(`(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`);
	});

	it('is true at or above the breakpoint and false below', () => {
		const desktop = `(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`;

		stubMatchMedia([desktop]);

		const { result } = renderHook(() => useIsDesktop());

		expect(result.current).toBe(true);

		setMatches(desktop, false);

		expect(result.current).toBe(false);
	});

	it('uses a min-width query, so the desktop layout is the wider one', () => {
		// A max-width query here would inverse the whole layout: the collapsed panel would appear on
		// desktop and the open sidebar on phones. Both render fine, which is what makes it worth pinning.
		stubMatchMedia();
		renderHook(() => useIsDesktop());

		expect(asked[0]).toMatch(/^\(min-width:/);
	});
});
