/**
 * Tests for {@link loadCorpusPaged} — the paginated corpus streamer.
 *
 * @remarks
 * Transport-only, so the suite drives it through an injected `fetchImpl` stub (no MSW, no network):
 * a fake server that slices a synthetic corpus by the `?limit=&offset=` query. Covers multi-page
 * accumulation + ordering, per-page progress, exact stop-at-total (no over-fetch), URL/param
 * shaping, the non-OK throw, the empty-page anti-hang guard, and option defaults/overrides.
 */

import { describe, expect, it, vi } from 'vitest';

import { type CorpusPageProgress, loadCorpusPaged } from './loadCorpusPaged.js';

interface Row {
	readonly id: number;
}

/** A synthetic corpus of `n` rows. */
const corpusOf = (n: number): readonly Row[] => Array.from({ length: n }, (_unused, id) => ({ id }));

/** Build a stand-in shaped like the parts of `Response` the loader touches (`ok`, `status`, `json`). */
function jsonResponse(body: unknown, ok = true, status = 200): unknown {
	return { json: async () => Promise.resolve(body), ok, status };
}

/** Build a fake `fetch` that pages `corpus` by the request's `limit`/`offset` query params. */
function fakePagingFetch(corpus: readonly Row[]): typeof fetch {
	return vi.fn(async (input: RequestInfo | URL) => {
		const url = new URL(input as string, 'http://localhost');
		const limit = Number(url.searchParams.get('limit'));
		const offset = Number(url.searchParams.get('offset'));
		const items = corpus.slice(offset, offset + limit);

		return Promise.resolve(jsonResponse({ items, limit, offset, total: corpus.length }));
	}) as unknown as typeof fetch;
}

describe('loadCorpusPaged', () => {
	it('accumulates every page in order and returns the whole corpus', async () => {
		const all = await loadCorpusPaged<Row>('wine', { fetchImpl: fakePagingFetch(corpusOf(2500)), pageSize: 1000 });

		expect(all).toHaveLength(2500);
		expect(all.map((r) => r.id)).toEqual(corpusOf(2500).map((r) => r.id));
	});

	it('reports progress after each page with a stable total', async () => {
		const progress: CorpusPageProgress[] = [];

		await loadCorpusPaged<Row>('wine', {
			fetchImpl: fakePagingFetch(corpusOf(2500)),
			onProgress: (p) => progress.push(p),
			pageSize: 1000,
		});

		expect(progress).toEqual([
			{ loaded: 1000, total: 2500 },
			{ loaded: 2000, total: 2500 },
			{ loaded: 2500, total: 2500 },
		]);
	});

	it('stops exactly at total — one request per page, no over-fetch', async () => {
		const fetchImpl = fakePagingFetch(corpusOf(2000));

		await loadCorpusPaged<Row>('wine', { fetchImpl, pageSize: 1000 });

		// 2000 / 1000 = 2 pages exactly; the loop must not issue a third (empty) request.
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it('shapes the URL with dataset, tier, limit and offset', async () => {
		const fetchImpl = fakePagingFetch(corpusOf(10));

		await loadCorpusPaged<Row>('books', { fetchImpl, pageSize: 5, tier: 'full' });

		expect(fetchImpl).toHaveBeenNthCalledWith(1, '/api/books?tier=full&limit=5&offset=0', undefined);
		expect(fetchImpl).toHaveBeenNthCalledWith(2, '/api/books?tier=full&limit=5&offset=5', undefined);
	});

	it('honors a custom baseUrl', async () => {
		const fetchImpl = fakePagingFetch(corpusOf(3));

		await loadCorpusPaged<Row>('wine', { baseUrl: 'https://cdn.example/data', fetchImpl, pageSize: 10 });

		expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://cdn.example/data/wine?tier=default&limit=10&offset=0', undefined);
	});

	it('throws when a page request resolves non-OK', async () => {
		const fetchImpl = vi.fn(async () => Promise.resolve(jsonResponse({}, false, 503))) as unknown as typeof fetch;

		await expect(loadCorpusPaged<Row>('wine', { fetchImpl })).rejects.toThrow(/503/);
	});

	it('breaks instead of hanging when the server returns an empty page early', async () => {
		// total says 100 but the server yields nothing — the guard must stop the loop.
		const fetchImpl = vi.fn(async () => Promise.resolve(jsonResponse({ items: [], total: 100 }))) as unknown as typeof fetch;

		const all = await loadCorpusPaged<Row>('wine', { fetchImpl });

		expect(all).toHaveLength(0);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('forwards an abort signal to every request', async () => {
		const controller = new AbortController();
		const fetchImpl = fakePagingFetch(corpusOf(1500));

		await loadCorpusPaged<Row>('wine', { fetchImpl, pageSize: 1000, signal: controller.signal });

		for (const call of vi.mocked(fetchImpl).mock.calls) {
			expect(call[1]).toEqual({ signal: controller.signal });
		}
	});
});
