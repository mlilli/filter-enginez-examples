/**
 * Tests for `trackDesktopBreakpoint` — the framework-less two-column breakpoint switch.
 *
 * @remarks
 * ### Why this module has its own suite
 *
 * `shell/appShell.test.ts` hand-builds a fake for it. A fake is only as good as the understanding
 * behind it, so this suite checks the real behavior that fake stands in for.
 *
 * ### jsdom has no `matchMedia`, which makes the FALLBACK the default path
 *
 * `typeof window.matchMedia` is `undefined` under jsdom. So the "hostile environment, treat it as
 * desktop" branch is what any test that installs no stub exercises, and the three states that
 * matter — mobile, mobile-with-drawer-open, and a breakpoint CROSS — are unreachable without a stub. Installing one is not a convenience
 * here; it is the only way to reach the code that makes decisions.
 *
 * ### The re-seeding case points at the half that can fail
 *
 * The docblock's rule is that crossing the breakpoint re-seeds the drawer as well as the layout, so
 * a close / rotate / rotate-back lands closed. Starting closed and ending closed is the same under
 * both implementations — it is the user who OPENED the drawer whose answer differs, and that is the
 * sequence the guard uses (the lesson: point it at the failing half).
 *
 * @packageDocumentation
 */

import { DESKTOP_MEDIA_QUERY } from '@filter-enginez/examples-shared/viewport-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installMatchMedia } from '../test-support/matchMedia.js';
import { trackDesktopBreakpoint } from './desktopBreakpoint.js';

// `installMatchMedia` lives in `test-support/` because several suites share it. Its deliberate
// partiality (matches, media, and the two listener methods — nothing else) is documented there
// rather than restated here. The query is passed EXPLICITLY at every call site below: the stub
// answers only the query it was installed for, so a stub that answered every query with one flag
// would tell `brand/motion` that reduced motion was preferred in suites that never asked.

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('seeding', () => {
	it('boots from the media query — desktop', () => {
		installMatchMedia(DESKTOP_MEDIA_QUERY, true);

		const breakpoint = trackDesktopBreakpoint();

		expect(breakpoint.isDesktop()).toBe(true);
		expect(breakpoint.isFilterOpen()).toBe(true);
		expect(breakpoint.shouldShowPanel()).toBe(true);
	});

	it('boots from the media query — mobile, with the drawer shut', () => {
		installMatchMedia(DESKTOP_MEDIA_QUERY, false);

		const breakpoint = trackDesktopBreakpoint();

		expect(breakpoint.isDesktop()).toBe(false);
		expect(breakpoint.isFilterOpen()).toBe(false);
		expect(breakpoint.shouldShowPanel()).toBe(false);
	});

	it('asks for the SHARED query rather than a locally-written one', () => {
		// The number itself lives in `examples-shared`'s `viewportCore` and is what `ui-styles`
		// switches `.fe-sidebar-app__main` on; the two disagreeing by a pixel leaves a viewport with
		// no visible panel AND no button to open one. This asserts only that the module reads the
		// shared constant — a local literal that drifts is the failure available here.
		//
		// Because the stub is query-aware there is a second, independent signal for the same defect:
		// a drifted literal is no longer the CONTROLLED query, so it reports `false` and every seeding
		// case above fails too. Two assertions on one property is not redundancy when one of them names
		// the cause and the other only reports a symptom.
		const media = installMatchMedia(DESKTOP_MEDIA_QUERY, true);

		trackDesktopBreakpoint();

		expect(media.queries).toEqual([DESKTOP_MEDIA_QUERY]);
	});

	it('defaults to DESKTOP where matchMedia does not exist', () => {
		// No stub installed — jsdom, SSR, any hostile environment. The panel is PRESENT rather than
		// hidden behind a button that is also not there, which is the more usable of the two states.
		const breakpoint = trackDesktopBreakpoint();

		expect(breakpoint.isDesktop()).toBe(true);
		expect(breakpoint.shouldShowPanel()).toBe(true);
	});

	it('has nothing to detach when matchMedia is absent', () => {
		const breakpoint = trackDesktopBreakpoint();

		expect(() => {
			breakpoint.dispose();
		}).not.toThrow();
	});
});

describe('crossing the breakpoint', () => {
	it('re-seeds the DRAWER as well as the layout, so a rotate round-trip lands shut', () => {
		// The sequence from the docblock, and deliberately the OPENED one: a user who never touched
		// the drawer ends shut under both implementations, so only this one can tell them apart.
		const media = installMatchMedia(DESKTOP_MEDIA_QUERY, false);
		const breakpoint = trackDesktopBreakpoint();

		breakpoint.toggleFilters();

		expect(breakpoint.isFilterOpen()).toBe(true);

		media.setMatches(true);
		media.setMatches(false);

		expect(breakpoint.isDesktop()).toBe(false);
		expect(breakpoint.isFilterOpen()).toBe(false);
	});

	it('turns the two-column layout on when the viewport widens', () => {
		const media = installMatchMedia(DESKTOP_MEDIA_QUERY, false);
		const breakpoint = trackDesktopBreakpoint();

		media.setMatches(true);

		expect(breakpoint.isDesktop()).toBe(true);
		expect(breakpoint.shouldShowPanel()).toBe(true);
	});

	it('notifies subscribers on a change', () => {
		const media = installMatchMedia(DESKTOP_MEDIA_QUERY, false);
		const breakpoint = trackDesktopBreakpoint();
		let notifyCount = 0;

		breakpoint.subscribe(() => {
			notifyCount += 1;
		});
		media.setMatches(true);

		expect(notifyCount).toBe(1);
	});
});

describe('shouldShowPanel', () => {
	it('is a DISJUNCTION — desktop keeps the panel even with the drawer flag off', () => {
		// The `&&` mutant's home. On desktop the drawer flag is meaningless, so a conjunction would
		// let a stray toggle erase the permanent sidebar on a viewport that has no button to
		// restore it.
		installMatchMedia(DESKTOP_MEDIA_QUERY, true);

		const breakpoint = trackDesktopBreakpoint();

		breakpoint.toggleFilters();

		expect(breakpoint.isFilterOpen()).toBe(false);
		expect(breakpoint.isDesktop()).toBe(true);
		expect(breakpoint.shouldShowPanel()).toBe(true);
	});

	it('follows the drawer on mobile, in both directions', () => {
		installMatchMedia(DESKTOP_MEDIA_QUERY, false);

		const breakpoint = trackDesktopBreakpoint();

		expect(breakpoint.shouldShowPanel()).toBe(false);

		breakpoint.toggleFilters();

		expect(breakpoint.shouldShowPanel()).toBe(true);

		breakpoint.toggleFilters();

		expect(breakpoint.shouldShowPanel()).toBe(false);
	});
});

describe('subscription', () => {
	it('notifies every subscriber on a toggle', () => {
		installMatchMedia(DESKTOP_MEDIA_QUERY, false);

		const breakpoint = trackDesktopBreakpoint();
		const seen: string[] = [];

		breakpoint.subscribe(() => {
			seen.push('first');
		});
		breakpoint.subscribe(() => {
			seen.push('second');
		});
		breakpoint.toggleFilters();

		expect(seen).toEqual(['first', 'second']);
	});

	it('unsubscribing stops one listener without disturbing the rest', () => {
		installMatchMedia(DESKTOP_MEDIA_QUERY, false);

		const breakpoint = trackDesktopBreakpoint();
		const seen: string[] = [];
		const unsubscribe = breakpoint.subscribe(() => {
			seen.push('gone');
		});

		breakpoint.subscribe(() => {
			seen.push('kept');
		});
		unsubscribe();
		breakpoint.toggleFilters();

		expect(seen).toEqual(['kept']);
	});
});

describe('dispose', () => {
	it('detaches the media listener, so a later resize cannot move the state', () => {
		// 🔴 Asserted through `isDesktop()`, NOT through a subscriber. `dispose` also clears the
		// listener set, so a leaked media listener notifies nobody and a subscriber-based assertion
		// is green over it — while the state it silently mutates is exactly what the next render
		// reads.
		const media = installMatchMedia(DESKTOP_MEDIA_QUERY, false);
		const breakpoint = trackDesktopBreakpoint();

		breakpoint.dispose();
		media.setMatches(true);

		expect(breakpoint.isDesktop()).toBe(false);
		expect(media.listenerCount()).toBe(0);
	});

	it('drops subscribers, so a route torn down mid-flight hears nothing more', () => {
		installMatchMedia(DESKTOP_MEDIA_QUERY, false);

		const breakpoint = trackDesktopBreakpoint();
		let notifyCount = 0;

		breakpoint.subscribe(() => {
			notifyCount += 1;
		});
		breakpoint.dispose();
		breakpoint.toggleFilters();

		expect(notifyCount).toBe(0);
	});
});
