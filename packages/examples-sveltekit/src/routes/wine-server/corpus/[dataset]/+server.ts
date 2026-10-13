/**
 * `GET /wine-server/corpus/:dataset` — ship the wine corpus once.
 *
 * @remarks
 * The wine twin of `GET /books-server/corpus/:dataset`. The browser transport fetches this a single
 * time at boot to hold a resident corpus copy: it turns the server's result INDICES back into records
 * and derives the wine panel's slider baselines, chip vocabularies and origin tree (exactly like the
 * worker tier ships its corpus to the main thread once). This is the data, not the decisions — the
 * server remains the filtering authority. Mirrors the standalone `@filter-enginez/examples-server`'s
 * `GET /corpus/:dataset` response (`{ dataset, records }`) so the shared transport is reusable verbatim.
 *
 * The route is parameterized by `:dataset` (rather than hardcoding `wine`) to stay byte-identical to
 * the books endpoint + the shared transport, which requests `/corpus/${dataset}`.
 *
 * @packageDocumentation
 */

import { error, json, type RequestHandler } from '@sveltejs/kit';
import { loadDatasetCorpus } from '$lib/server/datasetFilterService.js';

/** Return `{ dataset, records }` for a registered dataset, or 404 for an unknown one. */
export const GET: RequestHandler = ({ params }) => {
	const dataset = params.dataset ?? '';

	try {
		return json({ dataset, records: loadDatasetCorpus(dataset) });
	} catch (caught) {
		error(404, caught instanceof Error ? caught.message : `Unknown dataset "${dataset}".`);
	}
};
