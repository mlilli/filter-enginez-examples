/**
 * Tests for the reduced-motion predicate.
 *
 * @remarks
 * **Why this file exists although incidental imports already cover every statement.** jsdom does
 * not implement `matchMedia`, so without these tests the only path exercised is the SSR fallback of
 * `typeof matchMedia === 'function' && matchMedia(…).matches` — the RIGHT operand, the real browser
 * behavior, would never run.
 *
 * That is the more interesting half: the guard exists so SSR does not crash, but the PURPOSE of the
 * function is to answer the question in a browser. A regression that made it always return `false`
 * would pass every other test, and reduced-motion users would silently get the animations they asked
 * not to see.
 *
 * `matchMedia` is deleted rather than mocked-away between tests so the SSR case is genuinely absent
 * rather than merely stubbed to something falsy.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { prefersReducedMotion, REDUCED_MOTION_QUERY } from './motion.js';

/** Tracks whether a test installed a fake `matchMedia`, so cleanup can remove it. */
const globalWithMatchMedia = globalThis as { matchMedia?: unknown };

/**
 * Install a fake `matchMedia` that reports the given preference.
 *
 * @param matches - What the media query should report.
 * @returns A spy recording the query strings it was called with.
 */
function stubMatchMedia(matches: boolean): ReturnType<typeof vi.fn> {
	const spy = vi.fn((query: string) => ({ matches, media: query }));

	globalWithMatchMedia.matchMedia = spy;

	return spy;
}

afterEach(() => {
	delete globalWithMatchMedia.matchMedia;
});

describe('prefersReducedMotion', () => {
	it('returns false where matchMedia does not exist (SSR / Node)', () => {
		// The documented contract: server-rendered output has no animation to suppress, and the client
		// re-evaluates on hydration. Crashing here would take down every SSR path that imports brand.
		expect(globalWithMatchMedia.matchMedia).toBeUndefined();
		expect(prefersReducedMotion()).toBe(false);
	});

	it('returns true when the person asked for reduced motion', () => {
		stubMatchMedia(true);

		expect(prefersReducedMotion()).toBe(true);
	});

	it('returns false when the person did not ask for reduced motion', () => {
		stubMatchMedia(false);

		expect(prefersReducedMotion()).toBe(false);
	});

	it('asks for the exported query, so CSS and JS honor the same preference', () => {
		// The design system's CSS keyframes match on REDUCED_MOTION_QUERY directly. If this function
		// queried a different string, JS-driven animations (the results count roll) would disagree with
		// every CSS animation on the page for the same user.
		const spy = stubMatchMedia(true);

		prefersReducedMotion();

		expect(spy).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
		expect(REDUCED_MOTION_QUERY).toBe('(prefers-reduced-motion: reduce)');
	});

	it('re-reads the preference on every call rather than caching it', () => {
		// Documented behavior: a preference changed mid-session must take effect without a reload.
		stubMatchMedia(false);

		expect(prefersReducedMotion()).toBe(false);

		stubMatchMedia(true);

		expect(prefersReducedMotion()).toBe(true);
	});
});
