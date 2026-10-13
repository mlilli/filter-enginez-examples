/**
 * Tests for the shareable-URL format store.
 *
 * @remarks
 * This is a MODULE SINGLETON: `currentFormat` is initialized at import time from `localStorage`. So
 * every test that cares about the initial read has to re-import through `vi.resetModules()`, and the
 * mutating tests have to reset too or they leak state into each other through module scope. That is
 * the main hazard in this file and the reason for the `loadStore` helper.
 *
 * What is being protected: the format decides how filter state is encoded into a shared link. If the
 * persisted value were read wrong, or a `localStorage` denial threw instead of degrading, the toggle
 * would silently disagree with the encoder — producing links that decode to different filters than
 * the sender saw. The `url-state-router` tagged serializer means such a link still DECODES fine; it
 * just decodes to the wrong thing, which is the worst kind of wrong.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as UrlFormatStore from './urlFormatStore.js';

/** The store's public surface, as returned by a fresh import. */
type Store = typeof UrlFormatStore;

/**
 * Import a FRESH copy of the store, so module-level initialization re-runs.
 *
 * @returns The freshly-imported module.
 */
async function loadStore(): Promise<Store> {
	vi.resetModules();

	return import('./urlFormatStore.js');
}

/**
 * Replace `localStorage` with a controllable fake.
 *
 * @param options - `initial` seeds the stored value; `throwOn` makes that method throw.
 */
function stubStorage(options: { initial?: string | null; throwOn?: 'getItem' | 'setItem' } = {}): void {
	const backing = new Map<string, string>();

	if (typeof options.initial === 'string') {
		backing.set('fe:url-format', options.initial);
	}
	vi.stubGlobal('localStorage', {
		getItem: (key: string): string | null => {
			if (options.throwOn === 'getItem') {
				throw new Error('storage denied');
			}

			return backing.get(key) ?? null;
		},
		setItem: (key: string, value: string): void => {
			if (options.throwOn === 'setItem') {
				throw new Error('storage denied');
			}
			backing.set(key, value);
		},
	});
}

beforeEach(() => {
	stubStorage();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('initial format', () => {
	it('defaults to human-readable with nothing stored', async () => {
		const store = await loadStore();

		expect(store.cycleUrlFormat()).toBe('compact');
	});

	it.each(['compact', 'human-readable', 'json-base64'])('restores the persisted %s format', async (stored) => {
		stubStorage({ initial: stored });

		const store = await loadStore();
		const { result } = renderHook(() => store.useUrlFormat());

		expect(result.current).toBe(stored);
	});

	it('ignores a stored value that is not a known format', async () => {
		// Guards against an old or hand-edited key. Trusting it would set the encoder to a format the
		// serializer does not know, and the first shared link would be unreadable.
		stubStorage({ initial: 'yaml-with-cheese' });

		const store = await loadStore();
		const { result } = renderHook(() => store.useUrlFormat());

		expect(result.current).toBe('human-readable');
	});

	it('degrades to the default when reading storage throws', async () => {
		// Safari private browsing and hardened enterprise profiles both do this. Throwing here would
		// take down module initialization — that is, the whole app, at import time.
		stubStorage({ throwOn: 'getItem' });

		const store = await loadStore();
		const { result } = renderHook(() => store.useUrlFormat());

		expect(result.current).toBe('human-readable');
	});
});

describe('setUrlFormat', () => {
	it('updates the value and persists it', async () => {
		const store = await loadStore();
		const { result } = renderHook(() => store.useUrlFormat());

		act(() => {
			store.setUrlFormat('json-base64');
		});

		expect(result.current).toBe('json-base64');
		expect(localStorage.getItem('fe:url-format')).toBe('json-base64');
	});

	it('short-circuits entirely when the format is unchanged', async () => {
		// The documented no-op, asserted via the WRITE rather than via re-renders. Counting renders
		// cannot detect this: `useSyncExternalStore` bails out when the snapshot is unchanged, so the
		// component does not re-render whether or not listeners fired — a render-count assertion here
		// passes even with the guard deleted. The storage write is the observable consequence.
		const store = await loadStore();
		const setItem = vi.spyOn(globalThis.localStorage, 'setItem');

		act(() => {
			store.setUrlFormat('human-readable');
		});

		expect(setItem).not.toHaveBeenCalled();

		act(() => {
			store.setUrlFormat('compact');
		});

		expect(setItem).toHaveBeenCalledWith('fe:url-format', 'compact');
	});

	it('still applies the change in memory when persisting throws', async () => {
		// Storage denial must cost persistence across reloads, not the current session's behavior.
		stubStorage({ throwOn: 'setItem' });

		const store = await loadStore();
		const { result } = renderHook(() => store.useUrlFormat());

		act(() => {
			store.setUrlFormat('compact');
		});

		expect(result.current).toBe('compact');
	});
});

describe('cycleUrlFormat', () => {
	it('advances readable → compact → base64 → readable', async () => {
		const store = await loadStore();

		expect(store.cycleUrlFormat()).toBe('compact');
		expect(store.cycleUrlFormat()).toBe('json-base64');
		expect(store.cycleUrlFormat()).toBe('human-readable');
	});

	it('returns to the starting format after a full cycle of three', async () => {
		// The cycle must be a permutation with no absorbing state — a successor map that pointed two
		// formats at the same next value would strand the user unable to reach the third.
		const store = await loadStore();
		const seen = [store.cycleUrlFormat(), store.cycleUrlFormat(), store.cycleUrlFormat()];

		expect(new Set(seen).size).toBe(3);
		expect(seen[2]).toBe('human-readable');
	});

	it('notifies subscribers as it goes', async () => {
		const store = await loadStore();
		const { result } = renderHook(() => store.useUrlFormat());

		act(() => {
			store.cycleUrlFormat();
		});

		expect(result.current).toBe('compact');
	});
});

describe('useUrlFormat', () => {
	it('survives a change dispatched after unmount', async () => {
		// NOTE what this does and does not prove. It shows an unmounted subscriber neither throws nor
		// receives a stale value — worth guarding, since a listener that touched unmounted state would
		// surface here.
		//
		// It does NOT prove the listener was removed from the set. Deleting the unsubscribe body
		// leaves this test green: React never re-renders an unmounted component, so a leaked listener
		// has no observable effect through the public API. `subscribe` is module-private and the
		// listener set is not exposed, so the leak is genuinely unobservable from here rather than
		// merely untested. Exporting the set purely to assert on it would be worse than the gap.
		const store = await loadStore();
		const { result, unmount } = renderHook(() => store.useUrlFormat());

		unmount();
		act(() => {
			store.setUrlFormat('json-base64');
		});

		expect(result.current).toBe('human-readable');
	});

	it('shares one value across independent subscribers', async () => {
		// The whole reason this is a singleton rather than context: the route's serializer and the
		// toggle button must never disagree about the format.
		const store = await loadStore();
		const first = renderHook(() => store.useUrlFormat());
		const second = renderHook(() => store.useUrlFormat());

		act(() => {
			store.setUrlFormat('compact');
		});

		expect(first.result.current).toBe('compact');
		expect(second.result.current).toBe('compact');
	});
});

describe('URL_FORMAT_LABELS', () => {
	it('labels every format', async () => {
		const store = await loadStore();

		expect(store.URL_FORMAT_LABELS).toEqual({
			compact: 'Compact',
			'human-readable': 'Readable',
			'json-base64': 'Base64',
		});
	});
});
