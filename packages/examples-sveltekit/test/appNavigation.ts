/**
 * The `$app/navigation` module this package's component tests run against.
 *
 * @remarks
 * Like `$app/stores` (`appStores.ts`), SvelteKit generates this module from its own Vite plugin, which
 * the component tests do not run, so `vitest.config.ts` maps the specifier here. Only `afterNavigate`
 * is provided, because it is the only export the app reads: the root layout registers a callback with
 * it. A test plays a navigation through every registered callback with {@link playTestNavigation}, the
 * way SvelteKit calls them after it has navigated. A component importing another export fails its test
 * at import, loudly, rather than reading a stand-in nobody wrote.
 *
 * @packageDocumentation
 */

import type { AfterNavigate } from '@sveltejs/kit';

/** The callbacks registered so far, in order. */
const callbacks: ((navigation: AfterNavigate) => void)[] = [];

/**
 * SvelteKit's `afterNavigate`: run `callback` after each navigation.
 *
 * @param callback - What to run.
 */
export function afterNavigate(callback: (navigation: AfterNavigate) => void): void {
	callbacks.push(callback);
}

/**
 * Run every registered callback with a navigation from `from` to `to`.
 *
 * @param from - The address left.
 * @param to - The address reached.
 */
export function playTestNavigation(from: string, to: string): void {
	const target = (href: string): AfterNavigate['to'] => ({ params: {}, route: { id: null }, url: new URL(href, window.location.origin) }) as AfterNavigate['to'];
	const navigation = { complete: Promise.resolve(), from: target(from), to: target(to), type: 'goto', willUnload: false } as AfterNavigate;

	for (const callback of callbacks) {
		callback(navigation);
	}
}

/** Forget every registered callback. Call it after a test that rendered a component registering one. */
export function resetTestNavigation(): void {
	callbacks.length = 0;
}
