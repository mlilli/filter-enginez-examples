/**
 * `POST /wine-server/query` — the SvelteKit vertical's in-process wine filter endpoint.
 *
 * @remarks
 * The wine twin of `POST /books-server/query`: the same in-process isomorphic core
 * ({@link runDatasetQuery}), the same request/response contract as the standalone
 * `@filter-enginez/examples-server`'s `POST /query`, only `dataset` defaults to `wine`. This is the
 * server tier the browser transport (`createHttpFilterEngine<Wine>`, `baseUrl: '/wine-server'`) talks
 * to — no separate `serve:api` process, no proxy. Body `{ config, dataset, limit, query }` → the
 * JSON-safe `QueryResult` (results + full `resultIndices` + predictive-disable facet metadata).
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

/** Filter the wine dataset by the posted config (+ optional facet query) and return the query result. */
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
			dataset: body.dataset ?? 'wine',
			limit: body.limit ?? 0,
			query: body.query,
		});

		return json(result);
	} catch (caught) {
		// `UnknownDatasetError` (or any dataset-resolution failure) → 404 with the message.
		error(404, caught instanceof Error ? caught.message : 'Unknown dataset.');
	}
};
