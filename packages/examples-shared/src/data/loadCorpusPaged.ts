/**
 * `loadCorpusPaged` — stream a dataset corpus into memory over a paginated HTTP endpoint.
 *
 * @remarks
 * The realistic-streaming corpus loader behind the MSW-backed data path. Instead of a single
 * monolithic `fetch` of the whole corpus (or a static `import` that bundles the JSON), this walks
 * the `GET /api/<dataset>?tier=&limit=&offset=` endpoint page by page, accumulating records and reporting progress after each page — so a boot screen can render
 * "Loaded N of M" copy while the load is in flight. The endpoint is served in development by MSW (the
 * `@filter-enginez/mock-data` handlers); `loadDefaultTierCorpus` calls this only once that mock API has
 * announced itself (`./corpusApi.ts`). The loader itself is transport-only and framework-free.
 *
 * The response envelope matches the mock-data handler factory's `PagedResponse<T>`
 * (`{ items, limit, offset, total }`); only the fields this loader reads are typed here so it takes
 * no dependency on mock-data internals.
 *
 * @packageDocumentation
 */

/** Progress emitted after each page settles. */
export interface CorpusPageProgress {
	/** Records accumulated so far (across all pages fetched). */
	readonly loaded: number;
	/** Total records the server reports for this tier (stable after the first page). */
	readonly total: number;
}

/** The subset of the paginated list-response envelope this loader depends on. */
interface PagedListResponse<T> {
	readonly items: readonly T[];
	readonly total: number;
}

/** Options for {@link loadCorpusPaged}. */
export interface LoadCorpusPagedOptions {
	/** Records per request. Default 1000 — large enough to be efficient, small enough to stream. */
	readonly pageSize?: number;
	/** Which tier to request (`?tier=`). Default `'default'`. */
	readonly tier?: 'default' | 'full';
	/** Progress reporter, invoked after each page is appended. */
	readonly onProgress?: (progress: CorpusPageProgress) => void;
	/** Abort signal, forwarded to every underlying request. */
	readonly signal?: AbortSignal;
	/** Endpoint base path. Default `'/api'` (so `dataset='wine'` → `/api/wine`). */
	readonly baseUrl?: string;
	/** Injectable `fetch` (tests pass a stub; production uses the global). Default `globalThis.fetch`. */
	readonly fetchImpl?: typeof fetch;
}

/**
 * Load a full corpus by walking the paginated list endpoint until every record is retrieved.
 *
 * @typeParam T - The record type.
 * @param dataset - The dataset path segment (e.g. `'wine'` → `/api/wine`).
 * @param options - Page size, tier, progress reporter, abort signal, and injectables.
 * @returns All records for the requested tier, in server order.
 * @throws If any page request resolves non-OK (the caller decides how to surface it).
 */
export async function loadCorpusPaged<T>(
	dataset: string,
	options: LoadCorpusPagedOptions = {},
): Promise<readonly T[]> {
	const {
		baseUrl = '/api',
		fetchImpl = globalThis.fetch,
		onProgress,
		pageSize = 1000,
		signal,
		tier = 'default',
	} = options;

	const all: T[] = [];
	let offset = 0;
	// Sentinel: the real total arrives with the first page. Until then, keep the loop alive.
	let total = Number.POSITIVE_INFINITY;

	while (offset < total) {
		const url = `${baseUrl}/${dataset}?tier=${tier}&limit=${String(pageSize)}&offset=${String(offset)}`;
		const response = await fetchImpl(url, signal === undefined ? undefined : { signal });

		if (!response.ok) {
			throw new Error(`loadCorpusPaged(${dataset}): request failed with ${String(response.status)}`);
		}
		const page = (await response.json()) as PagedListResponse<T>;

		total = page.total;
		// Guard against a non-advancing loop: a server that returns an empty page while `offset < total`
		// would otherwise spin forever. Stop rather than hang.
		if (page.items.length === 0) {
			break;
		}
		all.push(...page.items);
		offset += page.items.length;
		onProgress?.({ loaded: all.length, total });
	}

	return all;
}
