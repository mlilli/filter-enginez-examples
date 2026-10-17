/**
 * `loadDefaultTierCorpus` — load a dataset's default tier: streamed from the development mock API when
 * one is running, imported from the bundle otherwise.
 *
 * @remarks
 * The corpus path shared by the books + real-estate boots. Where the mock API is running — every app's
 * development build, which starts it before its first render — this walks the paginated
 * `GET /api/<dataset>` endpoint via {@link loadCorpusPaged} and reports per-page progress, so a boot
 * screen can animate a counter.
 *
 * **Everywhere else it makes no request.** No deployed site serves `/api/<dataset>` (see
 * `./corpusApi.ts` for what each one answers instead), so a production boot goes straight to the
 * dataset's bundled corpus rather than spending a round trip on a request that cannot succeed. Whether
 * to stream is {@link hasCorpusApi}, which the mock starter sets; a caller can override it.
 *
 * **Why the fallback is a function.** It is passed as a `() => Promise<…>` so the caller can hand a
 * **dynamic import** (`() => import('@filter-enginez/mock-data/books').then(m => m.books)`); that keeps
 * the corpus OUT of the main-thread bundle on the streamed path (it is only fetched over the wire) and
 * code-splits it into its own chunk, loaded only when it is the source. The same fallback covers a
 * stream that fails or comes back empty in development.
 *
 * @packageDocumentation
 */

import { hasCorpusApi } from './corpusApi.js';
import { loadCorpusPaged, type LoadCorpusPagedOptions } from './loadCorpusPaged.js';

/** Result of {@link loadDefaultTierCorpus}: the records plus which path produced them. */
export interface DefaultTierCorpus<T> {
	/** The loaded records. */
	readonly records: readonly T[];
	/** `true` if streamed over `/api/<dataset>`; `false` if the bundled fallback was used. */
	readonly streamed: boolean;
}

/** Options for {@link loadDefaultTierCorpus}: {@link loadCorpusPaged}'s, minus the fixed tier. */
export interface LoadDefaultTierCorpusOptions extends Omit<LoadCorpusPagedOptions, 'tier'> {
	/**
	 * Whether to try `/api/<dataset>` before the bundled corpus. Default {@link hasCorpusApi} — `true`
	 * only once the development mock API has announced itself.
	 */
	readonly shouldStreamFromApi?: boolean;
}

/**
 * Load a dataset's default tier: stream `/api/<dataset>` where the mock API serves it, and use the
 * bundled corpus everywhere else or when the stream fails.
 *
 * @typeParam T - The record type.
 * @param dataset - The dataset path segment (e.g. `'books'` → `/api/books`).
 * @param loadBundledFallback - Produces the bundled corpus when there is no stream to read, or it
 *   fails. Pass a dynamic import so the corpus code-splits into a chunk of its own.
 * @param options - Whether to stream (default {@link hasCorpusApi}), plus what is forwarded to
 *   {@link loadCorpusPaged} (page size, progress reporter, injectable `fetch`, abort signal). The
 *   `tier` is always `'default'` here.
 * @returns The records and whether they were streamed or bundled.
 */
export async function loadDefaultTierCorpus<T>(
	dataset: string,
	loadBundledFallback: () => Promise<readonly T[]>,
	options: LoadDefaultTierCorpusOptions = {},
): Promise<DefaultTierCorpus<T>> {
	const { shouldStreamFromApi = hasCorpusApi(), ...pagedOptions } = options;

	if (shouldStreamFromApi) {
		try {
			const records = await loadCorpusPaged<T>(dataset, { ...pagedOptions, tier: 'default' });

			// A non-empty stream is a real hit. An empty one (an MSW passthrough answered as a zero-item
			// body, or a truncated dataset) is treated as unavailable so we fall back rather than boot an
			// empty app.
			if (records.length > 0) {
				return { records, streamed: true };
			}
		} catch {
			// The mock API did not answer (its service worker lost control of the page, or the request
			// failed) — fall back to the bundled corpus below.
		}
	}

	const records = await loadBundledFallback();

	options.onProgress?.({ loaded: records.length, total: records.length });

	return { records, streamed: false };
}
