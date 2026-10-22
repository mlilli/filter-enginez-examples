/**
 * Unit tests for the Cloudflare Worker adapter over the pure request handler (`workerRequestHandler`).
 *
 * @remarks
 * Run in plain Node with the standard `Request` / `Response`, which is all the adapter touches. The
 * static-assets binding is a recording fake, so the split between "the API answers" and "the assets
 * answer" is asserted directly rather than inferred from a status code.
 *
 * @packageDocumentation
 */

import { describe, expect, it, vi } from 'vitest';

import { API_PATH_PREFIX, type ApiWorkerEnvironment, handleWorkerRequest, isApiPath } from './workerRequestHandler.js';

/** The host a deployed server-backed app answers on. */
const ORIGIN = 'https://react-rtk.filterenginez.com';

/**
 * A fake `env` whose assets binding answers every request with a recognizable body.
 *
 * @returns The environment and the spy behind its binding.
 */
function fakeEnvironment(): { readonly assetsFetch: ReturnType<typeof vi.fn>; readonly environment: ApiWorkerEnvironment } {
	const assetsFetch = vi.fn<(request: Request) => Promise<Response>>()
		.mockResolvedValue(new Response('<!doctype html><title>app</title>', { status: 200 }));

	return { assetsFetch, environment: { ASSETS: { fetch: assetsFetch }}};
}

describe('isApiPath', () => {
	it.each(['/api', '/api/', '/api/query', '/api/corpus/books.json'])('claims %s', (pathname) => {
		expect(isApiPath(pathname)).toBe(true);
	});

	it.each(['/', '/books-server', '/apiary', '/assets/api.js', '/wine'])('leaves %s to the assets', (pathname) => {
		expect(isApiPath(pathname)).toBe(false);
	});
});

describe('handleWorkerRequest', () => {
	it('answers /api/health from the shared handler, with the prefix stripped', async () => {
		const { assetsFetch, environment } = fakeEnvironment();
		const response = await handleWorkerRequest(new Request(`${ORIGIN}${API_PATH_PREFIX}/health`), environment);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toMatch(/^application\/json/u);
		expect(await response.json()).toMatchObject({ ok: true });
		expect(assetsFetch).not.toHaveBeenCalled();
	});

	it('treats a bare /api as the handler root', async () => {
		const { environment } = fakeEnvironment();
		const response = await handleWorkerRequest(new Request(`${ORIGIN}${API_PATH_PREFIX}`), environment);

		expect(await response.json()).toMatchObject({ ok: true });
	});

	it('passes a POST body through to /query, the round trip the server-backed routes make', async () => {
		const { environment } = fakeEnvironment();
		const request = new Request(`${ORIGIN}${API_PATH_PREFIX}/query`, {
			body: JSON.stringify({ config: { rules: [], version: 1 }, dataset: 'books', limit: 0, query: {}}),
			headers: { 'content-type': 'application/json' },
			method: 'POST',
		});
		const response = await handleWorkerRequest(request, environment);
		const body = (await response.json()) as { matched: number; resultIndices: readonly number[]; total: number };

		expect(response.status).toBe(200);
		expect(body.matched).toBe(body.total);
		expect(body.resultIndices).toHaveLength(body.total);
	});

	it('keeps the handler’s error status, so a bad request is a 400 and not a 200 with an error body', async () => {
		const { environment } = fakeEnvironment();
		const request = new Request(`${ORIGIN}${API_PATH_PREFIX}/query`, { body: 'not json', method: 'POST' });
		const response = await handleWorkerRequest(request, environment);

		expect(response.status).toBe(400);
	});

	it('serves an unknown API route as a JSON 404 rather than falling through to the app shell', async () => {
		// The assets answer any unmatched path with the app's HTML. Were `/api/*` allowed to reach them, a
		// client expecting JSON would get HTML and fail somewhere far from the cause.
		const { assetsFetch, environment } = fakeEnvironment();
		const response = await handleWorkerRequest(new Request(`${ORIGIN}${API_PATH_PREFIX}/nope`), environment);

		expect(response.status).toBe(404);
		expect(assetsFetch).not.toHaveBeenCalled();
	});

	it('answers a well-known URI with a 404 rather than the app shell', async () => {
		// The assets would answer `/.well-known/ai-catalog.json` with the app's HTML not-found page; the
		// truth, that there is no catalog, takes a plain 404.
		const { assetsFetch, environment } = fakeEnvironment();
		const response = await handleWorkerRequest(new Request(`${ORIGIN}/.well-known/ai-catalog.json`), environment);

		expect(response.status).toBe(404);
		expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
		expect(assetsFetch).not.toHaveBeenCalled();
	});

	it('hands every non-API request to the static assets untouched', async () => {
		const { assetsFetch, environment } = fakeEnvironment();
		const request = new Request(`${ORIGIN}/books-server?f=x`);
		const response = await handleWorkerRequest(request, environment);

		expect(assetsFetch).toHaveBeenCalledExactlyOnceWith(request);
		expect(await response.text()).toContain('<title>app</title>');
	});
});
