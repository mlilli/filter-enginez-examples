/**
 * Test for the server-backed books boot.
 *
 * @remarks
 * Two lines of code, and the point of both is that the SURFACE is identical to the main-thread boot.
 * The server-backed route mounts the exact same `<BooksApp>`, so anything missing from this engine
 * shows up as a component crash inside shared code — not as a boot failure anyone could attribute to
 * the transport.
 *
 * `asyncEngine` being present is the load-bearing assertion. Every predictive-disable read in the
 * shared bundle hooks branches on it; an engine that resolved without it would silently run the
 * filter on the MAIN THREAD against a corpus fetched for display purposes, which is the one outcome
 * that both works and defeats the entire point of the route.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bootBooksServerEngine } from './bootServerEngine.js';

const CORPUS = [
	{ averageRating: 4.2, genre: 'fantasy', id: 'b1', pageCount: 300, title: 'One' },
	{ averageRating: 3.1, genre: 'mystery', id: 'b2', pageCount: 220, title: 'Two' },
];

beforeEach(() => {
	vi.stubGlobal('fetch', vi.fn(async (url: string) => {
		const payload = String(url).includes('/corpus/')
			? { dataset: 'books', records: CORPUS }
			: { chipGroups: [], fields: [], matched: CORPUS.length, resultIndices: [0, 1]};

		return Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }));
	}));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('bootBooksServerEngine', () => {
	it('resolves a signals engine over the server corpus', async () => {
		const engine = await bootBooksServerEngine({ dataset: 'books' });

		expect(engine.sourceData.value).toHaveLength(CORPUS.length);
	});

	it('exposes an asyncEngine, so reads round-trip instead of running locally', async () => {
		// The whole reason the route exists. Without this, the shared bundle hooks take their
		// main-thread branch and filter in the browser over a corpus that was only meant for display —
		// which looks completely correct and proves nothing about the server.
		const engine = await bootBooksServerEngine({ dataset: 'books' });

		expect(engine.asyncEngine).toBeDefined();
	});

	it('forwards transport options to the HTTP engine', async () => {
		// The SvelteKit vertical overrides `baseUrl` to hit its own in-process endpoint. A boot that
		// dropped the option would silently fall back to `/api` — which 404s only in the app that
		// needed the override, and only at runtime.
		await bootBooksServerEngine({ baseUrl: '/books-server', dataset: 'books' });

		const calls = vi.mocked(globalThis.fetch).mock.calls.map(([url]) => url as string);

		expect(calls.every((url) => url.startsWith('/books-server'))).toBe(true);
	});
});
