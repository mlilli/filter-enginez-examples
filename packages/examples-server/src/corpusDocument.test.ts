/**
 * Unit tests for the corpus document and its URL shape (`corpusDocument.ts`).
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import {
	CORPUS_FILE_EXTENSION,
	CORPUS_PATH_PREFIX,
	corpusDocument,
	corpusFileName,
	corpusPath,
	datasetIdFromCorpusPath,
} from './corpusDocument.js';
import { datasetIds, getDataset, UnknownDatasetError } from './datasets.js';

describe('corpusDocument', () => {
	it('registers datasets to build documents for, so the cases below are not vacuous', () => {
		expect(datasetIds().length).toBeGreaterThan(0);
	});

	it.each(datasetIds())('carries the %s dataset id, its label and its whole corpus in engine order', (datasetId) => {
		const dataset = getDataset(datasetId);

		expect(corpusDocument(datasetId)).toEqual({ dataset: datasetId, label: dataset.label, records: dataset.sourceData });
		// The same array, not a copy: result indices from the server join against it by position.
		expect(corpusDocument(datasetId).records).toBe(dataset.sourceData);
	});

	it('throws UnknownDatasetError for an unregistered id', () => {
		expect(() => corpusDocument('nope')).toThrow(UnknownDatasetError);
	});
});

describe('the corpus URL shape', () => {
	it('names the file <dataset>.json and serves it under /corpus/', () => {
		expect(CORPUS_PATH_PREFIX).toBe('/corpus/');
		expect(CORPUS_FILE_EXTENSION).toBe('.json');
		expect(corpusFileName('wine')).toBe('wine.json');
		expect(corpusPath('wine')).toBe('/corpus/wine.json');
	});

	it.each(datasetIds())('reads the %s id back out of its own path', (datasetId) => {
		expect(datasetIdFromCorpusPath(corpusPath(datasetId))).toBe(datasetId);
	});

	it('decodes a percent-encoded id', () => {
		expect(datasetIdFromCorpusPath('/corpus/real%20estate.json')).toBe('real estate');
	});

	it.each([
		['the extension is missing', '/corpus/books'],
		['the extension is another one', '/corpus/books.csv'],
		['the id is empty', '/corpus/.json'],
		['the prefix is missing', '/books.json'],
		['the path only resembles the prefix', '/corpusbooks.json'],
		['another route', '/query'],
	])('returns null when %s', (_label, path) => {
		expect(datasetIdFromCorpusPath(path)).toBeNull();
	});
});
