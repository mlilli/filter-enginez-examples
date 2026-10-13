/**
 * Tests for the engine → URL write-back, and specifically for the tier branch.
 *
 * @remarks
 * **The tier branch fails SILENTLY if it is missing, which is why it has its own suite.** Exporting
 * the config off `.core` is correct on the main thread and wrong on the worker tier, where
 * `createAsyncCoreShim` deliberately has NO sync `exportConfig` — it throws `unsupported`, on the
 * argument that a fabricated answer is worse than a refusal.
 *
 * That failure would have no visible symptom. The throw would happen inside a debounced
 * `setTimeout`, so it would surface as an uncaught console error and nothing else: no `?f` written,
 * the copy-link and compare buttons inert (their enabled state is published from here), and the
 * route otherwise working perfectly. The Vue, Svelte and Angular copies of this module carry the
 * same branch.
 *
 * The engines here are stubs rather than real ones. What is under test is which method gets called
 * and what lands in the address bar, and a real worker would add minutes to answer neither.
 */

import type { FilterEngine, FilterEngineConfig } from '@filter-enginez/core';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startEngineUrlSync } from './urlState.js';

/** A config narrow enough to eyeball in a URL, and valid enough for the serializer. */
const CONFIG: FilterEngineConfig = {
	rules: [{ id: 'color', rule: { config: { set: ['red']}, field: 'color', type: 'InSetRule' }}],
	version: 1,
};

/** A stub engine core: a subscription the test can fire, plus a recorded `exportConfig`. */
function stubCore(exportConfig: () => FilterEngineConfig): {
	readonly core: FilterEngine<unknown>;
	readonly settle: () => void;
} {
	const listeners: (() => void)[] = [];

	return {
		core: {
			exportConfig,
			subscribe: (listener: () => void) => {
				listeners.push(listener);

				return () => undefined;
			},
		} as unknown as FilterEngine<unknown>,
		settle: () => {
			for (const listener of listeners) {
				listener();
			}
		},
	};
}

/** The `?f` currently in the address bar, or `null`. */
function urlState(): string | null {
	return new URL(window.location.href).searchParams.get('f');
}

describe('startEngineUrlSync', () => {
	beforeEach(() => {
		window.history.replaceState(null, '', '/wine');
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('exports off .core on the main-thread tier', async () => {
		const { core, settle } = stubCore(() => CONFIG);
		const stop = startEngineUrlSync({ core });

		settle();
		await vi.advanceTimersByTimeAsync(200);

		expect(urlState()).not.toBeNull();
		stop();
	});

	it('exports off asyncEngine on the worker tier, never touching the sync shim', async () => {
		// The case this file is named for. `core.exportConfig` throws exactly as the real shim
		// does, so a version that reached for it fails here rather than in a console nobody is reading.
		const { core, settle } = stubCore(() => {
			throw new Error('exportConfig is not supported on an async engine core shim');
		});
		const exportConfig = vi.fn(async () => Promise.resolve(CONFIG));
		const stop = startEngineUrlSync({ asyncEngine: { exportConfig }, core });

		settle();
		await vi.advanceTimersByTimeAsync(200);

		expect(exportConfig).toHaveBeenCalledTimes(1);
		expect(urlState()).not.toBeNull();
		stop();
	});

	it('coalesces a burst of settles into one write', async () => {
		// The debounce is what keeps filter-flicking from writing history entries per keystroke. On the
		// worker tier it is also what keeps a burst from firing thirteen round trips.
		const exportConfig = vi.fn(async () => Promise.resolve(CONFIG));
		const { core, settle } = stubCore(() => CONFIG);
		const stop = startEngineUrlSync({ asyncEngine: { exportConfig }, core });

		settle();
		settle();
		settle();
		await vi.advanceTimersByTimeAsync(200);

		expect(exportConfig).toHaveBeenCalledTimes(1);
		stop();
	});

	it('drops a pending write on teardown', async () => {
		// A route torn down mid-debounce must not write the URL of a page the user has left.
		const exportConfig = vi.fn(async () => Promise.resolve(CONFIG));
		const { core, settle } = stubCore(() => CONFIG);
		const stop = startEngineUrlSync({ asyncEngine: { exportConfig }, core });

		settle();
		stop();
		await vi.advanceTimersByTimeAsync(200);

		expect(exportConfig).not.toHaveBeenCalled();
		expect(urlState()).toBeNull();
	});
});
