/**
 * `startBitmapAcceleration` — start loading bitmap acceleration, and let the boot go on without it.
 *
 * @remarks
 * `initializeBitmapAcceleration()` fetches and compiles `roaring-wasm` (about 89 KB gzipped). A boot
 * that awaits it before loading its corpus pays for the two one after the other, and the first
 * render waits on both. The engine does not need it to answer: every query asks
 * `isBitmapAccelerationReady()` as it runs, takes the predicate path until the WebAssembly is ready,
 * and the bitmap path from the next query on, with the same results either way. So every browser
 * boot calls this at its start, loads its corpus meanwhile, and builds its engine without waiting.
 *
 * A failure (the library missing, its chunk unreachable) is logged once as a warning and never
 * rejects: the engine keeps answering on the predicate path, which is what it would do without the
 * library at all.
 *
 * @packageDocumentation
 */

import { initializeBitmapAcceleration } from '@filter-enginez/core';

/**
 * Start `initializeBitmapAcceleration()` without waiting for it.
 *
 * @returns A promise that settles once the attempt has; it never rejects. Boots do not await it — it
 *   is there for a caller that must know acceleration is on before it measures (a benchmark, a test).
 */
export async function startBitmapAcceleration(): Promise<void> {
	try {
		await initializeBitmapAcceleration();
	} catch (error: unknown) {
		console.warn('[boot] bitmap acceleration is unavailable; filtering stays on the predicate path:', error);
	}
}
