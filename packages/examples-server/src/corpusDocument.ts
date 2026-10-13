/**
 * The corpus document — a registered dataset's full record list, as the server-backed browser routes
 * fetch it once from `…/corpus/<dataset>.json`.
 *
 * @remarks
 * One definition of the document's shape and of its URL, shared by every place that produces it: the
 * `GET /corpus/<dataset>.json` route of {@link handleRequest}, the files `write-corpus.ts` writes into
 * an API Worker's static assets, and the SvelteKit app's prerendered corpus routes. All three send
 * `JSON.stringify` of {@link corpusDocument}, so the bytes are the same wherever the browser gets them.
 *
 * **Why the URL ends in `.json`.** Deployed, the corpus is a static file rather than a Worker
 * response. The sites run on the Workers Free plan, which allows 10 ms of CPU per request, and
 * serializing a corpus of several megabytes takes several times that, so a Worker that answered
 * corpus requests was soon stopped for exceeding its CPU limit. As a file, the corpus costs the Worker
 * nothing: the static-assets layer answers before any Worker code runs. The same path is a real
 * file name in the build output and a route in development, where the Node server and SvelteKit's dev
 * server answer it dynamically.
 *
 * Pure and runtime-neutral (no `node:` imports), because the Worker bundle imports it through
 * `requestHandler.ts`.
 *
 * @packageDocumentation
 */

import { getDataset } from './datasets.js';

/** The path every corpus document sits under, relative to the API's root. */
export const CORPUS_PATH_PREFIX = '/corpus/';

/** The extension of a corpus document's path, and of the file it is written to. */
export const CORPUS_FILE_EXTENSION = '.json';

/** The body of a corpus response: which dataset, its label, and every record in corpus order. */
export interface CorpusDocument {
	/** The dataset id, e.g. `books`. */
	readonly dataset: string;
	/** The dataset's human label. */
	readonly label: string;
	/** The full corpus, in the order the engine indexes it, so result indices join against it. */
	readonly records: readonly unknown[];
}

/**
 * Build a dataset's corpus document.
 *
 * @param datasetId - A registered dataset id.
 * @returns The document.
 * @throws `UnknownDatasetError` when `datasetId` is not registered.
 */
export function corpusDocument(datasetId: string): CorpusDocument {
	const dataset = getDataset(datasetId);

	return { dataset: dataset.id, label: dataset.label, records: dataset.sourceData };
}

/**
 * The file name a dataset's corpus document is written to, which is also the last segment of its URL.
 *
 * @param datasetId - A dataset id.
 * @returns `<datasetId>.json`.
 */
export function corpusFileName(datasetId: string): string {
	return `${datasetId}${CORPUS_FILE_EXTENSION}`;
}

/**
 * The API path a dataset's corpus document is served at.
 *
 * @param datasetId - A dataset id.
 * @returns `/corpus/<datasetId>.json`.
 */
export function corpusPath(datasetId: string): string {
	return `${CORPUS_PATH_PREFIX}${corpusFileName(datasetId)}`;
}

/**
 * The dataset id a corpus path names, or `null` for a path that is not a corpus path.
 *
 * @param path - A request path relative to the API's root, query string already stripped.
 * @returns The decoded dataset id, which may still be unregistered; `null` unless the path is
 *   `/corpus/<id>.json` with a non-empty `<id>`.
 */
export function datasetIdFromCorpusPath(path: string): string | null {
	if (!path.startsWith(CORPUS_PATH_PREFIX) || !path.endsWith(CORPUS_FILE_EXTENSION)) {
		return null;
	}
	const encodedId = path.slice(CORPUS_PATH_PREFIX.length, path.length - CORPUS_FILE_EXTENSION.length);

	return encodedId === '' ? null : decodeURIComponent(encodedId);
}
