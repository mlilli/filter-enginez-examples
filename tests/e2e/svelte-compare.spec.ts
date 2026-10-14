/**
 * SvelteKit's `/compare` and `/about` — permanent redirects to the landing site, against the dev server.
 *
 * @remarks
 * The comparison page and the "How the engine works" page each live once, on the landing site, and
 * every app answers its own old address with a 301 there. The five static apps do it with a Workers
 * `_redirects` file, which no Vite dev server applies, so there is nothing to drive for them here.
 * SvelteKit is served by its own Worker or Node server, which `_redirects` never reaches, so it answers
 * both with real routes (`src/routes/compare/+server.ts`, `src/routes/about/+server.ts`) — and those
 * run in `pnpm dev` exactly as deployed. This file asks that running server.
 *
 * ### The query is the point
 *
 * A `/compare` link is its query: the dataset to open and the visitor's own serialized filter state.
 * The route appends the request's `search` exactly as it arrived rather than re-encoding parsed
 * parameters, so the first test sends a query in a shape `URLSearchParams` would never produce — raw
 * `~`, `:` and `,`, and `%20` rather than `+` for a space — and requires the `location` header to carry
 * it byte for byte. A route that decoded and re-encoded would produce an equivalent query, and fail.
 *
 * ### Why `request` rather than `page.goto`
 *
 * A browser follows the redirect, and what is under test is the redirect itself: its status and its
 * `location`. `maxRedirects: 0` returns the 301 as the response. The target being a loopback URL is
 * the dev-layout half of `siteUrl`; `server.test.ts` beside each route covers the deployed half.
 *
 * @packageDocumentation
 */

import { expect, test } from '@playwright/test';

import { DATASET_PARAM, URL_STATE_PARAM } from '../../packages/examples-shared/src/compare/links.js';
import { COMPARE_PATH, HOW_IT_WORKS_PATH } from '../../packages/examples-shared/src/verticals/verticals.js';
import { siteUrl } from './siteBase.js';
import { svelteUrl } from './svelteBase.js';

/** The status every one of these routes must answer with: permanent, so links and search engines move. */
const MOVED_PERMANENTLY = 301;

/**
 * A `/compare` query exactly as a hand-edited or chat-mangled link might carry it.
 *
 * @remarks
 * Already in the form a URL parser leaves alone — every byte the WHATWG query percent-encode set would
 * touch is escaped — so neither Playwright nor the dev server normalizes it on the way in, and the only
 * thing that could change it is the route. And NOT in the form `URLSearchParams` writes, which would
 * escape `~`, `:` and `,` and turn `%20` into `+`.
 */
const SHARED_QUERY = `${DATASET_PARAM}=wine&${URL_STATE_PARAM}=h~%7B%22version%22:1,%22rules%22:%5B%5D,%22label%22:%22red%20wine%22%7D`;

test.describe('SvelteKit — old addresses redirect to the landing site', () => {
	test('/compare answers 301 to the comparison page, with its query byte for byte', async ({ request }) => {
		const response = await request.get(svelteUrl(`${COMPARE_PATH}?${SHARED_QUERY}`), { maxRedirects: 0 });

		expect(response.status()).toBe(MOVED_PERMANENTLY);
		expect(response.headers()['location']).toBe(siteUrl(`${COMPARE_PATH}?${SHARED_QUERY}`));
	});

	test('a bare /compare answers 301 to the comparison page itself', async ({ request }) => {
		const response = await request.get(svelteUrl(COMPARE_PATH), { maxRedirects: 0 });

		expect(response.status()).toBe(MOVED_PERMANENTLY);
		expect(response.headers()['location']).toBe(siteUrl(COMPARE_PATH));
	});

	test('/about answers 301 to the how-it-works page', async ({ request }) => {
		const response = await request.get(svelteUrl('/about'), { maxRedirects: 0 });

		expect(response.status()).toBe(MOVED_PERMANENTLY);
		expect(response.headers()['location']).toBe(siteUrl(HOW_IT_WORKS_PATH));
	});
});
