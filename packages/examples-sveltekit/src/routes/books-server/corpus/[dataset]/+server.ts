/**
 * `GET /books-server/corpus/:dataset` — ship a dataset's full corpus once.
 *
 * @remarks
 * The browser transport fetches this a single time at boot to hold a resident corpus copy: it turns
 * the server's result INDICES back into records and derives the filter panel's slider baselines + chip
 * vocabularies (exactly like the worker tier ships its corpus to the main thread once). This is the
 * data, not the decisions — the server remains the filtering authority. Mirrors the standalone
 * `@filter-enginez/examples-server`'s `GET /corpus/:dataset` response (`{ dataset, records }`) so the
 * shared transport is reusable verbatim.
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
