/**
 * `busy/engineBusy` — the engine-busy plumbing this app's three datasets share: one tracker per
 * dataset, the binding that paints it, and the deferred resolve every settle goes through.
 *
 * @remarks
 * ## What "busy" means here, and why it is not the count animation
 *
 * Every vertical draws the same contract: a write marks the dataset's tracker FIRST, in the click's
 * own frame; the header's computing indicator lights and the panel body takes
 * `--busy` + `aria-busy="true"`; both clear when the engine has settled on that write. The predicate
 * is the tracker's `userActionVersion > resolvedVersion`, which is monotonic, so a burst of clicks
 * during one round trip keeps the state lit instead of flickering once per settle.
 *
 * The count roll is a separate input. The header shows the indicator while EITHER is true, so a
 * main-thread write that settles at once still shows its roll, and a worker write whose count has not
 * moved yet still shows that it is waiting.
 *
 * ## Which tracker each dataset uses
 *
 * - Wine uses `wineBusyCore` from `@filter-enginez/examples-shared/wine-domain`, because the shared
 *   wine commit helpers bump THAT instance. A second tracker would never be marked, and the indicator
 *   would never light — with nothing erroring.
 * - Real estate uses the forwarders `@filter-enginez/examples-shared/real-estate-core` exports for the
 *   shared `realEstateBusyCore`.
 * - Books has no shared instance, so {@link booksBusyCore} is this app's one. It is built by
 *   {@link createBusyCore}, the same shape `examples-shared`'s `createEngineBusyCore` returns; that
 *   factory lives behind the React-bound `scheduling` barrel, which this app must not import.
 *
 * ## The resolve waits for a paint
 *
 * On a main-thread engine the write, its change event and its settle all land inside the click
 * handler, so resolving there would clear the state before the browser ever drew it.
 * {@link resolveAfterPaint} defers the resolve past the next frame, which is what "usually a frame"
 * means on those tiers. On the worker tier the settle is already hundreds of milliseconds away, and
 * the extra frame changes nothing a person can see.
 *
 * @packageDocumentation
 */

import { createEngineBusyTracker } from '@filter-enginez/reactive-signals';

/** The engine-busy surface a dataset route drives: mark, capture, resolve, read and subscribe. */
export interface BusyCore {
	/** Snapshot the current user-action version (a settle hook captures it at fetch start). */
	readonly captureCurrentVersion: () => number;
	/** `true` while a user action has not yet been reflected in a settle. */
	readonly getIsEngineBusy: () => boolean;
	/** Advance the resolved version to at least `version`. */
	readonly markResolvedAtLeast: (version: number) => void;
	/** Bump the user-action version. Call BEFORE the engine write. */
	readonly markUserAction: () => void;
	/** Listen for busy-state changes; returns the unsubscribe. */
	readonly subscribeEngineBusy: (listener: () => void) => () => void;
}

/**
 * Create one dataset's busy core over a fresh tracker.
 *
 * @remarks
 * Call once per dataset, at module scope: two cores for one dataset means the writes bump one and
 * the header reads the other.
 *
 * @returns The core.
 */
export function createBusyCore(): BusyCore {
	const tracker = createEngineBusyTracker();

	return {
		captureCurrentVersion: () => tracker.captureCurrentVersion(),
		getIsEngineBusy: () => tracker.getIsBusy(),
		markResolvedAtLeast: (version) => {
			tracker.markResolvedAtLeast(version);
		},
		markUserAction: () => {
			tracker.markUserAction();
		},
		subscribeEngineBusy: (listener) => tracker.subscribe(listener),
	};
}

/** The books routes' one busy core — shared by `/books` and `/books-raw`, which never coexist. */
export const booksBusyCore: BusyCore = createBusyCore();

/**
 * Run `callback` once the browser has painted the current frame.
 *
 * @remarks
 * Two nested animation frames: the first callback runs BEFORE the next paint, the second after it.
 * A host without `requestAnimationFrame` falls back to a macrotask, which is the closest available
 * "after the current work" point.
 *
 * @param callback - What to run.
 */
export function afterNextPaint(callback: () => void): void {
	if (typeof requestAnimationFrame !== 'function') {
		setTimeout(callback, 0);

		return;
	}
	requestAnimationFrame(() => {
		requestAnimationFrame(callback);
	});
}

/**
 * Resolve the tracker to `version` once the busy state has had a frame on screen.
 *
 * @param busy - The dataset's busy core.
 * @param version - The version the settle covers. Defaults to the current one, which is right for a
 * main-thread change event: every write that produced it was marked before it.
 */
export function resolveAfterPaint(busy: BusyCore, version: number = busy.captureCurrentVersion()): void {
	afterNextPaint(() => {
		busy.markResolvedAtLeast(version);
	});
}

/**
 * Call `apply` with the busy state now, and again on every change.
 *
 * @param busy - The dataset's busy core.
 * @param apply - What to repaint.
 * @returns The unsubscribe.
 */
export function bindBusyState(busy: BusyCore, apply: (isBusy: boolean) => void): () => void {
	apply(busy.getIsEngineBusy());

	return busy.subscribeEngineBusy(() => {
		apply(busy.getIsEngineBusy());
	});
}
