/**
 * `applyConfigQuery` — the parity endpoint's brain: filter a dataset by a JSON config AND return the
 * predictive-disable facet metadata, so a remote (server-backed) UI reaches the same fidelity as the
 * in-browser apps.
 *
 * @remarks
 * The browser apps call `engine.applyFiltersAndQuery(query)` to get, in one pass, the results plus
 * per-chip exclusion counts and per-slider bounds/histograms (what powers "grey out options that
 * would empty the results"). This does the same server-side. Two wire concerns are handled here:
 * the frontend has no corpus, so the server **derives** the bundle query from the config + its own
 * corpus and returns materialized RECORDS (not indices into a corpus the client lacks); and the
 * engine's bundle uses `TypedArray`s (not JSON), so histograms are converted to plain `number[]`.
 *
 * @packageDocumentation
 */

import {
	createFilterEngine,
	type FilterBundleChipGroupQuery,
	type FilterBundleFieldQuery,
	type FilterBundleQuery,
	type FilterEngineConfig,
} from '@filter-enginez/core';

import { getDataset } from './datasets.js';

/** Rule types that get a slider (and therefore field bounds/histograms). */
const RANGE_RULE_TYPES = new Set(['RangeRule', 'NumericComparisonRule']);
/** Rule types that get chips (and therefore per-candidate exclusion counts). */
const CHIP_RULE_TYPES = new Set(['InSetRule']);
/** Cap on distinct chip candidates derived from the corpus (keeps a facet sane). */
const MAX_CANDIDATES = 60;

/** JSON-safe per-slider metadata. */
export interface QueryFieldMeta {
	readonly bounds: { readonly max: number | null; readonly min: number | null };
	readonly fieldKey: string;
	readonly histogram: { readonly bucketEdges: readonly number[]; readonly counts: readonly number[] };
	readonly ruleId: string;
}

/** JSON-safe per-chip predictive-disable datum. */
export interface QueryChipCandidate {
	readonly projectedCount: number;
	readonly value: string;
	readonly wouldBeEmpty: boolean;
}

/** JSON-safe per-chip-group metadata. */
export interface QueryChipGroup {
	readonly candidates: readonly QueryChipCandidate[];
	readonly ruleId: string;
}

/** The JSON-safe response of {@link applyConfigQuery}. */
export interface QueryResult {
	readonly chipGroups: readonly QueryChipGroup[];
	readonly datasetLabel: string;
	readonly fields: readonly QueryFieldMeta[];
	readonly matched: number;
	/**
	 * Indices into the dataset's corpus (in corpus order) for every matching record — the FULL set,
	 * NOT sliced by `limit`. A server-backed engine with a resident corpus copy joins these against
	 * its own corpus to materialize results, exactly like the worker tier joins transferred indices
	 * against its boot-mirrored source. `results` (below) is the limited, materialized convenience
	 * slice for corpus-less callers (curl, the CLI-shaped clients).
	 */
	readonly resultIndices: readonly number[];
	readonly results: readonly unknown[];
	readonly total: number;
	readonly truncated: boolean;
}

/** A serialized rule entry as it appears in a `FilterEngineConfig`. */
interface SerializedRuleEntry {
	readonly id: string;
	readonly rule: { readonly field: string; readonly type: string };
}

/** Read a record's field as a string (for chip candidates). */
function fieldString(record: unknown, field: string): string | undefined {
	/* v8 ignore next 3 -- defensive: `record` comes from a registered dataset's sourceData, whose entries
	   are always objects, so this is unreachable through the public `applyConfigQuery` surface. The guard
	   stays because the parameter is `unknown`, so the function stays total for any input; the alternative
	   (narrowing the parameter type) would push the same check onto every caller. */
	if (typeof record !== 'object' || record === null) {
		return undefined;
	}
	const value = (record as Record<string, unknown>)[field];

	return typeof value === 'string' ? value : undefined;
}

/** Read a record's field as a finite number (for slider baselines). */
function fieldNumber(record: unknown, field: string): number | undefined {
	/* v8 ignore next 2 -- defensive: unreachable for the same reason as `fieldString` above; dataset
	   records are always objects. See that guard's note for why it is kept rather than deleted. */
	if (typeof record !== 'object' || record === null) {
		return undefined;
	}
	const value = (record as Record<string, unknown>)[field];

	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Derive the predictive-disable bundle query from a config + corpus: a chip group (with every
 * distinct field value as a candidate) per InSet rule, and a slider field (with corpus baseline
 * bounds) per range rule. Only these two families need server-computed facet metadata.
 *
 * @remarks
 * **This is the `curl` path only, and its `bucketCount` is nobody's UI.** A browser client sends its
 * own `query`, which `applyConfigQuery` honors verbatim — so `/books-server` renders exactly the
 * histogram `/books` does, from the panel's shared `buildBooksBundleQuery`. The 24 below is a
 * middle-of-the-road default for someone poking the endpoint by hand, deliberately left alone during
 * The histogram pass after a first pass mistook it for the route's render path.
 */
function deriveBundleQuery(
	config: FilterEngineConfig,
	sourceData: readonly unknown[],
): { chipGroups: FilterBundleChipGroupQuery[]; fields: FilterBundleFieldQuery[] } {
	const chipGroups: FilterBundleChipGroupQuery[] = [];
	const fields: FilterBundleFieldQuery[] = [];

	for (const entry of config.rules as readonly SerializedRuleEntry[]) {
		const { field, type } = entry.rule;

		if (CHIP_RULE_TYPES.has(type)) {
			const distinct = new Set<string>();

			for (const record of sourceData) {
				const value = fieldString(record, field);

				if (value !== undefined) {
					distinct.add(value);
				}
			}
			chipGroups.push({
				candidates: [...distinct].sort((a, b) => a.localeCompare(b)).slice(0, MAX_CANDIDATES),
				field,
				kind: 'inSet',
				ruleId: entry.id,
			});
		} else if (RANGE_RULE_TYPES.has(type)) {
			let min = Number.POSITIVE_INFINITY;
			let max = Number.NEGATIVE_INFINITY;

			for (const record of sourceData) {
				const value = fieldNumber(record, field);

				if (value !== undefined) {
					min = Math.min(min, value);
					max = Math.max(max, value);
				}
			}
			fields.push({
				baselineMax: Number.isFinite(max) ? max : undefined,
				baselineMin: Number.isFinite(min) ? min : undefined,
				bucketCount: 24,
				fieldKey: field,
				ruleId: entry.id,
			});
		}
	}

	return { chipGroups, fields };
}

/** Options for {@link applyConfigQuery}. */
export interface ApplyQueryOptions {
	/** Max result RECORDS to materialize into `results`. `< 0` = all; defaults to 24. Does NOT affect
	 * `resultIndices`, which is always the full set. Pass `0` to skip record materialization entirely
	 * (a corpus-resident client only needs the indices). */
	readonly limit?: number;
	/**
	 * The predictive-disable facet query — per-chip candidates + per-slider fields. When provided, the
	 * server honors it verbatim (so a remote UI controls exactly which facets it needs, including
	 * `inSetOfSets` hierarchies + baseline-aligned histograms). When omitted, the server derives a
	 * sensible default from the config's InSet/Range rules (the `curl`-friendly convenience path).
	 * Pass an empty object `{}` to skip facet computation entirely (the mirror-sync fast path).
	 */
	readonly query?: FilterBundleQuery;
}

const DEFAULT_LIMIT = 24;

/**
 * Filter a dataset by a config and return results + the predictive-disable facet metadata.
 *
 * @throws {@link UnknownDatasetError} when `datasetId` is not registered.
 */
export async function applyConfigQuery(
	datasetId: string,
	config: FilterEngineConfig,
	options: ApplyQueryOptions = {},
): Promise<QueryResult> {
	const dataset = getDataset(datasetId);
	const engine = createFilterEngine({ config, sourceData: dataset.sourceData });

	try {
		// Honor the client's facet query verbatim when supplied; otherwise derive a default from the
		// config (the curl-friendly path). An explicit `{}` skips facet work for the mirror-sync path.
		const query = options.query ?? deriveBundleQuery(config, dataset.sourceData);
		// `applyFiltersAndQuery` honors expression mode natively (its `resultIndices` equal
		// `getResultIndices()` in every mode; facets come back empty while an expression drives the
		// filter, which the client pauses anyway). So its bundle is the single authoritative source for
		// both the result set AND the facet metadata — no separate result read needed.
		const bundle = engine.applyFiltersAndQuery(query);
		const resultIndices = bundle.resultIndices;
		const matched = bundle.resultCount;
		const source = engine.getSourceData();
		const limit = options.limit ?? DEFAULT_LIMIT;
		const recordIndices = limit < 0 ? resultIndices : resultIndices.slice(0, limit);
		const results = Array.from(recordIndices, (index) => source[index]);

		return {
			chipGroups: bundle.chipGroups.map((group) => ({
				candidates: group.candidates.map((candidate) => ({
					projectedCount: candidate.projectedCount,
					value: candidate.value,
					wouldBeEmpty: candidate.wouldBeEmpty,
				})),
				ruleId: group.ruleId,
			})),
			datasetLabel: dataset.label,
			fields: bundle.fields.map((meta) => ({
				bounds: { max: meta.bounds.max, min: meta.bounds.min },
				fieldKey: meta.fieldKey,
				histogram: {
					bucketEdges: Array.from(meta.histogram.bucketEdges),
					counts: Array.from(meta.histogram.counts),
				},
				ruleId: meta.ruleId,
			})),
			matched,
			resultIndices: Array.from(resultIndices),
			results,
			total: dataset.sourceData.length,
			truncated: results.length < matched,
		};
	} finally {
		await engine.destroy();
	}
}
