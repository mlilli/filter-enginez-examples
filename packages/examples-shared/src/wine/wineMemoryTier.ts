/**
 * `wineMemoryTier` — whether this device can hold the 150,000-wine tier, decided once on the main
 * thread before the worker is spawned.
 *
 * @remarks
 * ## What the full tier costs
 *
 * Measured in Node 22 (V8, the engine Chromium runs): the 150,000 synthetic wines occupy about
 * **155 MB** of heap. The worker holds them for the engine, and the main thread holds a second copy,
 * because the signals adapter fetches the source data once at boot to derive the slider baselines,
 * the varietal list and the origin tree. Each copy lives in its own JavaScript heap.
 *
 * ## Why the line is at 1 GB
 *
 * V8 sizes a heap's ceiling from the device's physical memory, at roughly a quarter of it. On a
 * device with 1 GB that ceiling is about 256 MB per heap, and the main thread's copy plus the page
 * itself comes close enough to it that the tab can be killed for running out of memory. At 2 GB the
 * ceiling is about 512 MB, which leaves the main thread more than half its heap free. So a device
 * reporting 1 GB or less boots the 10,000-wine default tier, in the same worker, and its footer says
 * why.
 *
 * ## What it can and cannot see
 *
 * `navigator.deviceMemory` is reported by Chromium-based browsers only, rounded down to a power of two
 * (0.25, 0.5, 1, 2, 4 or 8). Safari and Firefox report nothing, and an unreported value boots the full
 * tier: guessing a device's memory from anything else would be a guess, and the full tier is what
 * the page is for. Every wine route on one device reads the same value, so all six apps boot the same
 * tier and show the same counts there.
 *
 * @packageDocumentation
 */

import { type WineWorkerTier } from './wineCorpusTier.js';

/**
 * Devices reporting this many gigabytes of memory or fewer boot the 10,000-wine tier.
 *
 * @remarks
 * See the module docblock for the arithmetic. Inclusive, because `deviceMemory` rounds DOWN: a device
 * reporting `1` has at least 1 GB and less than 2 GB.
 */
export const LOW_MEMORY_DEVICE_GIGABYTES = 1;

/**
 * The slice of `Navigator` this module reads.
 *
 * @remarks
 * Declared here rather than taken from the DOM typings, which do not include `deviceMemory` (it is a
 * Chromium extension). Every field is optional because every browser but Chromium leaves it out.
 */
export interface DeviceMemoryNavigator {
	/** Approximate device memory in gigabytes, rounded down to a power of two. */
	readonly deviceMemory?: number;
}

/**
 * Decide which tier the wine worker should build on this device.
 *
 * @param navigatorLike - The navigator to read. Defaults to the global one; tests pass a stand-in.
 *   `undefined` (no navigator at all) counts as unreported.
 * @returns `'low-memory'` when the device reports {@link LOW_MEMORY_DEVICE_GIGABYTES} or less,
 *   otherwise `'full'`.
 */
export function resolveWineWorkerTier(
	navigatorLike: DeviceMemoryNavigator | undefined = globalThis.navigator as DeviceMemoryNavigator | undefined,
): WineWorkerTier {
	const deviceMemory = navigatorLike?.deviceMemory;

	return typeof deviceMemory === 'number' && deviceMemory > 0 && deviceMemory <= LOW_MEMORY_DEVICE_GIGABYTES
		? 'low-memory'
		: 'full';
}
