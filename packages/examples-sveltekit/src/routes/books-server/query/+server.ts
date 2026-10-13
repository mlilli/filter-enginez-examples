/**
 * `POST /books-server/query` — the SvelteKit vertical's in-process filter endpoint.
 *
 * @remarks
 * This is the server tier the browser transport (`createHttpFilterEngine`, `baseUrl: '/books-server'`)
 * talks to. It runs the isomorphic Filter EngineZ core **in the SvelteKit server itself** via
 * {@link runDatasetQuery} — the whole point of Approach A: no separate `serve:api` process, no proxy.
 * The request/response contract mirrors the standalone `@filter-enginez/examples-server`'s `POST
 * /query` (so the shared transport is byte-for-byte reusable): body `{ config, dataset, limit, query }`
 * → the JSON-safe `QueryResult` (results + full `resultIndices` + predictive-disable facet metadata).
 *
 * @packageDocumentation
 */

import type { FilterBundleQuery, FilterEngineConfig } from '@filter-enginez/core';

import { error, json, type RequestHandler } from '@sveltejs/kit';
import { runDatasetQuery } from '$lib/server/datasetFilterService.js';

/** The POST body the browser transport sends (mirrors examples-server's `isFilterRequest`). */
interface QueryRequestBody {
	readonly config?: FilterEngineConfig;
	readonly dataset?: string;
	readonly limit?: number;
	readonly query?: FilterBundleQuery;
}

/** Filter the dataset by the posted config (+ optional facet query) and return the query result. */
export const POST: RequestHandler = async ({ request }) => {
	let body: QueryRequestBody;

	try {
		body = (await request.json()) as QueryRequestBody;
	} catch {
		error(400, 'Request body must be JSON.');
	}
	if (body.config === undefined || !Array.isArray(body.config.rules)) {
		error(400, 'Request body must include a `config` with a `rules` array.');
	}

	try {
		const result = await runDatasetQuery({
			config: body.config,
			dataset: body.dataset ?? 'books',
			limit: body.limit ?? 0,
			query: body.query,
		});

		return json(result);
	} catch (caught) {
		// `UnknownDatasetError` (or any dataset-resolution failure) → 404 with the message.
		error(404, caught instanceof Error ? caught.message : 'Unknown dataset.');
	}
};
