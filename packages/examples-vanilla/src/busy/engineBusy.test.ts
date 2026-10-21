/**
 * The engine-busy plumbing: the core's predicate, the deferred resolve and the binding.
 *
 * @packageDocumentation
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { afterNextPaint, bindBusyState, booksBusyCore, createBusyCore, resolveAfterPaint } from './engineBusy.js';

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('createBusyCore', () => {
	it('is busy from the mark until a resolve covers it, and a stale resolve does not clear it', () => {
		const busy = createBusyCore();

		expect(busy.getIsEngineBusy()).toBe(false);

		busy.markUserAction();

		const first = busy.captureCurrentVersion();

		busy.markUserAction();
		expect(busy.getIsEngineBusy()).toBe(true);

		// A settle for the FIRST write only: the second is still pending.
		busy.markResolvedAtLeast(first);
		expect(busy.getIsEngineBusy()).toBe(true);

		busy.markResolvedAtLeast(busy.captureCurrentVersion());
		expect(busy.getIsEngineBusy()).toBe(false);
	});

	it('gives books its own instance, independent of a fresh core', () => {
		const other = createBusyCore();

		other.markUserAction();

		expect(other.getIsEngineBusy()).toBe(true);
		expect(booksBusyCore.getIsEngineBusy()).toBe(false);
	});
});

describe('afterNextPaint', () => {
	it('waits two animation frames', () => {
		vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout']});

		const callback = vi.fn();

		afterNextPaint(callback);
		vi.advanceTimersToNextFrame();
		expect(callback).not.toHaveBeenCalled();

		vi.advanceTimersToNextFrame();
		expect(callback).toHaveBeenCalledOnce();
	});

	it('falls back to a macrotask without requestAnimationFrame', () => {
		vi.useFakeTimers({ toFake: ['setTimeout']});
		vi.stubGlobal('requestAnimationFrame', undefined);

		const callback = vi.fn();

		afterNextPaint(callback);
		expect(callback).not.toHaveBeenCalled();

		vi.advanceTimersByTime(0);
		expect(callback).toHaveBeenCalledOnce();
	});
});

describe('resolveAfterPaint + bindBusyState', () => {
	it('keeps the state lit for a frame, then clears it, and repaints on each change', () => {
		vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout']});

		const busy = createBusyCore();
		const painted: boolean[] = [];
		const stop = bindBusyState(busy, (isBusy) => {
			painted.push(isBusy);
		});

		busy.markUserAction();
		resolveAfterPaint(busy);

		// Marked, and still marked after the first frame: the resolve lands only after a paint.
		vi.advanceTimersToNextFrame();
		expect(busy.getIsEngineBusy()).toBe(true);

		vi.advanceTimersToNextFrame();
		expect(busy.getIsEngineBusy()).toBe(false);
		expect(painted).toEqual([false, true, false]);

		stop();
		busy.markUserAction();
		expect(painted).toEqual([false, true, false]);
	});

	it('resolves only the version it was given', () => {
		vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout']});

		const busy = createBusyCore();

		busy.markUserAction();

		const covered = busy.captureCurrentVersion();

		busy.markUserAction();
		resolveAfterPaint(busy, covered);
		vi.advanceTimersToNextFrame();
		vi.advanceTimersToNextFrame();

		expect(busy.getIsEngineBusy()).toBe(true);
	});
});
