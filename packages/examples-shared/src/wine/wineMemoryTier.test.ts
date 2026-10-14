/**
 * Tests for the low-memory tier decision.
 *
 * @remarks
 * The decision is one comparison, and the cases worth pinning are its edges: the inclusive threshold
 * (`deviceMemory` rounds down, so `1` means "at least 1 GB, under 2"), and every way a browser can
 * leave the value out — which must boot the full tier, because guessing is not knowing.
 */

import { describe, expect, it } from 'vitest';

import { LOW_MEMORY_DEVICE_GIGABYTES, resolveWineWorkerTier } from './wineMemoryTier.js';

describe('resolveWineWorkerTier', () => {
	it.each([0.25, 0.5, 1])('boots the low-memory tier on a device reporting %s GB', (deviceMemory) => {
		expect(resolveWineWorkerTier({ deviceMemory })).toBe('low-memory');
	});

	it.each([2, 4, 8])('boots the full tier on a device reporting %s GB', (deviceMemory) => {
		expect(resolveWineWorkerTier({ deviceMemory })).toBe('full');
	});

	it('draws the line at the documented threshold, inclusively', () => {
		expect(resolveWineWorkerTier({ deviceMemory: LOW_MEMORY_DEVICE_GIGABYTES })).toBe('low-memory');
		expect(resolveWineWorkerTier({ deviceMemory: LOW_MEMORY_DEVICE_GIGABYTES * 2 })).toBe('full');
	});

	it.each([
		['a navigator without deviceMemory (Safari, Firefox)', {}],
		['no navigator at all', undefined],
		['a nonsensical zero', { deviceMemory: 0 }],
	])('boots the full tier for %s', (_label, navigatorLike) => {
		expect(resolveWineWorkerTier(navigatorLike)).toBe('full');
	});

	it('reads the global navigator by default', () => {
		// jsdom's navigator has no `deviceMemory`, which is the unreported case.
		expect(resolveWineWorkerTier()).toBe('full');
	});
});
