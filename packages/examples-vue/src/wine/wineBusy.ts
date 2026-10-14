/**
 * `wineBusy` — this app's binding to the SHARED wine busy tracker.
 *
 * @remarks
 * **Do not create a tracker here.** `booksBusy.ts` and `realEstateBusy.ts` each call
 * `createEngineBusyTracker()` and own their instance, which is right for them: their commit helpers
 * are app-local and bump the tracker they made. Wine's commit helpers are NOT app-local — they live in
 * `@filter-enginez/examples-shared/wine-domain` and bump `wineBusyCore.tracker`. A second tracker here
 * would be advanced by nothing, so `useBusy` would read `false` forever and **nothing would error**.
 * The symptom is a wine panel that never shows it is computing, on the one route where a 150k worker
 * round trip makes that visibly wrong. SvelteKit's equivalent carries the same warning.
 *
 * The tracker is exported rather than a ready-made boolean because `useBusy` registers a scope
 * teardown and must therefore be called inside `setup()` — the same reason `realEstateBusy.ts` exports
 * its tracker instead of a store.
 *
 * @packageDocumentation
 */

import { wineBusyCore } from '@filter-enginez/examples-shared/wine-domain';

/**
 * The wine route's busy tracker — the SAME instance the shared commit helpers bump.
 *
 * @remarks
 * Pass to `useBusy(wineBusyTracker)` inside a component's `setup()`.
 */
export const wineBusyTracker = wineBusyCore.tracker;

export const { captureCurrentVersion, markResolvedAtLeast, markUserAction } = wineBusyCore;
