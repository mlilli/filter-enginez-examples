/**
 * Unit tests for the pure HTTP request handler (routing + validation over the real engine).
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { type ApplyConfigResult } from './applyConfig.js';
import { handleRequest } from './requestHandler.js';

/** POST body for a books filter with no rules (matches all). */
function filterBody(dataset: string): string {
	return JSON.stringify({ config: { rules: [], version: 1 }, dataset, limit: 3 });
}

describe('handleRequest', () => {
	it('answers GET /health', async () => {
		const response = await handleRequest('GET', '/health', undefined);

		expect(response.status).toBe(200);
		expect(response.body).toMatchObject({ ok: true });
	});

	it('lists datasets on GET /datasets', async () => {
		const response = await handleRequest('GET', '/datasets', undefined);
		const body = response.body as { datasets: readonly unknown[] };

		expect(response.status).toBe(200);
		expect(body.datasets.length).toBeGreaterThan(0);
	});

	it('filters on POST /filter', async () => {
		const response = await handleRequest('POST', '/filter', filterBody('books'));
		const body = response.body as ApplyConfigResult;

		expect(response.status).toBe(200);
		expect(body.matched).toBe(body.total);
		expect(body.results).toHaveLength(3);
	});

	it('returns results + facet metadata on POST /query', async () => {
		const response = await handleRequest('POST', '/query', filterBody('books'));
		const body = response.body as { chipGroups: readonly unknown[]; fields: readonly unknown[]; matched: number; total: number };

		expect(response.status).toBe(200);
		expect(Array.isArray(body.chipGroups)).toBe(true);
		expect(Array.isArray(body.fields)).toBe(true);
		expect(body.matched).toBe(body.total);
	});

	it('ships the full corpus on GET /corpus/:dataset', async () => {
		const response = await handleRequest('GET', '/corpus/books', undefined);
		const body = response.body as { dataset: string; records: readonly unknown[] };

		expect(response.status).toBe(200);
		expect(body.dataset).toBe('books');
		expect(body.records.length).toBeGreaterThan(0);
	});

	it('returns 404 on GET /corpus/:dataset for an unknown dataset', async () => {
		const response = await handleRequest('GET', '/corpus/nope', undefined);
		const body = response.body as { availableIds: readonly string[] };

		expect(response.status).toBe(404);
		expect(body.availableIds.length).toBeGreaterThan(0);
	});

	it('returns full result indices on POST /query', async () => {
		const response = await handleRequest('POST', '/query', filterBody('books'));
		const body = response.body as { matched: number; resultIndices: readonly number[] };

		expect(response.status).toBe(200);
		expect(body.resultIndices).toHaveLength(body.matched);
	});

	it('returns 400 for a non-JSON body', async () => {
		const response = await handleRequest('POST', '/filter', '{ not json');

		expect(response.status).toBe(400);
	});

	it('returns 400 for a body missing dataset/config', async () => {
		const response = await handleRequest('POST', '/filter', JSON.stringify({ config: { rules: [], version: 1 }}));

		expect(response.status).toBe(400);
	});

	it('returns 404 for an unknown dataset', async () => {
		const response = await handleRequest('POST', '/filter', filterBody('nope'));
		const body = response.body as { availableIds: readonly string[] };

		expect(response.status).toBe(404);
		expect(body.availableIds.length).toBeGreaterThan(0);
	});

	it('returns 400 when the POST body is absent entirely', async () => {
		// `JSON.parse(body ?? '')` — this exercises the `?? ''` side. A client that POSTs with no
		// body at all must get the same friendly 400 as one that sends garbage, not a crash.
		const response = await handleRequest('POST', '/filter', undefined);

		expect(response.status).toBe(400);
		expect(response.body).toMatchObject({ error: 'Request body must be valid JSON.' });
	});

	it.each([
		['a JSON string', '"hello"'],
		['a number', '42'],
		['null', 'null'],
		['an array', '[]'],
	])('returns 400 when the body is %s rather than an object', async (_label, body) => {
		// The `typeof value !== 'object' || value === null` guard in isFilterRequest had no coverage.
		// `null` matters most: `typeof null === 'object'`, so a guard written without the explicit
		// null check would sail past here and then throw on property access.
		const response = await handleRequest('POST', '/filter', body);

		expect(response.status).toBe(400);
	});

	it.each([
		['limit is not a number', { config: { rules: [], version: 1 }, dataset: 'books', limit: 'ten' }],
		['query is not an object', { config: { rules: [], version: 1 }, dataset: 'books', query: 5 }],
		// `typeof null === 'object'`, so the guard needs its explicit `!== null` arm — this is the case
		// that proves it is there. Without it a null query would pass validation and blow up downstream.
		['query is null', { config: { rules: [], version: 1 }, dataset: 'books', query: null }],
		['config.rules is not an array', { config: { rules: {}, version: 1 }, dataset: 'books' }],
		['config is null', { config: null, dataset: 'books' }],
	])('returns 400 when %s', async (_label, payload) => {
		const response = await handleRequest('POST', '/filter', JSON.stringify(payload));

		expect(response.status).toBe(400);
	});

	it('accepts a body that omits the optional limit and query', async () => {
		// The other side of those two optional guards: `undefined` must be ACCEPTED, not merely
		// tolerated. A guard that required them would break the documented minimal request.
		const response = await handleRequest('POST', '/filter', JSON.stringify({ config: { rules: [], version: 1 }, dataset: 'books' }));

		expect(response.status).toBe(200);
	});

	it('returns 400 (not 404) when a well-formed request carries an invalid config', async () => {
		// The non-UnknownDatasetError catch arm. The dataset resolves fine; it is the CONFIG that is
		// bad, so this must not be reported as a missing dataset.
		const response = await handleRequest(
			'POST',
			'/filter',
			JSON.stringify({ config: { rules: [{ id: 'x', type: 'not-a-real-rule-type' }], version: 1 }, dataset: 'books' }),
		);

		expect(response.status).toBe(400);
		expect(response.body).not.toHaveProperty('availableIds');
	});

	it('returns 404 for an unknown route', async () => {
		const response = await handleRequest('GET', '/nope', undefined);

		expect(response.status).toBe(404);
	});
});
