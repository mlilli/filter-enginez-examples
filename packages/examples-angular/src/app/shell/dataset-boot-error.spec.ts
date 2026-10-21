/**
 * Tests for `withDatasetBootFailure` and `DatasetBootError`.
 *
 * @remarks
 * The root component tells a failed engine boot from a page that did not load by this class alone, so
 * the wrapper must tag a rejection with its dataset and keep the boot's own message, and must leave a
 * successful boot's value untouched.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { DatasetBootError, withDatasetBootFailure } from './dataset-boot-error.js';

describe('withDatasetBootFailure', () => {
	it('passes a successful boot through unchanged', async () => {
		const booted = { engine: 'ready' };

		await expect(withDatasetBootFailure('books', Promise.resolve(booted))).resolves.toBe(booted);
	});

	it('turns a failed boot into a DatasetBootError naming the dataset, with the boot\'s message', async () => {
		const cause = new Error('corpus missing');
		const failure: unknown = await withDatasetBootFailure('real-estate', Promise.reject(cause)).catch((caught: unknown) => caught);

		expect(failure).toBeInstanceOf(DatasetBootError);
		expect((failure as DatasetBootError).dataset).toBe('real-estate');
		expect((failure as DatasetBootError).message).toBe('corpus missing');
		expect((failure as DatasetBootError).cause).toBe(cause);
	});

	it('words a non-Error rejection as its string form', () => {
		const failure = new DatasetBootError('wine', 'worker refused');

		expect(failure.message).toBe('worker refused');
		expect(failure.name).toBe('DatasetBootError');
	});
});
