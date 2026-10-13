/**
 * `applyConfig` — the shared brain of the server-side demo: boot the isomorphic engine over a
 * dataset, apply a JSON `FilterEngineConfig`, and report what matched.
 *
 * @remarks
 * This is the whole isomorphic proof in one function — `createFilterEngine({ sourceData, config })`
 * plus `getResultCount()` / `getResults()`, running in a plain Node process with no browser globals,
 * no framework, no rewrite. The CLI and the HTTP endpoint are both thin shells over this.
 *
 * @packageDocumentation
 */

import { createFilterEngine, type FilterEngineConfig } from '@filter-enginez/core';

import { getDataset } from './datasets.js';

/** Options for {@link applyConfig}. */
export interface ApplyConfigOptions {
	/** Max result records to return. `< 0` returns all; defaults to 10. */
	readonly limit?: number;
}

/** The outcome of applying a config to a dataset. */
export interface ApplyConfigResult {
	/** Ids of the rules the config activated. */
	readonly appliedRuleIds: readonly string[];
	/** The dataset's human label. */
	readonly datasetLabel: string;
	/** Number of records passing the filters. */
	readonly matched: number;
	/** The matched records, truncated to the requested limit. */
	readonly results: readonly unknown[];
	/** Total records in the dataset before filtering. */
	readonly total: number;
	/** Whether {@link results} was truncated (matched > returned). */
	readonly truncated: boolean;
}

const DEFAULT_LIMIT = 10;

/**
 * Filter a dataset by a JSON config and summarize the outcome.
 *
 * @param datasetId - Which dataset to filter (`books` / `wine`).
 * @param config - The `FilterEngineConfig` to apply.
 * @param options - Result limit.
 * @returns Totals + the (limited) matched records.
 * @throws {@link UnknownDatasetError} when `datasetId` is not registered.
 */
export async function applyConfig(
	datasetId: string,
	config: FilterEngineConfig,
	options: ApplyConfigOptions = {},
): Promise<ApplyConfigResult> {
	const dataset = getDataset(datasetId);
	const engine = createFilterEngine({ config, sourceData: dataset.sourceData });

	try {
		const matched = engine.getResultCount();
		const limit = options.limit ?? DEFAULT_LIMIT;
		const allResults = engine.getResults();
		const results = limit < 0 ? allResults : allResults.slice(0, limit);

		return {
			appliedRuleIds: config.rules.map((entry) => entry.id),
			datasetLabel: dataset.label,
			matched,
			results,
			total: dataset.sourceData.length,
			truncated: results.length < matched,
		};
	} finally {
		await engine.destroy();
	}
}
