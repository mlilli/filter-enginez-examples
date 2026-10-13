/**
 * Unit tests for the `filterenginez.com` Worker: the `www.` redirect and the hand-off to the assets.
 *
 * @packageDocumentation
 */

import { describe, expect, it, vi } from 'vitest';

import { CANONICAL_HOST, handleSiteRequest, type SiteWorkerEnvironment, WWW_HOST } from './siteRequestHandler.js';
import worker from './worker.js';

/**
 * A fake `env` whose assets binding answers every request with a recognizable body.
 *
 * @returns The environment and the spy behind its binding.
 */
function fakeEnvironment(): { readonly assetsFetch: ReturnType<typeof vi.fn>; readonly environment: SiteWorkerEnvironment } {
	const assetsFetch = vi.fn<(request: Request) => Promise<Response>>()
		.mockResolvedValue(new Response('<!doctype html><title>Filter EngineZ</title>'));

	return { assetsFetch, environment: { ASSETS: { fetch: assetsFetch }}};
}

describe('handleSiteRequest', () => {
	it('permanently redirects the www host to the apex, keeping the path and the query string', async () => {
		const { assetsFetch, environment } = fakeEnvironment();
		const response = await handleSiteRequest(new Request(`https://${WWW_HOST}/robots.txt?x=1#top`), environment);

		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe(`https://${CANONICAL_HOST}/robots.txt?x=1`);
		expect(assetsFetch).not.toHaveBeenCalled();
	});

	it('redirects the bare www root to the apex root', async () => {
		const { environment } = fakeEnvironment();
		const response = await handleSiteRequest(new Request(`http://${WWW_HOST}/`), environment);

		expect(response.headers.get('location')).toBe(`https://${CANONICAL_HOST}/`);
	});

	it('serves the apex from the static assets, untouched', async () => {
		const { assetsFetch, environment } = fakeEnvironment();
		const request = new Request(`https://${CANONICAL_HOST}/`);
		const response = await handleSiteRequest(request, environment);

		expect(response.status).toBe(200);
		expect(assetsFetch).toHaveBeenCalledExactlyOnceWith(request);
	});

	it('leaves any other host to the assets rather than guessing (a local `wrangler dev`, for one)', async () => {
		const { assetsFetch, environment } = fakeEnvironment();

		await handleSiteRequest(new Request('http://127.0.0.1:8787/sitemap.xml'), environment);

		expect(assetsFetch).toHaveBeenCalledOnce();
	});
});

describe('worker (the Worker entry point)', () => {
	it('exports nothing but the default handler, and routes fetch to handleSiteRequest', async () => {
		// The Workers runtime refuses to start a main module with a named export that is not a handler,
		// and nothing short of starting the runtime shows it.
		expect(Object.keys(await import('./worker.js'))).toEqual(['default']);
		expect(worker.fetch).toBe(handleSiteRequest);
	});
});
