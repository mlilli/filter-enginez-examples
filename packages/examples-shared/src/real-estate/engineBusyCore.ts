/**
 * `engineBusyCore` — the real-estate route's engine-busy tracker, React-free.
 *
 * @remarks
 * **This module owns THE instance.** The route needs exactly one busy tracker shared by its commit
 * handlers, its settle hooks, and whatever header renders the "computing" indicator. Creating it here,
 * in the neutral module, is what lets a Svelte / Vue / Angular / vanilla real-estate route drive the
 * busy state without importing React — `./engineBusy.js` then binds the React hook to this same
 * instance rather than making a second one.
 *
 * If you ever find yourself calling `createEngineBusyCore()` a second time for this route: don't. Two
 * trackers means the indicator never lights up, and nothing errors — the symptom is simply a filter
 * UI that feels instant and never shows it's working.
 *
 * @packageDocumentation
 */

import { createEngineBusyCore } from '../scheduling/createEngineBusyCore.js';

/** The real-estate route's engine-busy core — one tracker instance for the whole route. */
export const realEstateBusyCore = createEngineBusyCore();

export const {
	captureCurrentVersion,
	getIsEngineBusy,
	markResolvedAtLeast,
	markUserAction,
	subscribeEngineBusy,
} = realEstateBusyCore;
