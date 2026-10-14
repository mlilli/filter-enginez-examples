/**
 * `wineBusy` — the Svelte wine route's binding to the SHARED wine busy tracker.
 *
 * @remarks
 * **This file must not create its own tracker.** The commit helpers live in
 * `@filter-enginez/examples-shared/wine-domain`, and they bump `markUserAction` on the tracker owned
 * by `examples-shared/src/wine/engineBusyCore.ts`. A second tracker here would be advanced by nothing,
 * so the store below would read `false` forever — and nothing would error. The symptom is a wine panel
 * that never shows it is computing, on the one route where a 150k worker round trip makes that visibly
 * wrong.
 *
 * So this module binds `busyStore` to `wineBusyCore.tracker` and re-exports the neutral forwarders
 * from the same instance. It stays a module rather than an import-from-shared at each call site
 * because the Svelte `Readable` is genuinely this app's concern — `busyStore` comes from
 * `@filter-enginez/svelte-signals`, which no other vertical uses.
 *
 * **Why the indicator matters more here than on books.** The books engine is synchronous and
 * main-thread: a commit and its settle land in the same frame, so its indicator never visibly lights.
 * Wine runs 150k records behind a Comlink worker, where the gap between "user clicked" and "results
 * reflect the click" is real. The predicate is `userActionVersion > resolvedVersion`, which is
 * monotonic — clicks landing DURING a round trip push the user version further ahead, so the indicator
 * stays lit through a burst rather than flickering once per settle.
 *
 * @packageDocumentation
 */

import type { Readable } from 'svelte/store';

import { wineBusyCore } from '@filter-enginez/examples-shared/wine-domain';
import { busyStore } from '@filter-enginez/svelte-signals';

/** A Svelte `Readable<boolean>` — `true` while a user action is pending an as-yet-unresolved settle. */
export const isEngineBusy: Readable<boolean> = busyStore(wineBusyCore.tracker);

export const { captureCurrentVersion, markResolvedAtLeast, markUserAction } = wineBusyCore;
