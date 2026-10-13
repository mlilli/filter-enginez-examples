/**
 * Tests for the render-scheduling helpers behind every filter mutation.
 *
 * @remarks
 * **What this module is actually for.** Engine work on a large corpus blocks the main thread. If a
 * chip toggle called the engine synchronously, the browser would never get a frame to paint the
 * chip's own pressed state or the busy indicator — so the UI would appear frozen for the duration and
 * then jump straight to the finished result, with no feedback that anything was happening. The
 * double-`requestAnimationFrame` buys a committed paint before the blocking call starts.
 *
 * That makes the ORDER the entire contract, and order is what these tests assert. Collapsing the two
 * frames, or moving `markBusy` ahead of the first paint, produces a UI that still ends in the right
 * state — it just stutters, which no assertion about final state would ever catch.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { commitFilterMutation, executeAfterRender } from './renderScheduling.js';

/** Frame callbacks captured from the rAF stub, in scheduling order. */
let frames: FrameRequestCallback[];

/** Run every queued frame once, in order — one "tick" of the browser's frame loop. */
function flushOneFrame(): void {
	const queued = frames.splice(0);

	for (const frame of queued) {
		frame(0);
	}
}

beforeEach(() => {
	frames = [];
	vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback): number => frames.push(callback));
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('executeAfterRender', () => {
	it('waits TWO frames before running the callback', () => {
		// One frame is not enough: the first only guarantees the browser has been handed the work, the
		// second that it has actually painted. Collapsing to a single rAF is the classic version of this
		// bug — it looks correct and still blocks before the pixels land.
		const callback = vi.fn();

		executeAfterRender(callback);

		expect(callback).not.toHaveBeenCalled();

		flushOneFrame();

		expect(callback).not.toHaveBeenCalled();

		flushOneFrame();

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('falls back to a macrotask where requestAnimationFrame does not exist', () => {
		// SSR, jsdom without the shim, and non-browser hosts. Throwing here would take down every
		// filter interaction on a host that simply has no frames to wait for.
		vi.useFakeTimers();
		vi.stubGlobal('requestAnimationFrame', undefined);

		const callback = vi.fn();

		executeAfterRender(callback);

		expect(callback).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);

		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('does not schedule frames at all on the fallback path', () => {
		vi.useFakeTimers();
		vi.stubGlobal('requestAnimationFrame', undefined);
		executeAfterRender(vi.fn());

		expect(frames).toHaveLength(0);
	});
});

describe('commitFilterMutation', () => {
	it('paints the optimistic UI synchronously, before any frame', () => {
		// The whole point of the optimistic step: the chip must look pressed on the same tick the user
		// clicked it. Deferring it into a frame reintroduces exactly the lag this module removes.
		const order: string[] = [];

		commitFilterMutation({
			callEngine: () => {
				order.push('engine');
			},
			markBusy: () => {
				order.push('busy');
			},
			paintOptimisticUi: () => {
				order.push('paint');
			},
		});

		expect(order).toEqual(['paint']);
	});

	it('marks busy after the optimistic paint has landed, and calls the engine after THAT paints', () => {
		// Three separate commits, in order: the pressed chip, then the busy indicator, then the blocking
		// engine call. Each needs its own painted frame or the user sees none of the intermediate
		// states — just a freeze followed by the answer.
		const order: string[] = [];

		commitFilterMutation({
			callEngine: () => {
				order.push('engine');
			},
			markBusy: () => {
				order.push('busy');
			},
			paintOptimisticUi: () => {
				order.push('paint');
			},
		});

		flushOneFrame();
		flushOneFrame();

		expect(order).toEqual(['paint', 'busy']);

		flushOneFrame();
		flushOneFrame();

		expect(order).toEqual(['paint', 'busy', 'engine']);
	});

	it('works without an optimistic paint step', () => {
		// `paintOptimisticUi` is optional — some controls have nothing to pre-paint. The busy/engine
		// sequencing must still hold rather than throwing on the missing callback.
		const order: string[] = [];

		commitFilterMutation({
			callEngine: () => {
				order.push('engine');
			},
			markBusy: () => {
				order.push('busy');
			},
		});

		flushOneFrame();
		flushOneFrame();

		expect(order).toEqual(['busy']);

		flushOneFrame();
		flushOneFrame();

		expect(order).toEqual(['busy', 'engine']);
	});

	it('awaits nothing — an async engine call is fired, not blocked on', () => {
		// `callEngine` may return a promise; the scheduler deliberately does not await it. Awaiting
		// would serialize rapid interactions behind each other rather than letting the newest win.
		const order: string[] = [];

		commitFilterMutation({
			callEngine: async () => {
				order.push('engine-start');

				return Promise.resolve();
			},
			markBusy: () => {
				order.push('busy');
			},
		});

		flushOneFrame();
		flushOneFrame();
		flushOneFrame();
		flushOneFrame();

		expect(order).toEqual(['busy', 'engine-start']);
	});
});
