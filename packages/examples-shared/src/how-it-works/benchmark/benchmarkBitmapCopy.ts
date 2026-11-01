/**
 * Whether the live benchmark can measure on the bitmap path, and what the widget says when it cannot.
 *
 * @remarks
 * A configuration with bitmaps on is measured live only when Roaring bitmaps really serve it: the
 * engine reaches the bitmap path only after `initializeBitmapAcceleration()` has resolved, and runs
 * every filter through its per-record predicates until then, with the same results. Timing that
 * fallback and labeling it "bitmap" would show the slow path under the fast path's name. So the
 * workload reports which path each measurement ran on (`benchmarkWorkload.ts`), and when bitmaps are
 * unavailable the widget shows the committed reference number for a bitmap configuration, measured
 * with bitmaps engaged, and says why it is not live. The reasons and their wording live here, free of
 * the engine, so the widget reads them at startup without loading it.
 *
 * @packageDocumentation
 */

import { REFERENCE_LABEL } from './referenceResults.js';

/**
 * Why the bitmap path is unavailable to the live benchmark.
 *
 * - `'peer-missing'` — `initializeBitmapAcceleration()` rejected with `MODE_ACCELERATION_PEER_MISSING`:
 *   the optional peer `roaring-wasm` is not part of the build.
 * - `'init-failed'` — it rejected any other way (`ACCELERATION_INIT_FAILED`): the library's chunk or
 *   its WebAssembly module did not load in this browser.
 * - `'not-engaged'` — init resolved, but a bitmap configuration still ran on the predicate path.
 */
export type BitmapUnavailableReason = 'init-failed' | 'not-engaged' | 'peer-missing';

/** Whether the live benchmark can measure on the bitmap path, and why not when it cannot. */
export type BitmapAvailability =
	| { readonly reason: BitmapUnavailableReason; readonly status: 'unavailable' }
	| { readonly status: 'ready' };

/** What each {@link BitmapUnavailableReason} means, in the words the widget's status line uses. */
export const BITMAP_UNAVAILABLE_COPY: Readonly<Record<BitmapUnavailableReason, string>> = {
	'init-failed': 'bitmaps unavailable: the bitmap library failed to load in this browser',
	'not-engaged': 'bitmaps unavailable: the engine did not engage its bitmap path',
	'peer-missing': 'bitmaps unavailable: the bitmap library is not installed',
};

/** The line under the number when it is a bitmap configuration's reference number rather than a live one. */
export const BITMAP_REFERENCE_SUBLINE = 'reference number, measured with bitmaps';

/**
 * The status line for a bitmap configuration that cannot be measured live.
 *
 * @param reason - Why the bitmap path is unavailable.
 * @returns The reason, then where the number on screen comes from instead.
 */
export function bitmapUnavailableStatus(reason: BitmapUnavailableReason): string {
	return `${BITMAP_UNAVAILABLE_COPY[reason]} · showing ${REFERENCE_LABEL}`;
}
