/**
 * `renderScheduling.ts` — render-timed scheduling helpers that keep filter interactions feeling
 * instant: paint the user's optimistic change FIRST, then disable + show the loader, then call the
 * engine — each step on its own painted frame.
 *
 * @remarks
 * Dataset-agnostic: shared by every example-app dataset slice (wine, books, real-estate) via the
 * `@filter-enginez/examples-shared/scheduling` sub-export.
 *
 * @packageDocumentation
 */

/**
 * A callback that runs after a paint. May be synchronous (`void`) or async (`Promise<void>`); an
 * async callback is invoked fire-and-forget (`void callback()`), since the scheduler awaits a paint,
 * not the callback's completion. Need arguments? Wrap via partial application: `() => doThing(arg)`.
 */
export type AfterRenderCallback = () => Promise<void> | void;

/**
 * Run `callback` AFTER the browser has completed the next paint.
 *
 * @remarks
 * **Why double `requestAnimationFrame`.** The event-loop frame is `task → microtasks → render step
 * (rAF callbacks → style → layout → paint) → next task`. So the usual primitives all run too early
 * for "after the paint":
 *
 *   - `queueMicrotask` drains before the render step — runs before any paint.
 *   - `setTimeout(fn, 0)` is a macrotask the browser MAY paint before, but not reliably (timer can
 *     win the race; ~4ms clamp).
 *   - a single `requestAnimationFrame` runs INSIDE the render step, BEFORE that frame's paint.
 *
 * The first rAF runs in the current frame's render step (pre-paint); the second runs in the NEXT
 * frame's render step, by which point the current frame has painted. So `callback` runs once the
 * pending visual update is actually on screen.
 *
 * **Backgrounded tabs.** rAF is paused while the tab is hidden, so a scheduled callback waits until
 * the tab is foregrounded — correct for a user-driven filter interaction. The non-browser fallback
 * (SSR / tests) runs on the next macrotask, since there's no paint to await.
 *
 * @param callback - Work to run after the next paint (sync or async — async is fire-and-forget).
 */
export function executeAfterRender(callback: AfterRenderCallback): void {
	if (typeof requestAnimationFrame === 'function') {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				void callback();
			});
		});

		return;
	}
	setTimeout(() => {
		void callback();
	}, 0);
}

/**
 * Steps of a filter-mutation interaction, run in a fixed, paint-separated order.
 */
export interface FilterMutationSteps {
	/**
	 * Optimistic UI update — the control's new state (e.g. `setSelected(next)`), painted on the
	 * FIRST frame so the click/drag registers instantly. Optional: omit for interactions whose
	 * control already painted its own change (e.g. a search input committing on blur, or a slider
	 * whose thumb position is internal state) or that have no optimistic local state (e.g. clearing
	 * a rule, where the chip vanishes only once the engine confirms).
	 */
	readonly paintOptimisticUi?: () => void;
	/**
	 * Flip the busy state (`markUserAction`) — drives the disable overlay + computing loader. Runs
	 * AFTER the optimistic UI has painted, so the lock + loader land on the second frame.
	 */
	readonly markBusy: () => void;
	/**
	 * The engine mutation (e.g. `engine.core.addRule(...)`). Runs AFTER the disable + loader have
	 * painted, so the (potentially heavy) recompute / worker round-trip never blocks either paint.
	 */
	readonly callEngine: AfterRenderCallback;
}

/**
 * Drive a filter mutation through the canonical interaction order, each step on its own painted
 * frame:
 *
 *   1. `paintOptimisticUi()` — synchronous; React commits + paints the control's new state.
 *   2. (after that paint) `markBusy()` — disable the surface + show the computing loader; paints.
 *   3. (after that paint) `callEngine()` — run the engine off the pre-paint critical path.
 *
 * The downstream steps the caller doesn't own — render results, remove the disable, return the
 * loader to idle — follow automatically when the engine's bundle fetch resolves and advances the
 * busy tracker's resolved version.
 *
 * @remarks
 * Keeping `markBusy` out of the synchronous click handler is the load-bearing part: it shrinks the
 * handler to just the optimistic update, so the discrete-event commit (what Chrome's "click took
 * Nms" violation measures) stays cheap.
 *
 * @param steps - The optimistic-paint (optional), busy-flip, and engine-call callbacks.
 */
export function commitFilterMutation(steps: FilterMutationSteps): void {
	steps.paintOptimisticUi?.();
	executeAfterRender(() => {
		steps.markBusy();
		executeAfterRender(steps.callEngine);
	});
}
