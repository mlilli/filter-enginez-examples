/**
 * Tests for the `useInView` IntersectionObserver hook — the no-observer guard (jsdom) and the
 * observe → intersect → leave lifecycle via a stubbed observer.
 *
 * @packageDocumentation
 */

import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useInView, type UseInViewOptions } from './useInView.js';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

/** A host whose ref is never attached to an element — the pre-mount / conditional-render case. */
const DetachedHarness = (): React.ReactElement => {
	const ref = useRef<HTMLDivElement>(null);
	const isVisible = useInView(ref);

	return <div>{isVisible ? 'in' : 'out'}</div>;
};

/** A minimal host that surfaces the hook's boolean as text. */
const Harness = ({ options }: { options?: UseInViewOptions }): React.ReactElement => {
	const ref = useRef<HTMLDivElement>(null);
	const isVisible = useInView(ref, options);

	return <div ref={ref}>{isVisible ? 'in' : 'out'}</div>;
};

/** Build a partial `IntersectionObserverEntry` with just the field the hook reads. */
function entry(isIntersecting: boolean): IntersectionObserverEntry {
	return { isIntersecting } as unknown as IntersectionObserverEntry;
}

/** Install a controllable fake `IntersectionObserver`; returns a handle to fire its callback. */
function installFakeObserver(): { disconnected: boolean; fire: (isIntersecting: boolean) => void; fireEmpty: () => void } {
	const handle = { callback: null as IntersectionObserverCallback | null, disconnected: false };

	class FakeObserver {
		readonly disconnect = (): void => {
			handle.disconnected = true;
		};

		readonly observe = (): void => {
			// no-op — the test drives the callback directly via `fire`
		};

		constructor(callback: IntersectionObserverCallback) {
			handle.callback = callback;
		}
	}

	vi.stubGlobal('IntersectionObserver', FakeObserver);

	return {
		get disconnected(): boolean {
			return handle.disconnected;
		},
		fire(isIntersecting: boolean): void {
			act(() => {
				handle.callback?.([entry(isIntersecting)], {} as IntersectionObserver);
			});
		},
		fireEmpty(): void {
			act(() => {
				handle.callback?.([], {} as IntersectionObserver);
			});
		},
	};
}

describe('useInView', () => {
	it('latches true when IntersectionObserver is unavailable', () => {
		const { container } = render(<Harness />);

		expect(container.textContent).toBe('in');
	});

	it('reflects intersection enter + leave', () => {
		const observer = installFakeObserver();
		const { container } = render(<Harness />);

		expect(container.textContent).toBe('out');
		observer.fire(true);
		expect(container.textContent).toBe('in');
		observer.fire(false);
		expect(container.textContent).toBe('out');
	});

	it('with isOnce, latches on first enter and disconnects', () => {
		const observer = installFakeObserver();
		const { container } = render(<Harness options={{ isOnce: true }} />);

		observer.fire(true);
		expect(container.textContent).toBe('in');
		expect(observer.disconnected).toBe(true);
		observer.fire(false);
		expect(container.textContent).toBe('in');
	});

	it('does nothing when the ref was never attached', () => {
		// A figure inside a collapsed section has a null ref on the first effect run. Constructing an
		// observer over `null` throws, so the guard is what keeps a conditionally-rendered figure from
		// taking down the whole About page.
		installFakeObserver();

		const { container } = render(<DetachedHarness />);

		expect(container.textContent).toBe('out');
	});

	it('ignores a callback carrying no entries', () => {
		// The spec allows an observer callback with an empty batch. Reading `entries[0]` unguarded under
		// `noUncheckedIndexedAccess` would be `undefined`, and `undefined.isIntersecting` throws inside
		// the observer callback — where the error surfaces detached from any component.
		const observer = installFakeObserver();
		const { container } = render(<Harness />);

		observer.fire(true);
		observer.fireEmpty();

		expect(container.textContent).toBe('in');
	});
});
