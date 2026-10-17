/**
 * Tests for `corpusApi` — the announcement that turns the dataset boots' corpus stream on.
 *
 * @remarks
 * Module state, so each case loads a fresh copy: what a page starts with is exactly what a production
 * build keeps, because nothing there ever announces.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as CorpusApi from './corpusApi.js';

/** A fresh copy of the module, with nothing announced yet. */
async function freshCorpusApi(): Promise<typeof CorpusApi> {
	return import('./corpusApi.js');
}

beforeEach(() => {
	vi.resetModules();
});

describe('corpusApi', () => {
	it('reports no API until one is announced', async () => {
		const { hasCorpusApi } = await freshCorpusApi();

		expect(hasCorpusApi()).toBe(false);
	});

	it('reports the API from the announcement on, however often it is repeated', async () => {
		const { announceCorpusApi, hasCorpusApi } = await freshCorpusApi();

		announceCorpusApi();
		expect(hasCorpusApi()).toBe(true);

		announceCorpusApi();
		expect(hasCorpusApi()).toBe(true);
	});
});
