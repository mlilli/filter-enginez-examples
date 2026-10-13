/**
 * The books route's engine-busy tracker — one instance, shared by the panel and the header.
 *
 * @remarks
 * The Angular counterpart of the Vue app's `booksBusy.ts`, with one substantive difference: it builds
 * on `createEngineBusyStream` (RxJS) rather than `createEngineBusyTracker` (signals), so the busy state
 * arrives as an `Observable<boolean>` like every other read in this vertical.
 *
 * Why a module singleton rather than a plain `useFactory` on the provider: filter commits happen all
 * over the panel and the "computing" indicator lives in the header, so both must observe the SAME
 * monotonic version counter. DI already guarantees that within one component subtree, but keeping the
 * instance module-scoped means a re-navigation to `/books` (which reuses the cached engine — see
 * `app.routes.ts`) also reuses its tracker, instead of quietly resetting the counter under a live
 * engine.
 *
 * @packageDocumentation
 */

import { createEngineBusyStream, type EngineBusyStream } from '@filter-enginez/reactive-rxjs';

/** The shared tracker. Provided into DI via `provideEngineBusy(booksBusyStream)`. */
export const booksBusyStream: EngineBusyStream = createEngineBusyStream();
