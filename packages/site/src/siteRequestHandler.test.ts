/**
 * Unit tests for the `filterenginez.com` Worker: the `www.` redirect, the canonical page paths and the
 * hand-off to the assets.
 *
 * @packageDocumentation
 */

import { describe, expect, it, vi } from 'vitest';

import { CANONICAL_HOST, handleSiteRequest, PAGE_PATHS, type SiteWorkerEnvironment, WWW_HOST } from './siteRequestHandler.js';
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

describe('canonical page paths', () => {
	it('lists the compare and how-it-works pages, so the cases below are not vacuous', () => {
		expect(PAGE_PATHS).toEqual(['/compare', '/how-it-works']);
	});

	it.each([
		['/how-it-works.html', '/how-it-works'],
		['/how-it-works/', '/how-it-works'],
		['/compare.html', '/compare'],
		['/compare/', '/compare'],
	])('permanently redirects %s to %s, keeping the query', async (path, canonical) => {
		const { assetsFetch, environment } = fakeEnvironment();
		// The compare page's whole input is its query, so the query surviving the redirect is the point.
		const response = await handleSiteRequest(
			new Request(`https://${CANONICAL_HOST}${path}?dataset=wine&f=h~%7B%7D#benchmark`),
			environment,
		);

		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe(`https://${CANONICAL_HOST}${canonical}?dataset=wine&f=h~%7B%7D`);
		expect(assetsFetch).not.toHaveBeenCalled();
	});

	it('stays on the request host, so a local wrangler dev redirects to itself', async () => {
		const { environment } = fakeEnvironment();
		const response = await handleSiteRequest(new Request('http://127.0.0.1:8787/how-it-works.html'), environment);

		expect(response.headers.get('location')).toBe('http://127.0.0.1:8787/how-it-works');
	});

	it('takes www to the apex AND the canonical path in one hop', async () => {
		const { environment } = fakeEnvironment();
		const response = await handleSiteRequest(new Request(`https://${WWW_HOST}/how-it-works/`), environment);

		expect(response.status).toBe(301);
		expect(response.headers.get('location')).toBe(`https://${CANONICAL_HOST}/how-it-works`);
	});

	it('leaves a path that only resembles a page to the assets (and their 404)', async () => {
		const { assetsFetch, environment } = fakeEnvironment();

		await handleSiteRequest(new Request(`https://${CANONICAL_HOST}/how-it-works.htm`), environment);
		await handleSiteRequest(new Request(`https://${CANONICAL_HOST}/how-it-works/extra`), environment);

		expect(assetsFetch).toHaveBeenCalledTimes(2);
	});

	it('serves the canonical path itself from the assets', async () => {
		const { assetsFetch, environment } = fakeEnvironment();
		const request = new Request(`https://${CANONICAL_HOST}/how-it-works`);

		await handleSiteRequest(request, environment);

		expect(assetsFetch).toHaveBeenCalledExactlyOnceWith(request);
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
