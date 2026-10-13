/**
 * `loadDefaultTierCorpus` — stream a dataset's default tier over MSW, with a bundled fallback.
 *
 * @remarks
 * The always-on streaming path shared by the books + real-estate boots (and mirrors what
 * `wineEngine`'s `createMainEngine` does inline for wine). It walks the paginated
 * `GET /api/<dataset>` endpoint via {@link loadCorpusPaged} — served by MSW in dev, or by a real
 * backend wherever one is deployed — and reports per-page progress so a boot screen can animate a counter.
 *
 * **Why the fallback.** The streamed endpoint only exists where MSW is running (dev) or a real API is
 * deployed (prod). Everywhere else — a production build with no API, or a test environment without
 * MSW — the fetch 404s or rejects, and we fall back to the dataset's bundled corpus. The fallback
 * is passed as a `() => Promise<…>` so the caller can hand a **dynamic import**
 * (`() => import('@filter-enginez/mock-data/books').then(m => m.books)`); that keeps the corpus OUT of
 * the main-thread bundle on the streamed path (it is only fetched over the wire) and code-splits the
 * fallback into its own chunk, loaded only if streaming is unavailable.
 *
 * @packageDocumentation
 */

import { loadCorpusPaged, type LoadCorpusPagedOptions } from './loadCorpusPaged.js';

/** Result of {@link loadDefaultTierCorpus}: the records plus which path produced them. */
export interface DefaultTierCorpus<T> {
	/** The loaded records. */
	readonly records: readonly T[];
	/** `true` if streamed over `/api/<dataset>`; `false` if the bundled fallback was used. */
	readonly streamed: boolean;
}

/**
 * Load a dataset's default tier by streaming `/api/<dataset>`, falling back to a bundled corpus when
 * the endpoint is unavailable.
 *
 * @typeParam T - The record type.
 * @param dataset - The dataset path segment (e.g. `'books'` → `/api/books`).
 * @param loadBundledFallback - Produces the bundled corpus if streaming fails. Pass a dynamic import
 *   so the fallback code-splits and the corpus never bundles into the streamed path.
 * @param options - Forwarded to {@link loadCorpusPaged} (page size, progress reporter, injectable
 *   `fetch`, abort signal). The `tier` is always `'default'` here.
 * @returns The records and whether they were streamed or bundled.
 */
export async function loadDefaultTierCorpus<T>(
	dataset: string,
	loadBundledFallback: () => Promise<readonly T[]>,
	options: Omit<LoadCorpusPagedOptions, 'tier'> = {},
): Promise<DefaultTierCorpus<T>> {
	try {
		const records = await loadCorpusPaged<T>(dataset, { ...options, tier: 'default' });

		// A non-empty stream is a real hit. An empty one (no server, MSW passthrough → 404 handled as a
		// zero-item body, or a truncated dataset) is treated as unavailable so we fall back rather than
		// boot an empty app.
		if (records.length > 0) {
			return { records, streamed: true };
		}
	} catch {
		// `/api/<dataset>` is unavailable (prod without a backend, or MSW not started here) — fall back
		// to the bundled corpus below.
	}

	const records = await loadBundledFallback();

	options.onProgress?.({ loaded: records.length, total: records.length });

	return { records, streamed: false };
}
