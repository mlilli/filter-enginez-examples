/**
 * `booksBusy` — the Vue books route's engine-busy module (one tracker for the whole route).
 *
 * @remarks
 * The React books route binds `createEngineBusyModule` (`examples-shared/scheduling`), but that factory
 * pulls in `useEngineBusy` from `react-signals`, so it would drag React into the Vue app. Instead we
 * bind the framework-neutral `createEngineBusyTracker` directly and expose the tracker instance so a
 * component can turn it into a read-only Vue ref via `useBusy(booksBusyTracker)` (called in `setup()`).
 * The WRITE side (`markUserAction` / `markResolvedAtLeast` / `captureCurrentVersion`) is a set of plain
 * calls, identical to the React commit + settle handlers.
 *
 * Predicate (from the tracker): `isBusy = userActionVersion > resolvedVersion`. Because the books engine
 * is synchronous main-thread, a commit bumps the user-action version and the very next `lastChange`
 * settle advances the resolved version, so the indicator sits idle — exactly as the React books route
 * behaves (it has no worker round-trip to keep the indicator lit).
 *
 * @packageDocumentation
 */

import { createEngineBusyTracker } from '@filter-enginez/reactive-signals';

/**
 * The books route's single busy tracker instance. Components read its busy state with
 * `useBusy(booksBusyTracker)` from `@filter-enginez/vue-signals`.
 */
export const booksBusyTracker = createEngineBusyTracker();

/** Increment the user-action version — call in a commit handler before the engine write. */
export function markUserAction(): void {
	booksBusyTracker.markUserAction();
}

/** Snapshot the current user-action version (a settle handler captures this to resolve against). */
export function captureCurrentVersion(): number {
	return booksBusyTracker.captureCurrentVersion();
}

/** Advance the resolved version to at least `version` — call on settle to clear the busy state. */
export function markResolvedAtLeast(version: number): void {
	booksBusyTracker.markResolvedAtLeast(version);
}
