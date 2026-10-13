/**
 * `@filter-enginez/examples-server` public barrel — the reusable, framework-neutral pieces of the
 * server-side isomorphic demo.
 *
 * @remarks
 * The package's primary shape is still a runnable Node app (the `tsx src/server.ts` HTTP endpoint +
 * the `tsx src/cli.ts` shell). This barrel additionally exposes the *pure* filtering brains so another
 * Node host can reuse them in-process — specifically the SvelteKit vertical, whose `+server.ts`
 * endpoints run `applyConfigQuery` / `getDataset` directly rather than proxying to a separate process.
 * Everything here is Node-safe: the mock-data corpora are pulled through their per-dataset subpaths
 * (no MSW / `localStorage`), so importing this barrel never drags a browser global.
 *
 * @packageDocumentation
 */

export { applyConfig, type ApplyConfigOptions, type ApplyConfigResult } from './applyConfig.js';
export {
	applyConfigQuery,
	type ApplyQueryOptions,
	type QueryChipCandidate,
	type QueryChipGroup,
	type QueryFieldMeta,
	type QueryResult,
} from './applyQuery.js';
export {
	type DatasetDescriptor,
	datasetIds,
	type DatasetSummary,
	getDataset,
	listDatasets,
	UnknownDatasetError,
} from './datasets.js';
export { handleRequest, type HandlerResponse } from './requestHandler.js';
