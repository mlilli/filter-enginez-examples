/**
 * Tests for `routes/about/+server.ts` — the old `/about` address redirecting to the how-it-works page.
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
const handleAboutRequest: RequestHandler = GET;

/**
 * Call the handler for a URL and return what it threw.
 *
 * @param href - The requested URL.
 * @returns The thrown value.
 */
async function thrownFor(href: string): Promise<unknown> {
	try {
		// Only `url` is read; the rest of the event is irrelevant to a redirect.
		await handleAboutRequest({ url: new URL(href) } as unknown as RequestEvent);
	} catch (thrown) {
		return thrown;
	}

	return undefined;
}

describe('GET /about', () => {
	it('permanently redirects the deployed app to the page on the apex', async () => {
		const thrown = await thrownFor('https://svelte.filterenginez.com/about');

		expect(isRedirect(thrown)).toBe(true);
		expect(thrown).toMatchObject({ location: 'https://filterenginez.com/how-it-works', status: 301 });
	});

	it('redirects a local run to the local site server', async () => {
		expect(await thrownFor('http://127.0.0.1:5175/about')).toMatchObject({
			location: 'http://127.0.0.1:5181/how-it-works',
			status: 301,
		});
	});
});
