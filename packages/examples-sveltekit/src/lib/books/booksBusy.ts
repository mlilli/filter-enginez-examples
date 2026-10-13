/**
 * `booksBusy` — the Svelte books route's engine-busy module (one tracker for the whole route).
 *
 * @remarks
 * The React books route binds `createEngineBusyModule` (`examples-shared/scheduling`), but that factory
 * pulls in `useEngineBusy` from `react-signals`, so it would drag React into the Svelte app. Instead we
 * bind the framework-neutral `createEngineBusyTracker` directly and expose its busy state as a Svelte
 * `Readable<boolean>` via `busyStore`. The WRITE side (`markUserAction` / `markResolvedAtLeast` /
 * `captureCurrentVersion`) is a set of plain calls, identical to the React commit + settle handlers.
 *
 * Predicate (from the tracker): `isBusy = userActionVersion > resolvedVersion`. Because the books engine
 * is synchronous main-thread, a commit bumps the user-action version and the very next `lastChange`
 * settle advances the resolved version, so the indicator sits idle — exactly as the React books route
 * behaves (it has no worker round-trip to keep the indicator lit).
 *
 * @packageDocumentation
 */

import type { Readable } from 'svelte/store';

import { createEngineBusyTracker } from '@filter-enginez/reactive-signals';
import { busyStore } from '@filter-enginez/svelte-signals';

/** The books route's single busy tracker instance. */
const tracker = createEngineBusyTracker();

/** A Svelte `Readable<boolean>` — `true` while a user action is pending an as-yet-unresolved settle. */
export const isEngineBusy: Readable<boolean> = busyStore(tracker);

/** Increment the user-action version — call in a commit handler before the engine write. */
export function markUserAction(): void {
	tracker.markUserAction();
}

/** Snapshot the current user-action version (a settle handler captures this to resolve against). */
export function captureCurrentVersion(): number {
	return tracker.captureCurrentVersion();
}

/** Advance the resolved version to at least `version` — call on settle to clear the busy state. */
export function markResolvedAtLeast(version: number): void {
	tracker.markResolvedAtLeast(version);
}
