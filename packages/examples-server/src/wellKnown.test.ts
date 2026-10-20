/**
 * Unit tests for the well-known answer (`wellKnown`): which paths it claims, the 404 it sends, and the
 * static sites' handler that pairs it with the assets.
 *
 * @packageDocumentation
 */

import { describe, expect, it, vi } from 'vitest';

import type { ApiWorkerEnvironment } from './workerRequestHandler.js';

import { handleStaticAssetsRequest, isWellKnownPath, WELL_KNOWN_PATH, wellKnownNotFound } from './wellKnown.js';

/** The host of a static site. */
const ORIGIN = 'https://docs.filterenginez.com';

/**
 * A fake `env` whose assets binding answers every request with the app shell and a 200, as the
 * single-page-application fallback does.
 *
 * @returns The environment and the spy behind its binding.
 */
function fakeEnvironment(): { readonly assetsFetch: ReturnType<typeof vi.fn>; readonly environment: ApiWorkerEnvironment } {
	const assetsFetch = vi.fn<(request: Request) => Promise<Response>>()
		.mockResolvedValue(new Response('<!doctype html><title>app</title>', { status: 200 }));

	return { assetsFetch, environment: { ASSETS: { fetch: assetsFetch }}};
}

describe('isWellKnownPath', () => {
	it.each([WELL_KNOWN_PATH, '/.well-known/', '/.well-known/ai-catalog.json', '/.well-known/security.txt', '/.well-known/a/b'])('claims %s', (pathname) => {
		expect(isWellKnownPath(pathname)).toBe(true);
	});

	it.each(['/', '/.well-known-ish', '/docs/.well-known/x', '/llms.txt', '/robots.txt', '/well-known/x'])('leaves %s alone', (pathname) => {
		expect(isWellKnownPath(pathname)).toBe(false);
	});
});

describe('wellKnownNotFound', () => {
	it('is a plain-text 404', async () => {
		const response = wellKnownNotFound();

		expect(response.status).toBe(404);
		expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
		expect(await response.text()).toBe('Not found\n');
	});

	it('is a fresh response each time, so each can be read', () => {
		expect(wellKnownNotFound()).not.toBe(wellKnownNotFound());
	});
});

describe('handleStaticAssetsRequest', () => {
	it('answers a well-known URI with a 404, without asking the assets', async () => {
		const { assetsFetch, environment } = fakeEnvironment();
		const response = await handleStaticAssetsRequest(new Request(`${ORIGIN}/.well-known/ai-catalog.json?x=1`), environment);

		expect(response.status).toBe(404);
		expect(assetsFetch).not.toHaveBeenCalled();
	});

	it('hands every other request to the static assets untouched', async () => {
		const { assetsFetch, environment } = fakeEnvironment();
		const request = new Request(`${ORIGIN}/docs/rules/value`);
		const response = await handleStaticAssetsRequest(request, environment);

		expect(assetsFetch).toHaveBeenCalledExactlyOnceWith(request);
		expect(response.status).toBe(200);
	});
});
