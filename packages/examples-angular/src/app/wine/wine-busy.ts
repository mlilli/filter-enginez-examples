/**
 * `wine-busy` — an `EngineBusyStream` over the SHARED wine busy core.
 *
 * @remarks
 * **Do not call `createEngineBusyStream()` here**, the way `real-estate-busy.ts` and `books-busy.ts`
 * do. Those are right for their routes: their commit handlers are app-local and call
 * `markUserAction()` on the stream they made.
 *
 * Wine's commit handlers are NOT app-local. `commitRule`, `commitSelection`, `commitExpression`,
 * `clearAllWineFilters` and the rest live in `@filter-enginez/examples-shared/wine-domain` and bump
 * `wineBusyCore` — a **signals** tracker shared with React, SvelteKit and Vue. A stream created here
 * would be a second, never-advanced tracker: `isBusy$` would emit `false` forever and **nothing would
 * error**. The symptom is a wine panel that never admits it is computing, on the one route where a
 * 130k Comlink round trip makes that visibly wrong. `engineBusyCore.ts` and Vue's `wineBusy.ts` both
 * carry the same warning.
 *
 * So this ADAPTS the shared core instead of creating anything.
 *
 * ## Why the adapter is here and not in `examples-shared`
 *
 * It looks like shared plumbing — `examples-shared` already owns the neutral core and the React
 * binding (`withReactBusyHook`), so an RxJS sibling beside them is the obvious shape.
 *
 * `examples-shared` depends on neither `rxjs` nor `@filter-enginez/reactive-rxjs`. Putting the adapter
 * there costs two new dependency edges and a `pnpm install`, to serve **one** consumer — this file.
 * The rule of three exists precisely so a shared module is paid for by more than one caller; the other
 * non-React verticals read the core directly in their own idiom and never need an `Observable`. If a
 * second RxJS consumer of a signals core ever appears, that is the copy that triggers the promotion.
 *
 * `reactive-rxjs` was also considered and rejected on its own terms: `createEngineBusyStream`'s
 * docblock argues the two reactive surfaces are **siblings, not layers**, and that importing the
 * signals tracker into an RxJS consumer would pull `@preact/signals-core` in purely to read a boolean.
 * An adapter living there would undo the decision its own comments defend.
 *
 * The stream itself is a **module singleton**, matching the other two routes: a re-navigation that
 * reuses the cached engine must reuse the tracker rather than reset the counter under a live engine.
 *
 * @packageDocumentation
 */

import type { EngineBusyStream } from '@filter-enginez/reactive-rxjs';

import { wineBusyCore } from '@filter-enginez/examples-shared/wine-domain';
import { BehaviorSubject, distinctUntilChanged, type Observable, shareReplay } from 'rxjs';

/**
 * Bridge the shared signals core onto an `EngineBusyStream`.
 *
 * @remarks
 * The four version methods delegate straight through — they are closures on the core, so the counters
 * stay single-sourced and a `markUserAction()` from a shared commit helper is seen here.
 *
 * `isBusy$` mirrors `createEngineBusyStream`'s own pipeline exactly: `distinctUntilChanged` so an
 * unchanged predicate does not re-render, and `shareReplay({ bufferSize: 1, refCount: false })` so
 * Angular's `| async` and `toSignal(..., { requireSync: true })` both see the real state immediately.
 *
 * **`refCount: false` is deliberate.** With `true`, the replay is torn down when the last subscription
 * ends, and the next subscriber sees nothing until something moves — which on a route mounting three separate
 * consumers (`fe-results-header`, `fe-time-travel-controls`, `fe-devtools-panel`) is a race, not a
 * theory.
 *
 * The core subscription is never torn down, which is correct here: the core is a module singleton
 * living as long as the route's engine, exactly like the stream `createEngineBusyStream` returns.
 *
 * @returns An `EngineBusyStream` over `wineBusyCore`.
 */
function createWineBusyStream(): EngineBusyStream {
	const subject = new BehaviorSubject<boolean>(wineBusyCore.getIsEngineBusy());
	const isBusy$: Observable<boolean> = subject.pipe(
		distinctUntilChanged(),
		shareReplay({ bufferSize: 1, refCount: false }),
	);
	let isDisposed = false;

	wineBusyCore.subscribeEngineBusy(() => {
		if (!isDisposed) {
			subject.next(wineBusyCore.getIsEngineBusy());
		}
	});

	return {
		captureCurrentVersion: wineBusyCore.captureCurrentVersion,
		dispose: (): void => {
			if (isDisposed) {
				return;
			}
			isDisposed = true;
			subject.complete();
		},
		getIsBusy: wineBusyCore.getIsEngineBusy,
		isBusy$,
		markResolvedAtLeast: wineBusyCore.markResolvedAtLeast,
		markUserAction: wineBusyCore.markUserAction,
	};
}

/**
 * The wine route's busy stream — a view onto the SAME counters the shared commit helpers advance.
 *
 * @remarks
 * Provided into DI via `provideEngineBusy(wineBusyStream)`, which is what lets `fe-results-header`,
 * `fe-time-travel-controls` and `fe-devtools-panel` keep injecting it unconditionally.
 */
export const wineBusyStream: EngineBusyStream = createWineBusyStream();
