/**
 * Tests for `firstBundle.ts`: the wine panel's first bundle, fetched before the panel first renders.
 *
 * @remarks
 * The engine is a stub answering on the main thread: what is under test is which query is asked, what is
 * kept for which corpus, and that a failure leaves nothing behind for a panel to start from.
 */

import type { FilterBundle, FilterBundleQuery } from '@filter-enginez/core';

import { type Wine } from '@filter-enginez/mock-data/wine';
import { generateWines } from '@filter-enginez/mock-data/wine/generator';
import { describe, expect, it, vi } from 'vitest';

import { buildWineBundleQuery } from './bundle.js';
import { wineFacetsFor } from './facets.js';
import { fetchFirstWineBundle, primedFirstWineBundle, primeFirstWineBundle, type WineCorpusQueryable } from './firstBundle.js';

/**
 * A bundle carrying a recognizable count.
 *
 * @param resultCount - The count it reports.
 * @returns A `FilterBundle`-shaped stub.
 */
function bundleWithCount(resultCount: number): FilterBundle {
	return { chipGroups: [], fields: [], resultCount, resultIndices: new Uint32Array() };
}

/**
 * A main-thread engine stub over a corpus.
 *
 * @param corpus - What `getSourceData` returns.
 * @param answer - What a query returns, or throws.
 * @returns The engine and its query spy.
 */
function engineOver(corpus: readonly Wine[], answer: () => FilterBundle): { readonly engine: WineCorpusQueryable; readonly query: ReturnType<typeof vi.fn> } {
	const query = vi.fn((_query?: FilterBundleQuery) => answer());

	return { engine: { core: { applyFiltersAndQuery: query, getSourceData: () => corpus }}, query };
}

/** A small generated corpus, so its facets are real. */
const CORPUS: readonly Wine[] = generateWines(40);

describe('fetchFirstWineBundle', () => {
	it('asks the query the panel asks first, built from the facets', async () => {
		const facets = wineFacetsFor(CORPUS);
		const { engine, query } = engineOver(CORPUS, () => bundleWithCount(5));

		await expect(fetchFirstWineBundle(engine, facets)).resolves.toEqual(bundleWithCount(5));
		expect(query).toHaveBeenCalledWith(buildWineBundleQuery(facets.baselines, facets.vocabularies, facets.originSpecs));
	});
});

describe('primeFirstWineBundle / primedFirstWineBundle', () => {
	it('keeps the bundle for the engine’s corpus, and for no other', async () => {
		const corpus = generateWines(30);
		const { engine } = engineOver(corpus, () => bundleWithCount(7));

		expect(primedFirstWineBundle(corpus)).toBeNull();

		await primeFirstWineBundle(engine);

		expect(primedFirstWineBundle(corpus)).toEqual(bundleWithCount(7));
		expect(primedFirstWineBundle([...corpus])).toBeNull();
	});

	it('keeps each visit’s bundle, so a panel never starts from an earlier visit’s state', async () => {
		const corpus = generateWines(30);
		let count = 1;
		const { engine } = engineOver(corpus, () => bundleWithCount(count));

		await primeFirstWineBundle(engine);
		count = 2;
		await primeFirstWineBundle(engine);

		expect(primedFirstWineBundle(corpus)?.resultCount).toBe(2);
	});

	it('forgets an earlier bundle when the fetch fails: the panel starts without one', async () => {
		const corpus = generateWines(30);
		let shouldFail = false;
		const { engine } = engineOver(corpus, () => {
			if (shouldFail) {
				throw new Error('worker gone');
			}

			return bundleWithCount(3);
		});

		await primeFirstWineBundle(engine);
		shouldFail = true;
		await primeFirstWineBundle(engine);

		expect(primedFirstWineBundle(corpus)).toBeNull();
	});
});
