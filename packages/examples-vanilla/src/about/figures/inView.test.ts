/**
 * Tests for `observeInView` — the framework-less in-view gate for the About-page figures.
 *
 * @remarks
 * ### jsdom has no `IntersectionObserver`, so BOTH branches need deliberate setup
 *
 * `typeof IntersectionObserver` is `undefined` under jsdom. That
 * makes the SSR fallback the default path — `pages.test.ts` already leans on it, and its comment
 * says a clean About render "also proves those guards work", which is true and is the whole of what
 * it proves. Everything this module actually decides lives in the other branch, and reaching it
 * means installing a fake.
 *
 * ### The fake records its constructor options on purpose
 *
 * `threshold` is the one number here that has to agree with four other verticals, and it is
 * invisible in the DOM: an observer built with the wrong fraction behaves identically in every
 * assertion about classes. Capturing the options is the only channel that can see it.
 *
 * @packageDocumentation
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { observeInView } from './inView.js';

/** Every observer built since the last `installObserver()`, in construction order. */
const built: FakeIntersectionObserver[] = [];

/**
 * A stand-in for the browser's observer, recording what it was built with and what it observed.
 *
 * @remarks
 * Deliberately partial: the module calls `observe` and `disconnect` and reads nothing back, so
 * `takeRecords`, `root`, `rootMargin` and `unobserve` would be values no assertion consults.
 */
class FakeIntersectionObserver {
	/** Elements passed to `observe`. */
	public readonly observed: Element[] = [];

	/** How many times `disconnect` has been called. */
	public disconnectCount = 0;

	public constructor(
		private readonly _callback: IntersectionObserverCallback,
		public readonly options?: IntersectionObserverInit,
	) {
		built.push(this);
	}

	public disconnect(): void {
		this.disconnectCount += 1;
	}

	public observe(element: Element): void {
		this.observed.push(element);
	}

	/** Deliver an intersection callback, as the browser would on a scroll. */
	public emit(isIntersecting: boolean): void {
		// Only the field the module reads. A fuller `IntersectionObserverEntry` would be inventing
		// eight values nothing asserts on, and inviting the next reader to trust them.
		this._callback(
			[{ isIntersecting } as unknown as IntersectionObserverEntry],
			this as unknown as IntersectionObserver,
		);
	}
}

/**
 * Install the fake and reset the instance log.
 *
 * @returns The list the constructor pushes into.
 */
function installObserver(): readonly FakeIntersectionObserver[] {
	built.length = 0;
	vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);

	return built;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('with an IntersectionObserver', () => {
	it('starts unplayed and observes the element it was given', () => {
		// Unplayed at construction is the point: the figure rests on its completed static frame
		// until it scrolls into view, which is what makes the animation worth watching at all.
		const observers = installObserver();
		const element = document.createElement('div');

		observeInView(element);

		expect(element.classList.contains('is-playing')).toBe(false);
		expect(observers).toHaveLength(1);
		expect(observers[0]?.observed).toEqual([element]);
	});

	it('plays while intersecting and STOPS when the figure leaves', () => {
		// Both directions. A mutant that only ever adds the class passes the first half, and ships a
		// page where every figure animates forever once scrolled past — on a route with eight of them.
		const observers = installObserver();
		const element = document.createElement('div');

		observeInView(element);
		observers[0]?.emit(true);

		expect(element.classList.contains('is-playing')).toBe(true);

		observers[0]?.emit(false);

		expect(element.classList.contains('is-playing')).toBe(false);
	});

	it('uses the shared 0.35 threshold by default', () => {
		// Written as a literal deliberately. The constant is module-private, so reading it back
		// would restate the implementation; and the value's job is to MATCH the other four
		// verticals, which a test importing the same constant could never check.
		const observers = installObserver();

		observeInView(document.createElement('div'));

		expect(observers[0]?.options).toEqual({ threshold: 0.35 });
	});

	it('passes a caller-supplied threshold through', () => {
		const observers = installObserver();

		observeInView(document.createElement('div'), 0.9);

		expect(observers[0]?.options).toEqual({ threshold: 0.9 });
	});

	it('disconnects on teardown, and tolerates being torn down twice', () => {
		// The About page maps a teardown per figure and calls them in one pass on unmount; a route
		// that unmounts twice under a navigation race must not throw on the second.
		const observers = installObserver();
		const teardown = observeInView(document.createElement('div'));

		teardown();
		teardown();

		expect(observers[0]?.disconnectCount).toBe(2);
	});
});

describe('without an IntersectionObserver', () => {
	it('plays immediately, so the static markup shows the completed frame', () => {
		// SSR and jsdom. "Treat as visible" is the same fallback the other four verticals use —
		// the alternative is a figure frozen on its first frame with nothing to un-freeze it.
		const element = document.createElement('div');

		observeInView(element);

		expect(element.classList.contains('is-playing')).toBe(true);
	});

	it('returns a teardown that is safe to call', () => {
		const teardown = observeInView(document.createElement('div'));

		expect(() => {
			teardown();
		}).not.toThrow();
	});
});
