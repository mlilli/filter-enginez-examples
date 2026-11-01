/**
 * Tests for `urlStateFollower.ts` — a route's engine follows `?f=` through Back, Forward and in-app
 * navigations, and never reloads the app's own writes.
 *
 * @remarks
 * Driven through the real history of jsdom's window: two filter states are pushed as two entries, and
 * Back is `history.back()`, which fires a real `popstate`. The engine is a recording fake, because the
 * subject is when the follower loads and what it skips; that the apps' engines and panels follow a load
 * is each app's own suite's subject.
 *
 * @packageDocumentation
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	createUrlStateFollower,
	noteUrlStateWrite,
	notifyUrlNavigation,
	readUrlStateParam,
	URL_NAVIGATION_EVENT,
	URL_STATE_PARAM,
	type UrlStateFollower,
} from './urlStateFollower.js';

/** A config the fake decoder produces: the encoded value, unwrapped. */
interface FakeConfig {
	readonly state: string;
}

/** An engine that records every load and lets a test emit a change. */
interface FakeEngine {
	readonly loadConfig: ReturnType<typeof vi.fn<(config: FakeConfig) => void>>;
	readonly subscribe: (listener: () => void) => () => void;
	/** Emit a change, as a user's filter edit does. */
	readonly change: () => void;
	/** How many listeners are subscribed. */
	readonly listenerCount: () => number;
}

/**
 * Build a fake engine whose `loadConfig` emits a change synchronously, as the main-thread engine's does.
 *
 * @returns The engine.
 */
function fakeEngine(): FakeEngine {
	const listeners = new Set<() => void>();
	const change = (): void => {
		for (const listener of listeners) {
			listener();
		}
	};

	return {
		change,
		listenerCount: () => listeners.size,
		loadConfig: vi.fn<(config: FakeConfig) => void>(() => {
			change();
		}),
		subscribe: (listener) => {
			listeners.add(listener);

			return () => {
				listeners.delete(listener);
			};
		},
	};
}

/**
 * Decode `state:<x>` to `{ state: x }`; throw on anything else, as a real serializer does on a bad link.
 *
 * @param serialized - The `?f=` value.
 * @returns The config.
 */
function decode(serialized: string): FakeConfig {
	if (!serialized.startsWith('state:')) {
		throw new Error(`not a state: ${serialized}`);
	}

	return { state: serialized.slice('state:'.length) };
}

/**
 * The URL of `/books` with `?f=` set to `value`.
 *
 * @param value - The encoded state, or `null` for none.
 * @returns A path with its query.
 */
function booksUrl(value: string | null): string {
	return value === null ? '/books' : `/books?${URL_STATE_PARAM}=${encodeURIComponent(value)}`;
}

/**
 * Write `value` into the current entry the way every app's URL layer does: `replaceState`, then report it.
 *
 * @param value - The encoded state.
 */
function appWrite(value: string): void {
	window.history.replaceState(window.history.state, '', booksUrl(value));
	noteUrlStateWrite(value);
}

/**
 * Go back one entry and wait for its `popstate`.
 *
 * @returns Once the event has been dispatched.
 */
async function back(): Promise<void> {
	const popped = new Promise((resolve) => {
		window.addEventListener('popstate', resolve, { once: true });
	});

	window.history.back();
	await popped;
}

/**
 * Go forward one entry and wait for its `popstate`.
 *
 * @returns Once the event has been dispatched.
 */
async function forward(): Promise<void> {
	const popped = new Promise((resolve) => {
		window.addEventListener('popstate', resolve, { once: true });
	});

	window.history.forward();
	await popped;
}

let follower: UrlStateFollower | null = null;

/**
 * Start a follower over `engine`, reading the window's URL.
 *
 * @param engine - The engine.
 * @param onExternal - Called after each load.
 * @returns The follower.
 */
function follow(engine: FakeEngine, onExternal?: (serialized: string) => void): UrlStateFollower {
	follower = createUrlStateFollower({ decode, engine, onExternal, read: () => readUrlStateParam() });

	return follower;
}

beforeEach(() => {
	window.history.replaceState(null, '', booksUrl(null));
});

afterEach(() => {
	follower?.dispose();
	follower = null;
});

describe('readUrlStateParam', () => {
	it('reads ?f=, and reads an empty or missing one as none', () => {
		expect(readUrlStateParam('?f=state%3Aa&x=1')).toBe('state:a');
		expect(readUrlStateParam('?f=')).toBeNull();
		expect(readUrlStateParam('?x=1')).toBeNull();
	});

	it('reads the window’s address by default', () => {
		window.history.replaceState(null, '', booksUrl('state:here'));

		expect(readUrlStateParam()).toBe('state:here');
	});
});

describe('createUrlStateFollower', () => {
	it('takes the state the route booted on as the engine’s, and does not load it again', () => {
		window.history.replaceState(null, '', booksUrl('state:boot'));
		const engine = fakeEngine();

		expect(follow(engine).follow()).toBe(false);
		expect(engine.loadConfig).not.toHaveBeenCalled();
	});

	it('loads Back to a state the app wrote earlier, and Forward to the newer one, into the same engine', async () => {
		const engine = fakeEngine();
		const onExternal = vi.fn();

		follow(engine, onExternal);
		engine.change();
		appWrite('state:earlier');
		// A second entry, as the e2e suite makes one: every app write replaces the current entry.
		window.history.pushState(window.history.state, '', window.location.href);
		engine.change();
		appWrite('state:newer');

		await back();
		expect(engine.loadConfig.mock.calls).toEqual([[{ state: 'earlier' }]]);
		expect(onExternal).toHaveBeenLastCalledWith('state:earlier');

		await forward();
		expect(engine.loadConfig.mock.calls).toEqual([[{ state: 'earlier' }], [{ state: 'newer' }]]);
		expect(onExternal).toHaveBeenLastCalledWith('state:newer');
	});

	it('never reloads the app’s own write', () => {
		const engine = fakeEngine();
		const instance = follow(engine);

		engine.change();
		appWrite('state:mine');

		expect(instance.follow()).toBe(false);
		notifyUrlNavigation();
		window.dispatchEvent(new PopStateEvent('popstate'));
		expect(engine.loadConfig).not.toHaveBeenCalled();
	});

	it('does not revert a change the app has not written yet when nothing navigated', () => {
		const engine = fakeEngine();
		const instance = follow(engine);

		appWrite('state:written');
		// The user's next edit, still inside the write debounce: the URL still holds the older state.
		engine.change();

		expect(instance.follow()).toBe(false);
		expect(engine.loadConfig).not.toHaveBeenCalled();
	});

	it('skips a value the engine already holds', async () => {
		const engine = fakeEngine();

		follow(engine);
		engine.change();
		appWrite('state:held');
		// A link to the same page without a filter state: the URL moves on, the engine keeps its state.
		window.history.pushState(null, '', booksUrl(null));
		notifyUrlNavigation();
		// Back to the value the engine still holds has nothing to load.
		await back();

		expect(readUrlStateParam()).toBe('state:held');
		expect(engine.loadConfig).not.toHaveBeenCalled();
	});

	it('loads a value the engine held once the engine has moved on from it', async () => {
		const engine = fakeEngine();

		follow(engine);
		engine.change();
		appWrite('state:left');
		window.history.pushState(null, '', booksUrl(null));
		notifyUrlNavigation();
		// The user's next edit: the engine no longer holds `state:left`, so Back to it has work to do.
		engine.change();
		await back();

		expect(engine.loadConfig.mock.calls).toEqual([[{ state: 'left' }]]);
	});

	it('applies an in-app navigation to the same route with another state', () => {
		const engine = fakeEngine();

		follow(engine);
		window.history.pushState(null, '', booksUrl('state:linked'));
		notifyUrlNavigation();

		expect(engine.loadConfig.mock.calls).toEqual([[{ state: 'linked' }]]);
	});

	it('leaves the engine alone for a URL without ?f=, as the React apps do', () => {
		const engine = fakeEngine();
		const instance = follow(engine);

		engine.change();
		appWrite('state:kept');
		window.history.pushState(null, '', booksUrl(null));

		expect(instance.follow()).toBe(false);
		expect(engine.loadConfig).not.toHaveBeenCalled();
	});

	it('ignores a value that does not decode, or that the engine refuses, and keeps following', () => {
		const engine = fakeEngine();
		const onExternal = vi.fn();
		const instance = follow(engine, onExternal);

		window.history.pushState(null, '', booksUrl('garbage'));
		expect(instance.follow()).toBe(false);

		engine.loadConfig.mockImplementationOnce(() => {
			throw new Error('refused');
		});
		window.history.pushState(null, '', booksUrl('state:refused'));
		expect(instance.follow()).toBe(false);
		expect(onExternal).not.toHaveBeenCalled();

		window.history.pushState(null, '', booksUrl('state:fine'));
		expect(instance.follow()).toBe(true);
		expect(onExternal).toHaveBeenCalledWith('state:fine');
	});

	it('stops listening to the URL and the engine on dispose, and disposing twice is harmless', () => {
		const engine = fakeEngine();
		const instance = follow(engine);

		expect(engine.listenerCount()).toBe(1);
		instance.dispose();
		instance.dispose();
		expect(engine.listenerCount()).toBe(0);

		window.history.pushState(null, '', booksUrl('state:after'));
		notifyUrlNavigation();
		window.dispatchEvent(new PopStateEvent('popstate'));
		expect(engine.loadConfig).not.toHaveBeenCalled();
	});

	it('never loads a URL on another path, which the route is leaving, and follows again back on its own', async () => {
		const engine = fakeEngine();
		const instance = follow(engine);

		window.history.pushState(null, '', `/wine?${URL_STATE_PARAM}=${encodeURIComponent('state:wine')}`);
		expect(instance.follow()).toBe(false);
		expect(engine.loadConfig).not.toHaveBeenCalled();

		window.history.pushState(null, '', booksUrl('state:books'));
		expect(instance.follow()).toBe(true);
		expect(engine.loadConfig.mock.calls).toEqual([[{ state: 'books' }]]);

		await back();
		expect(engine.loadConfig).toHaveBeenCalledTimes(1);
	});

	it('reads the path through the reader it is given', () => {
		const engine = fakeEngine();
		let path = '/books';

		follower = createUrlStateFollower({ decode, engine, read: () => readUrlStateParam(), readPath: () => path });
		window.history.pushState(null, '', booksUrl('state:here'));
		path = '/elsewhere';
		expect(follower.follow()).toBe(false);

		path = '/books';
		expect(follower.follow()).toBe(true);
	});

	it('listens on the target it is given', () => {
		const target = new EventTarget();
		const engine = fakeEngine();

		follower = createUrlStateFollower({ decode, engine, read: () => readUrlStateParam(), target });
		window.history.pushState(null, '', booksUrl('state:targeted'));
		notifyUrlNavigation();
		expect(engine.loadConfig).not.toHaveBeenCalled();

		target.dispatchEvent(new Event(URL_NAVIGATION_EVENT));
		expect(engine.loadConfig.mock.calls).toEqual([[{ state: 'targeted' }]]);
	});
});
