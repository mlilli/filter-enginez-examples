/**
 * Tests for the two prerendered corpus routes, `/books-server/corpus/[dataset].json` and
 * `/wine-server/corpus/[dataset].json`.
 *
 * @remarks
 * What each route must do, and what would otherwise only show up in production:
 *
 * - **Be prerendered, for exactly the dataset its page fetches.** Without `prerender`, every corpus
 *   request runs the deployed Worker, whose CPU limit a corpus serialization exceeds. Without the
 *   page's dataset in `entries`, no file is written and the page's boot fetch fails.
 * - **Send examples-server's bytes.** The shared browser transport reads the same document from either
 *   server, so the body must be byte-identical to examples-server's `GET /corpus/<dataset>.json`.
 *
 * The handlers are called directly with the one part of the request event they read, `params`.
 *
 * @packageDocumentation
 */

import { corpusPath, handleRequest } from '@filter-enginez/examples-server';
import { isHttpError, type RequestEvent } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';

import * as booksCorpusRoute from '../../routes/books-server/corpus/[dataset].json/+server.js';
import * as wineCorpusRoute from '../../routes/wine-server/corpus/[dataset].json/+server.js';

/** The shape both route modules share. */
interface CorpusRouteModule {
	readonly entries: () => Promise<readonly { readonly dataset: string }[]> | readonly { readonly dataset: string }[];
	readonly GET: (event: RequestEvent) => Promise<Response> | Response;
	readonly prerender: boolean;
}

/** Each route, the page it serves, and the one dataset that page boots. */
const CORPUS_ROUTES: readonly (readonly [route: string, module: CorpusRouteModule, datasetId: string])[] = [
	['/books-server/corpus/[dataset].json', booksCorpusRoute as unknown as CorpusRouteModule, 'books'],
	['/wine-server/corpus/[dataset].json', wineCorpusRoute as unknown as CorpusRouteModule, 'wine'],
];

/**
 * Call a route's `GET` for a dataset id.
 *
 * @param module - The route module.
 * @param dataset - The `[dataset]` param.
 * @returns The response.
 */
async function getCorpus(module: CorpusRouteModule, dataset: string): Promise<Response> {
	const handleCorpusRequest = module.GET;

	return handleCorpusRequest({ params: { dataset }} as unknown as RequestEvent);
}

describe.each(CORPUS_ROUTES)('%s', (_route, module, datasetId) => {
	it('is prerendered', () => {
		expect(module.prerender).toBe(true);
	});

	it(`prerenders exactly the dataset its page fetches (${datasetId})`, async () => {
		expect(await module.entries()).toEqual([{ dataset: datasetId }]);
	});

	it('answers with JSON byte-identical to examples-server’s GET /corpus/<dataset>.json', async () => {
		const response = await getCorpus(module, datasetId);
		const expected = await handleRequest('GET', corpusPath(datasetId), undefined);
		const actualBody = await response.text();
		const expectedBody = JSON.stringify(expected.body);

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/json');
		expect(expected.status).toBe(200);
		// A boolean rather than `toBe`, so a mismatch does not ask Vitest to diff megabytes of JSON.
		expect(actualBody === expectedBody, `${String(actualBody.length)} characters, expected ${String(expectedBody.length)} identical ones`).toBe(true);
	});

	it('answers an unregistered dataset with a 404 naming it', async () => {
		let thrown: unknown;

		try {
			await getCorpus(module, 'nope');
		} catch (caught) {
			thrown = caught;
		}

		expect(isHttpError(thrown, 404)).toBe(true);
		expect(thrown).toMatchObject({ body: { message: expect.stringContaining('"nope"') as unknown }});
	});
});
