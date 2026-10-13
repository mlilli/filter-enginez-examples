/**
 * `realEstateBusy` — the Svelte real-estate route's engine-busy module.
 *
 * @remarks
 * One tracker instance for this route, independent of the books and wine ones, so a stale filter on
 * another route can never light this route's indicator.
 *
 * Binds `createEngineBusyTracker` from `reactive-signals` directly rather than going through
 * `examples-shared`'s `createEngineBusyModule`, which pulls `useEngineBusy` from `react-signals` and
 * would drag React into this bundle. (`examples-shared` now also exposes a React-free
 * `createEngineBusyCore`, but wiring the tracker here keeps this file identical in shape to
 * `wineBusy` / `booksBusy`, and the Svelte binding it needs — `busyStore` — is local anyway.)
 *
 * **How visible this indicator is depends on the tier.** Real estate boots on the MAIN THREAD, like
 * books: a commit bumps the user-action version and the next settle clears it, usually within a frame,
 * so the indicator rarely lights. That is honest rather than useless — it is the same contract the
 * worker-backed wine route uses, where the gap is real and visible, so the indicator is correct on any
 * tier without per-dataset plumbing.
 *
 * The predicate is `userActionVersion > resolvedVersion`, which is monotonic: clicks landing during an
 * in-flight settle push the user version further ahead, so the indicator stays lit through a burst
 * rather than flickering once per settle.
 *
 * @packageDocumentation
 */

import type { Readable } from 'svelte/store';

import { createEngineBusyTracker } from '@filter-enginez/reactive-signals';
import { busyStore } from '@filter-enginez/svelte-signals';

/** The real-estate route's single busy tracker instance. */
const tracker = createEngineBusyTracker();

/** A Svelte `Readable<boolean>` — `true` while a user action is pending an as-yet-unresolved settle. */
export const isEngineBusy: Readable<boolean> = busyStore(tracker);

/** Snapshot the current user-action version. The bundle fetcher captures this at fetch start. */
export function captureCurrentVersion(): number {
	return tracker.captureCurrentVersion();
}

/** Advance the resolved version to at least `version` — call on every settle outcome. */
export function markResolvedAtLeast(version: number): void {
	tracker.markResolvedAtLeast(version);
}

/** Increment the user-action version — call in a commit handler BEFORE the engine write. */
export function markUserAction(): void {
	tracker.markUserAction();
}
