/**
 * Tests for the `matchMedia` stub — the fake five other suites depend on being honest.
 *
 * @remarks
 * ### Why a fake gets a suite of its own
 *
 * A fake is only as good as the understanding behind it, and this one is shared by five suites. A
 * version that handed the same `MediaQueryList` back for every query would let a stub installed for
 * the desktop breakpoint also tell `@filter-enginez/brand/motion` that reduced motion was preferred,
 * and `results/resultsView.ts`'s snap path would read as "covered" in suites that never mention it.
 *
 * ### The specific reason these cases exist rather than trusting the five callers
 *
 * 🔴 **Reverting this module to a single shared list leaves all five callers GREEN.** Each of them
 * asks about one media feature per test, and a shared list answers a single question correctly by
 * construction. The property that matters — that a query nobody named reports `false` — is
 * observable only where two features are read in one test, which is to say nowhere that asserts it.
 * So the per-query design could silently come undone with every other test still passing. These
 * cases are the only thing standing in the way, and a mutation run confirms they do.
 *
 * @packageDocumentation
 */

import { prefersReducedMotion, REDUCED_MOTION_QUERY } from '@filter-enginez/brand/motion';
import { DESKTOP_MEDIA_QUERY } from '@filter-enginez/examples-shared/viewport-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installMatchMedia } from './matchMedia.js';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('the controlled query', () => {
	it('reports the flag it was installed with, and follows setMatches', () => {
		const media = installMatchMedia(DESKTOP_MEDIA_QUERY, false);

		expect(matchMedia(DESKTOP_MEDIA_QUERY).matches).toBe(false);

		media.setMatches(true);

		expect(matchMedia(DESKTOP_MEDIA_QUERY).matches).toBe(true);
	});

	it('fires its change listeners on setMatches, and stops after removal', () => {
		const media = installMatchMedia(DESKTOP_MEDIA_QUERY, false);
		const list = matchMedia(DESKTOP_MEDIA_QUERY);
		let changeCount = 0;
		const listener = (): void => {
			changeCount += 1;
		};

		list.addEventListener('change', listener);

		expect(media.listenerCount()).toBe(1);

		media.setMatches(true);
		list.removeEventListener('change', listener);
		media.setMatches(false);

		expect(changeCount).toBe(1);
		expect(media.listenerCount()).toBe(0);
	});
});

describe('every other query', () => {
	it('🔴 reports FALSE, so a stub for one feature cannot answer for another', () => {
		// The regression case, and the reason this file exists. Asserted through the real consumer as
		// well as the raw list: `prefersReducedMotion()` is what `results/resultsView.ts` calls, and it
		// answering `true` here is the exact shape of the accident — a suite that stubbed the desktop
		// breakpoint silently suppressing an animation it never had an opinion about.
		installMatchMedia(DESKTOP_MEDIA_QUERY, true);

		expect(matchMedia(REDUCED_MOTION_QUERY).matches).toBe(false);
		expect(prefersReducedMotion()).toBe(false);
	});

	it('is unmoved by setMatches on the controlled one', () => {
		// A shared list passes the case above on a technicality if `initialMatches` is false, so the
		// controlled query is driven TRUE here and the uncontrolled one still has to stay put.
		const media = installMatchMedia(DESKTOP_MEDIA_QUERY, false);

		media.setMatches(true);

		expect(matchMedia(DESKTOP_MEDIA_QUERY).matches).toBe(true);
		expect(matchMedia(REDUCED_MOTION_QUERY).matches).toBe(false);
	});

	it('is the SAME list on a repeat ask, so a listener attached to it is not dropped', () => {
		installMatchMedia(DESKTOP_MEDIA_QUERY, true);

		expect(matchMedia(REDUCED_MOTION_QUERY)).toBe(matchMedia(REDUCED_MOTION_QUERY));
	});
});

describe('the install', () => {
	it('records every query asked, in order, controlled or not', () => {
		const media = installMatchMedia(DESKTOP_MEDIA_QUERY, true);

		matchMedia(REDUCED_MOTION_QUERY);
		matchMedia(DESKTOP_MEDIA_QUERY);

		expect(media.queries).toEqual([REDUCED_MOTION_QUERY, DESKTOP_MEDIA_QUERY]);
	});

	it('refuses a second install rather than orphaning the first controller', () => {
		// `vi.stubGlobal` replaces the global wholesale, so the first controller would survive as a
		// live object whose `setMatches` fires listeners nothing reads — an assertion that cannot fail
		// dressed as one that passed.
		installMatchMedia(DESKTOP_MEDIA_QUERY, true);

		expect(() => {
			installMatchMedia(REDUCED_MOTION_QUERY, true);
		}).toThrow(/already installed/);
	});
});
