/**
 * The real-estate route's engine-busy tracker — one instance, shared by the panel and the header.
 *
 * @remarks
 * Exactly `books-busy.ts`'s shape, and deliberately a SEPARATE instance: the version counter is
 * monotonic per engine, so sharing one across two datasets would let a commit on `/books` leave
 * `/real-estate`'s indicator lit until something over here happened to settle it.
 *
 * A module singleton rather than a `useFactory`, for the reason books documents: the panel writes to
 * it and the header reads from it, and a re-navigation that reuses the cached engine must reuse the
 * tracker too rather than quietly resetting the counter under a live engine.
 *
 * Built on `createEngineBusyStream` (RxJS) rather than `createEngineBusyTracker` (signals), so busy
 * state arrives as an `Observable<boolean>` like every other read in this vertical.
 *
 * **How visible this indicator is depends on the tier.** Real estate boots on the main thread, so a
 * commit bumps the user-action version and the next settle clears it, usually within a frame. That is
 * honest rather than useless — it is the same contract the worker-backed wine route uses, so the
 * wiring is identical whichever tier hosts the engine.
 *
 * @packageDocumentation
 */

import { createEngineBusyStream, type EngineBusyStream } from '@filter-enginez/reactive-rxjs';

/** The shared tracker. Provided into DI via `provideEngineBusy(realEstateBusyStream)`. */
export const realEstateBusyStream: EngineBusyStream = createEngineBusyStream();
