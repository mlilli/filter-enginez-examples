/**
 * Tests for keeping the document head on the route a data router shows.
 *
 * @packageDocumentation
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { followRouterPageMeta, type RouterLocationState } from './followRouterPageMeta.js';
import { type PageMeta } from './pageMeta.js';

/**
 * A router double: a current state and the listeners its navigations notify.
 *
 * @param pathname - Where it starts.
 * @returns The router, and a way to navigate it.
 */
function fakeRouter(pathname: string): {
	readonly navigate: (next: string) => void;
	readonly router: { state: RouterLocationState; subscribe: (listener: (state: RouterLocationState) => void) => () => void };
	readonly unsubscribed: () => boolean;
} {
	const listeners = new Set<(state: RouterLocationState) => void>();
	let isUnsubscribed = false;
	const router = {
		state: { location: { pathname }} as RouterLocationState,
		subscribe: (listener: (state: RouterLocationState) => void) => {
			listeners.add(listener);

			return () => {
				isUnsubscribed = true;
				listeners.delete(listener);
			};
		},
	};

	return {
		navigate: (next) => {
			router.state = { location: { pathname: next }};
			for (const listener of listeners) {
				listener(router.state);
			}
		},
		router,
		unsubscribed: () => isUnsubscribed,
	};
}

/**
 * Indexable metadata named after its path.
 *
 * @param pathname - The path.
 * @returns The metadata.
 */
function metaFor(pathname: string): PageMeta {
	return { canonicalUrl: `https://example.test${pathname}`, description: pathname, title: `Title ${pathname}` };
}

/** Let every settled promise's callbacks run. */
async function flush(): Promise<void> {
	await new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

afterEach(() => {
	document.head.replaceChildren();
	document.title = '';
});

describe('followRouterPageMeta', () => {
	it('applies the starting route, then each new path', async () => {
		const { navigate, router } = fakeRouter('/');

		followRouterPageMeta(router, metaFor);
		await flush();
		expect(document.title).toBe('Title /');

		navigate('/wine');
		await flush();
		expect(document.title).toBe('Title /wine');
		expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://example.test/wine');
	});

	it('writes nothing for a change of query or hash alone', async () => {
		const { navigate, router } = fakeRouter('/wine');
		const resolve = vi.fn(metaFor);

		followRouterPageMeta(router, resolve);
		navigate('/wine');
		await flush();

		expect(resolve).toHaveBeenCalledTimes(1);
	});

	it('drops a resolution that arrives after a newer navigation', async () => {
		const { navigate, router } = fakeRouter('/docs');
		let releaseSlow: (meta: PageMeta) => void = () => undefined;

		followRouterPageMeta(router, async (pathname) => (pathname === '/docs'
			? new Promise<PageMeta>((resolve) => {
				releaseSlow = resolve;
			})
			: metaFor(pathname)));
		navigate('/books');
		await flush();
		releaseSlow(metaFor('/docs'));
		await flush();

		expect(document.title).toBe('Title /books');
	});

	it('leaves the head alone when a lookup fails', async () => {
		const { router } = fakeRouter('/docs');

		document.title = 'Shell title';
		followRouterPageMeta(router, async () => Promise.reject(new Error('chunk failed to load')));
		await flush();

		expect(document.title).toBe('Shell title');
	});

	it('stops following, and drops a lookup in flight, once stopped', async () => {
		const { navigate, router, unsubscribed } = fakeRouter('/');
		const stop = followRouterPageMeta(router, metaFor);

		stop();
		await flush();
		navigate('/wine');
		await flush();

		expect(unsubscribed()).toBe(true);
		expect(document.title).toBe('');
	});
});
