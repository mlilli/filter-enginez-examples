/**
 * `engineBusyCore` — the wine route's engine-busy tracker, React-free.
 *
 * @remarks
 * **This module owns THE instance.** Every wine vertical needs one tracker shared by its commit
 * handlers, its settle hooks and whatever renders the "computing" indicator. Creating it here is what
 * lets a Svelte / Vue / Angular / vanilla wine route drive busy state without importing React —
 * `./engineBusy.js` binds the React hook to this same instance rather than making a second one.
 *
 * Real estate is split the same way; books, with no non-React consumer of its busy state, is not.
 *
 * **This indicator does more work than books'.** The books engine is synchronous and main-thread, so a
 * commit and its settle land in the same frame and the indicator never visibly lights. Wine runs 130k
 * records behind a Comlink worker, where every mutation is a round trip of real, visible duration. The
 * predicate is `userActionVersion > resolvedVersion`, which is monotonic — clicks landing DURING a
 * round trip push the user version further ahead, so the indicator stays lit through a burst instead
 * of flickering once per settle.
 *
 * If you ever find yourself calling `createEngineBusyCore()` a second time for this route: don't. Two
 * trackers means the indicator never lights, and nothing errors — the symptom is a filter UI that
 * feels instant and never admits it is working.
 *
 * @packageDocumentation
 */

import { createEngineBusyCore } from '../scheduling/createEngineBusyCore.js';

/** The wine route's engine-busy core — one tracker instance for the whole route. */
export const wineBusyCore = createEngineBusyCore();

export const {
	captureCurrentVersion,
	getIsEngineBusy,
	markResolvedAtLeast,
	markUserAction,
	subscribeEngineBusy,
} = wineBusyCore;
