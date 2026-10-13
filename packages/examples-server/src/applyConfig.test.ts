/**
 * Unit tests for `applyConfig` — the isomorphic core of the demo (runs the real engine in Node).
 *
 * @packageDocumentation
 */

import { type FilterEngineConfig } from '@filter-enginez/core';
import { describe, expect, it } from 'vitest';

import { applyConfig } from './applyConfig.js';
import { getDataset, UnknownDatasetError } from './datasets.js';

/** A config with no rules — matches every record. */
const EMPTY_CONFIG: FilterEngineConfig = { rules: [], version: 1 };

describe('applyConfig', () => {
	it('applies the built-in books config and matches a subset of the corpus', async () => {
		const result = await applyConfig('books', getDataset('books').defaultConfig, { limit: 5 });

		expect(result.total).toBeGreaterThan(0);
		expect(result.matched).toBeGreaterThan(0);
		expect(result.matched).toBeLessThanOrEqual(result.total);
		expect(result.results.length).toBeLessThanOrEqual(5);
		expect(result.appliedRuleIds.length).toBeGreaterThan(0);
		expect(result.datasetLabel).toBe('Books');
	});

	it('matches everything when the config has no rules', async () => {
		const result = await applyConfig('books', EMPTY_CONFIG, { limit: 0 });

		expect(result.matched).toBe(result.total);
		expect(result.results).toHaveLength(0);
		expect(result.truncated).toBe(true);
	});

	it('returns all matched records when limit is negative', async () => {
		const result = await applyConfig('books', EMPTY_CONFIG, { limit: -1 });

		expect(result.results).toHaveLength(result.matched);
		expect(result.truncated).toBe(false);
	});

	it('works for the wine dataset too', async () => {
		const result = await applyConfig('wine', EMPTY_CONFIG, { limit: 1 });

		expect(result.datasetLabel).toBe('Wine reviews');
		expect(result.total).toBeGreaterThan(0);
	});

	it('falls back to the default limit of 10 when none is supplied', async () => {
		// Every other test passed an explicit limit, so `options.limit ?? DEFAULT_LIMIT` never took its
		// fallback. This is the shape the HTTP layer and the bare `cli --dataset books` both rely on:
		// omitting the limit must page the output, not dump the entire corpus.
		const result = await applyConfig('books', EMPTY_CONFIG, {});

		expect(result.results).toHaveLength(10);
		expect(result.truncated).toBe(true);
		expect(result.matched).toBeGreaterThan(10);
	});

	it('falls back to the default limit when options are omitted altogether', async () => {
		const result = await applyConfig('books', EMPTY_CONFIG);

		expect(result.results).toHaveLength(10);
	});

	it('throws UnknownDatasetError for an unregistered dataset', async () => {
		await expect(applyConfig('nope', EMPTY_CONFIG)).rejects.toBeInstanceOf(UnknownDatasetError);
	});
});
