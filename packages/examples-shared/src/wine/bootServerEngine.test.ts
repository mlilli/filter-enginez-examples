/**
 * Test for the server-backed wine boot.
 *
 * @remarks
 * The wine twin of `bootServerEngine.test.ts` (books). The point is the same: the SURFACE is identical
 * to the worker-tier boot, so the server-backed route mounts the exact same `<WineView>`. Anything
 * missing from this engine shows up as a component crash inside shared code, not a boot failure.
 *
 * `asyncEngine` being present is the load-bearing assertion — every predictive-disable read in the
 * shared wine bundle branches on it. And unlike books, wine defaults its own `dataset`, so a dedicated
 * assertion pins that the corpus fetch targets `/corpus/wine.json`: a boot that dropped the default
 * would silently request the books corpus and filter wine rules against book records.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bootWineServerEngine } from './bootServerEngine.js';

const CORPUS = [
	{ abv: 13.5, body: 'Full', color: 'Red', id: 'w1', name: 'One', points: 92, priceUsd: 40, sweetness: 'Dry', varietal: 'Merlot', vintage: 2018 },
	{ abv: 12.0, body: 'Light', color: 'White', id: 'w2', name: 'Two', points: 88, priceUsd: 22, sweetness: 'Off-dry', varietal: 'Riesling', vintage: 2020 },
];

beforeEach(() => {
	vi.stubGlobal('fetch', vi.fn(async (url: string) => {
		const payload = String(url).includes('/corpus/')
			? { dataset: 'wine', records: CORPUS }
			: { chipGroups: [], fields: [], matched: CORPUS.length, resultIndices: [0, 1]};

		return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
	}));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('bootWineServerEngine', () => {
	it('resolves a signals engine over the server corpus', async () => {
		const engine = await bootWineServerEngine({ baseUrl: '/wine-server' });

		expect(engine.sourceData.value).toHaveLength(CORPUS.length);
	});

	it('exposes an asyncEngine, so reads round-trip instead of running locally', async () => {
		const engine = await bootWineServerEngine({ baseUrl: '/wine-server' });

		expect(engine.asyncEngine).toBeDefined();
	});

	it('defaults the dataset to wine (fetches /corpus/wine.json)', async () => {
		// The one thing that differs from the books boot: `bootWineServerEngine` pre-sets `dataset: 'wine'`
		// so a caller only supplies `baseUrl`. A regression that dropped the default would fetch the wrong
		// corpus and only fail deep inside the panel.
		await bootWineServerEngine({ baseUrl: '/wine-server' });

		const calls = vi.mocked(globalThis.fetch).mock.calls.map(([url]) => url as string);

		expect(calls).toContain('/wine-server/corpus/wine.json');
		expect(calls.every((url) => url.startsWith('/wine-server'))).toBe(true);
	});

	it('lets an explicit dataset override the default', async () => {
		// Spreading `...options` after the default means a caller CAN still override it — proven so the
		// override order never silently flips.
		await bootWineServerEngine({ baseUrl: '/wine-server', dataset: 'books' });

		const calls = vi.mocked(globalThis.fetch).mock.calls.map(([url]) => url as string);

		expect(calls).toContain('/wine-server/corpus/books.json');
	});
});
