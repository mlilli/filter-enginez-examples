/**
 * `createEngineBusyModule` — factory for a per-dataset engine-busy module.
 *
 * @remarks
 * Each example-app dataset route (wine, books, real-estate) needs its OWN engine-busy tracker so one
 * route's "computing" state can't bleed into another's (only one route mounts at a time, but keeping
 * independent instances makes the seam explicit). The version-comparison logic lives framework-neutral
 * in `@filter-enginez/reactive-signals` (`createEngineBusyTracker`); the React binding is
 * `useEngineBusy` in `@filter-enginez/react-signals`. This factory wraps one tracker instance in the
 * convenience names every dataset uses, so each dataset's `engineBusy.ts` collapses to a single call.
 *
 * The tracker's methods are closures (no `this`), so the returned forwarders are safe to detach.
 *
 * @packageDocumentation
 */

import { useEngineBusy } from '@filter-enginez/react-signals';

import { createEngineBusyCore, type EngineBusyCore } from './createEngineBusyCore.js';

/**
 * The convenience surface one dataset route binds to — a single busy-tracker instance exposed under
 * the names the commit handlers + results headers already use.
 */
export interface EngineBusyModule {
	/** Snapshot the current user-action version (a bundle hook captures this at fetch-start). */
	readonly captureCurrentVersion: () => number;
	/** `useSyncExternalStore`-compatible snapshot — `true` while user work is pending. */
	readonly getIsEngineBusy: () => boolean;
	/** Advance the resolved version to at least `version` (a settle hook calls this on resolve). */
	readonly markResolvedAtLeast: (version: number) => void;
	/** Increment the user-action version (call in a commit handler before the engine call). */
	readonly markUserAction: () => void;
	/** `useSyncExternalStore`-compatible subscribe. */
	readonly subscribeEngineBusy: (listener: () => void) => () => void;
	/** React hook — `true` while a user action is pending an as-yet-unresolved settle. */
	readonly useIsEngineBusy: () => boolean;
}

/**
 * Create a fresh engine-busy module — one tracker instance plus its convenience forwarders. Call
 * once per dataset route (at module scope) so each route owns an independent busy signal.
 *
 * @returns A self-contained {@link EngineBusyModule} bound to a new tracker instance.
 */
export function createEngineBusyModule(): EngineBusyModule {
	const core = createEngineBusyCore();

	return { ...withReactBusyHook(core) };
}

/**
 * Attach the React `useIsEngineBusy` hook to an EXISTING {@link EngineBusyCore}, returning the full
 * module surface.
 *
 * @remarks
 * Exported for the case `createEngineBusyModule` can't serve: a route whose neutral half must be
 * importable without React (so the core is created in its own module) but whose React app still wants
 * the hook. Binding to the passed-in core rather than making a new one is the whole point — two
 * trackers means a busy indicator that never lights up, and it fails silently.
 *
 * @param core - The already-created neutral core to bind against.
 * @returns The core's members plus the React hook.
 */
export function withReactBusyHook(core: EngineBusyCore): EngineBusyModule {
	/** React hook — `true` while a user action is pending an as-yet-unresolved settle. */
	function useIsEngineBusy(): boolean {
		return useEngineBusy(core.tracker);
	}

	return {
		captureCurrentVersion: core.captureCurrentVersion,
		getIsEngineBusy: core.getIsEngineBusy,
		markResolvedAtLeast: core.markResolvedAtLeast,
		markUserAction: core.markUserAction,
		subscribeEngineBusy: core.subscribeEngineBusy,
		useIsEngineBusy,
	};
}
