/**
 * The pure HTTP request handler — routing + validation with no `node:http` coupling, so it unit-tests
 * without binding a port. `server.ts` is a thin adapter that pipes real requests through this.
 *
 * @packageDocumentation
 */

import { type FilterBundleQuery, type FilterEngineConfig } from '@filter-enginez/core';

import { applyConfig } from './applyConfig.js';
import { applyConfigQuery } from './applyQuery.js';
import { corpusDocument, datasetIdFromCorpusPath } from './corpusDocument.js';
import { listDatasets, UnknownDatasetError } from './datasets.js';

/** A framework-agnostic response: an HTTP status + a JSON-serializable body. */
export interface HandlerResponse {
	readonly body: unknown;
	readonly status: number;
}

/** Default result limit for the HTTP endpoint. */
const DEFAULT_HTTP_LIMIT = 10;

/** The narrowed `/filter` + `/query` request shape. `query` is only meaningful for `/query`. */
interface FilterRequest {
	readonly config: FilterEngineConfig;
	readonly dataset: string;
	readonly limit?: number;
	readonly query?: FilterBundleQuery;
}

/** Narrow an unknown payload to the `/filter` request shape. */
function isFilterRequest(value: unknown): value is FilterRequest {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const candidate = value as { config?: unknown; dataset?: unknown; limit?: unknown; query?: unknown };

	return (
		typeof candidate.dataset === 'string'
		&& typeof candidate.config === 'object'
		&& candidate.config !== null
		&& Array.isArray((candidate.config as { rules?: unknown }).rules)
		&& (candidate.limit === undefined || typeof candidate.limit === 'number')
		&& (candidate.query === undefined || (typeof candidate.query === 'object' && candidate.query !== null))
	);
}

/**
 * Route + handle a request.
 *
 * @param method - HTTP method.
 * @param path - Request path (query string already stripped).
 * @param body - Raw request body (for POST), or `undefined`.
 * @returns The status + JSON body to send.
 */
export async function handleRequest(method: string, path: string, body: string | undefined): Promise<HandlerResponse> {
	if (method === 'GET' && (path === '/' || path === '/health')) {
		return { body: { ok: true, service: '@filter-enginez/examples-server' }, status: 200 };
	}
	if (method === 'GET' && path === '/datasets') {
		return { body: { datasets: listDatasets() }, status: 200 };
	}
	// `/corpus/<dataset>.json` ships the full corpus once, so a server-backed browser engine can hold a
	// resident copy (for slider baselines, chip vocabularies, and index→record joins) exactly as the
	// worker tier ships its corpus to the main thread at boot. The server stays the filtering
	// authority — this is the data, not the decisions. Deployed, the same path is a static file
	// written from this route's body (`corpusFiles.ts`), so the Worker never serializes a corpus.
	const corpusDatasetId = method === 'GET' ? datasetIdFromCorpusPath(path) : null;

	if (corpusDatasetId !== null) {
		try {
			return { body: corpusDocument(corpusDatasetId), status: 200 };
		} catch (error) {
			/* v8 ignore start -- defensive: on this route the only call inside the `try` is the
			   synchronous `corpusDocument`, whose registry lookup throws UnknownDatasetError or nothing, so
			   this guard is unreachable. It is kept so any change to that try body cannot turn an
			   unexpected throw into an unhandled rejection. The `/filter` route's identical-looking arm
			   IS reachable (a bad config makes the engine throw) and is covered by test.

			   Written as a guard clause inside start/stop rather than as a trailing `return` after an
			   `if`: the uncoverable thing is the IF's implicit else-branch, and a line-based
			   `v8 ignore next N` on the trailing return does not reach a branch counter anchored to the
			   `if` line above it. */
			if (!(error instanceof UnknownDatasetError)) {
				return { body: { error: (error as Error).message }, status: 400 };
			}
			/* v8 ignore stop */

			return { body: { availableIds: error.availableIds, error: error.message }, status: 404 };
		}
	}
	// `/filter` returns results + count; `/query` additionally returns the predictive-disable facet
	// metadata (chip-exclusion counts + slider bounds) so a server-backed UI reaches full parity.
	if (method === 'POST' && (path === '/filter' || path === '/query')) {
		let payload: unknown;

		try {
			payload = JSON.parse(body ?? '');
		} catch {
			return { body: { error: 'Request body must be valid JSON.' }, status: 400 };
		}
		if (!isFilterRequest(payload)) {
			return { body: { error: 'Body must be { dataset: string, config: FilterEngineConfig, limit?: number }.' }, status: 400 };
		}
		const limit = payload.limit ?? DEFAULT_HTTP_LIMIT;

		try {
			const result = path === '/query'
				? await applyConfigQuery(payload.dataset, payload.config, { limit, query: payload.query })
				: await applyConfig(payload.dataset, payload.config, { limit });

			return { body: result, status: 200 };
		} catch (error) {
			if (error instanceof UnknownDatasetError) {
				return { body: { availableIds: error.availableIds, error: error.message }, status: 404 };
			}

			return { body: { error: (error as Error).message }, status: 400 };
		}
	}

	return { body: { error: `No route for ${method} ${path}` }, status: 404 };
}
