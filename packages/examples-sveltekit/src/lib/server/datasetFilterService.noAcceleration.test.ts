/**
 * `datasetFilterService` on a runtime that cannot load the roaring-bitmap WASM module.
 *
 * @remarks
 * The deployed SvelteKit server is a Cloudflare Worker, and Workers refuse to compile WebAssembly from
 * bytes at runtime, so `initializeBitmapAcceleration()` rejects there. That must cost the bitmap fast
 * path and nothing else: the queries still answer, on the engine's predicate path. A separate file
 * because the service memoizes its init attempt at module scope, and Vitest isolates modules per file.
 *
 * @packageDocumentation
 */

import type * as Core from '@filter-enginez/core';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RunQueryInput } from './datasetFilterService.js';

vi.mock('@filter-enginez/core', async (importOriginal) => ({
	...(await importOriginal<typeof Core>()),
	initializeBitmapAcceleration: vi.fn<() => Promise<void>>()
		.mockRejectedValue(new Error('WebAssembly.instantiate(): Wasm code generation disallowed by embedder')),
}));

const { runDatasetQuery } = await import('./datasetFilterService.js');

describe('runDatasetQuery without bitmap acceleration', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('still filters, and reports the missing acceleration once rather than per request', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const neutral: RunQueryInput = { config: { rules: [], version: 1 }, dataset: 'books', limit: 0, query: {}};

		const first = await runDatasetQuery(neutral);
		const second = await runDatasetQuery(neutral);

		expect(first.total).toBeGreaterThan(0);
		expect(first.matched).toBe(first.total);
		expect(second.matched).toBe(first.matched);
		expect(warn).toHaveBeenCalledTimes(1);
	});
});
