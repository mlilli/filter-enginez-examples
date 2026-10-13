/**
 * Unit tests for `datasetFilterService` — the in-process server-filtering brain the SvelteKit
 * endpoints + the SSR `load`s share. Exercises the real isomorphic core over the committed books
 * corpus (same path the endpoints run), and pins the dataset-agnostic contract that `/wine-server`
 * relies on: an unknown dataset rejects, and a registered one (`wine`) resolves — so these double as
 * an integration check of the whole server tier.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { buildConfigFromParams } from './booksServerParams.js';
import { loadDatasetCorpus, runDatasetQuery } from './datasetFilterService.js';

describe('runDatasetQuery', () => {
	it('returns the full corpus for a neutral config', async () => {
		const result = await runDatasetQuery({ config: { rules: [], version: 1 }, dataset: 'books', limit: 0, query: {}});

		expect(result.matched).toBe(result.total);
		expect(result.total).toBeGreaterThan(0);
		expect(result.resultIndices).toHaveLength(result.matched);
	});

	it('narrows the result set when a genre + rating filter is applied', async () => {
		const config = buildConfigFromParams({ genres: ['fantasy'], minRating: 4, search: '' });
		const result = await runDatasetQuery({ config, dataset: 'books', limit: 0, query: {}});

		expect(result.matched).toBeGreaterThan(0);
		expect(result.matched).toBeLessThan(result.total);
	});

	it('materializes at most `limit` result records', async () => {
		const result = await runDatasetQuery({ config: { rules: [], version: 1 }, dataset: 'books', limit: 5, query: {}});

		expect(result.results).toHaveLength(5);
		// `resultIndices` is always the full set, independent of the record limit.
		expect(result.resultIndices.length).toBeGreaterThan(5);
	});

	it('resolves the wine dataset too (the /wine-server contract)', async () => {
		// Not books-only: the service is dataset-agnostic, and `/wine-server` depends on `wine` being a
		// registered, filterable dataset. A neutral config returns the whole wine corpus.
		const result = await runDatasetQuery({ config: { rules: [], version: 1 }, dataset: 'wine', limit: 0, query: {}});

		expect(result.total).toBeGreaterThan(0);
		expect(result.matched).toBe(result.total);
	});

	it('rejects an unknown dataset', async () => {
		await expect(runDatasetQuery({ config: { rules: [], version: 1 }, dataset: 'nope', query: {}})).rejects.toThrow();
	});
});

describe('loadDatasetCorpus', () => {
	it('returns the resident corpus for a known dataset', () => {
		expect(loadDatasetCorpus('books').length).toBeGreaterThan(0);
		expect(loadDatasetCorpus('wine').length).toBeGreaterThan(0);
	});

	it('throws for an unknown dataset', () => {
		expect(() => loadDatasetCorpus('nope')).toThrow();
	});
});
