/**
 * The datasets this server-side demo can filter, loaded from `@filter-enginez/mock-data` via its
 * NODE-SAFE per-dataset subpaths.
 *
 * @remarks
 * Importing the mock-data ROOT barrel (or `/handlers`) would drag MSW — and therefore `localStorage`
 * — into the import graph and throw at module-eval in Node. The per-dataset subpaths
 * (`/books`, `/wine`) deliberately omit their handlers, so they are safe here. This is the whole
 * point of the demo: the same corpora + the same `FilterEngineConfig` objects that drive the browser
 * apps are consumed unchanged in a plain Node process.
 *
 * The server registers exactly the datasets its server-backed routes query: books (`/books-server`)
 * and wine (`/wine-server`). Real estate has no server-backed route, so it is not registered here; the
 * apps filter it in the browser.
 *
 * @packageDocumentation
 */

import { type FilterEngineConfig } from '@filter-enginez/core';
import { books, getBooksFilterConfig } from '@filter-enginez/mock-data/books';
import { getWineFilterConfig, wines } from '@filter-enginez/mock-data/wine';

/** A dataset the demo can filter. */
export interface DatasetDescriptor {
	/** The canonical JSON filter-config shipped with the dataset (used when no config is supplied). */
	readonly defaultConfig: FilterEngineConfig;
	/** URL / CLI id, e.g. `books`. */
	readonly id: string;
	/** Human label. */
	readonly label: string;
	/** Plural record noun, e.g. `books`. */
	readonly recordNoun: string;
	/** The corpus to filter (the committed default tier). */
	readonly sourceData: readonly unknown[];
}

/** A lightweight dataset summary (no corpus) for listing endpoints. */
export interface DatasetSummary {
	readonly id: string;
	readonly label: string;
	readonly recordCount: number;
	readonly recordNoun: string;
}

/** Raised when an unknown dataset id is requested. */
export class UnknownDatasetError extends Error {
	constructor(
		public readonly requestedId: string,
		public readonly availableIds: readonly string[],
	) {
		super(`Unknown dataset "${requestedId}". Available: ${availableIds.join(', ')}.`);
		this.name = 'UnknownDatasetError';
	}
}

/** The datasets, built once at module load (Node-safe). */
const DATASETS: readonly DatasetDescriptor[] = [
	{
		defaultConfig: getBooksFilterConfig(),
		id: 'books',
		label: 'Books',
		recordNoun: 'books',
		sourceData: books,
	},
	{
		defaultConfig: getWineFilterConfig(wines),
		id: 'wine',
		label: 'Wine reviews',
		recordNoun: 'bottles',
		sourceData: wines,
	},
];

/** Every dataset id the demo knows about. */
export function datasetIds(): readonly string[] {
	return DATASETS.map((dataset) => dataset.id);
}

/** Look up a dataset by id, throwing {@link UnknownDatasetError} if it is not registered. */
export function getDataset(id: string): DatasetDescriptor {
	const dataset = DATASETS.find((candidate) => candidate.id === id);

	if (dataset === undefined) {
		throw new UnknownDatasetError(id, datasetIds());
	}

	return dataset;
}

/** Summaries of every dataset (for the CLI `--list` and the HTTP `GET /datasets`). */
export function listDatasets(): readonly DatasetSummary[] {
	return DATASETS.map((dataset) => ({
		id: dataset.id,
		label: dataset.label,
		recordCount: dataset.sourceData.length,
		recordNoun: dataset.recordNoun,
	}));
}
