/**
 * `realEstateBusy` — the Vue real-estate route's engine-busy module (one tracker for the whole route).
 *
 * @remarks
 * One tracker instance for this route, independent of the books one, so a stale filter on another
 * route can never light this route's indicator.
 *
 * ### Why this exports the TRACKER, not a ready-made store
 *
 * Svelte's equivalent exports `isEngineBusy` — a `Readable<boolean>` built once at module scope by
 * `busyStore(tracker)`. Vue cannot do that: `useBusy(tracker)` calls `onScopeDispose` internally, so it
 * must run inside a component's `setup()`. Calling it at module scope would register a disposal hook
 * against whatever scope happened to be active at import time, or none at all.
 *
 * So the shape here matches `booksBusy.ts` instead: the tracker instance is the export, and each
 * component that wants to READ busy state calls `useBusy(realEstateBusyTracker)` in its own `setup()`.
 * The WRITE side is three plain functions, identical in every vertical.
 *
 * `createEngineBusyTracker` from `reactive-signals` is bound directly rather than going through
 * `examples-shared`'s `createEngineBusyModule`, which pulls `useEngineBusy` from `react-signals` and
 * would drag React into this bundle.
 *
 * **How visible this indicator is depends on the tier.** Real estate boots on the MAIN THREAD, like
 * books: a commit bumps the user-action version and the next settle clears it, usually within a frame,
 * so the indicator rarely lights. That is honest rather than useless — it is the same contract the
 * worker-backed wine route uses, where the gap is real and visible.
 *
 * The predicate is `userActionVersion > resolvedVersion`, which is monotonic: clicks landing during an
 * in-flight settle push the user version further ahead, so the indicator stays lit through a burst
 * rather than flickering once per settle.
 *
 * @packageDocumentation
 */

import { createEngineBusyTracker } from '@filter-enginez/reactive-signals';

/**
 * The real-estate route's single busy tracker instance. Components read its busy state with
 * `useBusy(realEstateBusyTracker)` from `@filter-enginez/vue-signals`, called in `setup()`.
 */
export const realEstateBusyTracker = createEngineBusyTracker();

/** Snapshot the current user-action version. The bundle fetcher captures this at fetch start. */
export function captureCurrentVersion(): number {
	return realEstateBusyTracker.captureCurrentVersion();
}

/** Advance the resolved version to at least `version` — call on every settle outcome. */
export function markResolvedAtLeast(version: number): void {
	realEstateBusyTracker.markResolvedAtLeast(version);
}

/** Increment the user-action version — call in a commit handler BEFORE the engine write. */
export function markUserAction(): void {
	realEstateBusyTracker.markUserAction();
}
