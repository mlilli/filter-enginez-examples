/**
 * `createEngineBusyCore` — the framework-neutral half of a per-dataset engine-busy module.
 *
 * @remarks
 * **Why this is split out from `createEngineBusyModule`.** That factory bundles the neutral tracker
 * forwarders together with a React hook, so it imports `@filter-enginez/react-signals` — which means
 * any module reaching for `markUserAction` would inherit a React dependency. Every vertical's commit
 * handlers need `markUserAction` / `captureCurrentVersion` to drive their own "computing" indicator,
 * and a Svelte or Angular app has no business importing a React hooks package to get them.
 *
 * So the neutral five live here, and {@link createEngineBusyModule} builds on this — same tracker
 * instance, plus the hook.
 *
 * The tracker's methods are closures (no `this`), so the returned forwarders are safe to detach.
 *
 * @packageDocumentation
 */

import { createEngineBusyTracker, type EngineBusyTracker } from '@filter-enginez/reactive-signals';

/**
 * The framework-neutral engine-busy surface: everything a commit handler or a settle hook needs, with
 * no reactive-framework binding.
 */
export interface EngineBusyCore {
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
	/**
	 * The underlying tracker, exposed so a framework binding can attach to the SAME instance. A
	 * binding that calls the factory again would get an independent tracker and a busy indicator that
	 * never lights up — the failure is silent, which is exactly why this is exposed rather than
	 * re-derived.
	 */
	readonly tracker: EngineBusyTracker;
}

/**
 * Create a fresh neutral engine-busy core — one tracker instance plus its forwarders. Call once per
 * dataset route (at module scope) so each route owns an independent busy signal.
 *
 * @returns A self-contained {@link EngineBusyCore} bound to a new tracker instance.
 */
export function createEngineBusyCore(): EngineBusyCore {
	const tracker = createEngineBusyTracker();

	return {
		captureCurrentVersion: (): number => tracker.captureCurrentVersion(),
		getIsEngineBusy: (): boolean => tracker.getIsBusy(),
		markResolvedAtLeast: (version: number): void => {
			tracker.markResolvedAtLeast(version);
		},
		markUserAction: (): void => {
			tracker.markUserAction();
		},
		subscribeEngineBusy: (listener: () => void): (() => void) => tracker.subscribe(listener),
		tracker,
	};
}
