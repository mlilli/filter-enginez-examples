/**
 * Tests for `routes/compare/+server.ts` — the app's `/compare` address redirecting to the comparison
 * page on the landing site.
 *
 * @remarks
 * The handler is called directly with the one part of the request event it reads, the URL. SvelteKit's
 * `redirect` throws a `Redirect`, which is what the framework turns into the response, so the thrown
 * value is the thing under test.
 *
 * @packageDocumentation
 */

import { isRedirect, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';

import { GET } from './+server.js';

/** The route's `GET`, under a name that reads as the function it is. */
const handleCompareRequest: RequestHandler = GET;

/**
 * A `/compare` query as an app's Compare button writes it: a dataset, and a filter state whose JSON
 * quotes, braces, brackets and colons arrive percent-encoded. The redirect must carry it unchanged.
 */
const SHARED_QUERY = '?dataset=wine&f=json~%7B%22rules%22%3A%5B%7B%22id%22%3A%22color%22%7D%5D%7D';

/**
 * Call the handler for a URL and return what it threw.
 *
 * @param href - The requested URL.
 * @returns The thrown value.
 */
async function thrownFor(href: string): Promise<unknown> {
	try {
		// Only `url` is read; the rest of the event is irrelevant to a redirect.
		await handleCompareRequest({ url: new URL(href) } as unknown as RequestEvent);
	} catch (thrown) {
		return thrown;
	}

	return undefined;
}

describe('GET /compare', () => {
	it('permanently redirects the deployed app to the page on the apex, keeping the query byte for byte', async () => {
		const thrown = await thrownFor(`https://svelte.filterenginez.com/compare${SHARED_QUERY}`);

		expect(isRedirect(thrown)).toBe(true);
		expect(thrown).toMatchObject({ location: `https://filterenginez.com/compare${SHARED_QUERY}`, status: 301 });
	});

	it('redirects a local run to the local site server, keeping the query', async () => {
		expect(await thrownFor(`http://127.0.0.1:24612/compare${SHARED_QUERY}`)).toMatchObject({
			location: `http://127.0.0.1:24617/compare${SHARED_QUERY}`,
			status: 301,
		});
	});

	it('redirects a bare /compare to the page itself, with no query', async () => {
		expect(await thrownFor('https://svelte.filterenginez.com/compare')).toMatchObject({
			location: 'https://filterenginez.com/compare',
			status: 301,
		});
	});
});
