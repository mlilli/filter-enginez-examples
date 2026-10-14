/**
 * Tests for the wine worker's corpus resolution.
 *
 * @remarks
 * This logic lives outside `wine.worker.ts` so it is testable: that file calls
 * `exposeFilterEngineWorker` at module load, so importing it needs a real worker `self`.
 *
 * What is being protected: the chain falls through by design — a missing real corpus costs one 404 and
 * the synthetic tier takes over — so a BROKEN real-corpus source looks exactly like an absent one. The
 * tests below are the only thing that can tell the two apart.
 *
 * `fetch` is stubbed rather than mocked at the module boundary, so the real stream-reading loop runs
 * against real `ReadableStream`s — including chunk boundaries that split a record in half, which is
 * the reason the buffering code exists.
 */

import {
	DEFAULT_TIER_SIZE,
	FULL_WINE_TIER_SIZE,
	generateWineRange,
	type Wine,
} from '@filter-enginez/mock-data/wine/generator';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	EXPECTED_REAL_CORPUS_SIZE,
	generateSyntheticWines,
	loadWineCorpus,
	PROGRESS_REPORT_EVERY,
	SYNTHETIC_CHUNK_SIZE,
	tryLoadJsonFullCorpus,
	tryStreamNdjson,
} from './wineCorpusLoader.js';
import { describeWineCorpusTier, type WineCorpusSource } from './wineCorpusTier.js';

/**
 * A stand-in wine record.
 *
 * @remarks
 * Only identity matters to the loader — it never reads a field, it just parses and counts. The cast
 * keeps the 18 unused `Wine` properties out of every fixture in this file.
 *
 * @param id - Distinguishes records within a test.
 * @returns An object usable wherever a `Wine` is expected.
 */
function wine(id: number): Wine {
	return { id } as unknown as Wine;
}

/**
 * Build a `Response`-alike whose body streams the supplied text chunks in order.
 *
 * @param chunks - Text pieces, delivered as separate stream reads.
 * @returns An object shaped like the parts of `Response` the loader touches.
 */
function ndjsonResponse(chunks: readonly string[]): unknown {
	const encoder = new TextEncoder();

	return {
		body: new ReadableStream<Uint8Array>({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(encoder.encode(chunk));
				}
				controller.close();
			},
		}),
		ok: true,
	};
}

/**
 * Stub `globalThis.fetch` with a per-URL responder.
 *
 * @param routes - Maps a URL to the value its fetch should resolve (or reject) with.
 */
function stubFetch(routes: Record<string, (() => unknown) | undefined>): void {
	vi.stubGlobal('fetch', async (url: string) => {
		const responder = routes[url];

		if (responder === undefined) {
			return Promise.resolve({ ok: false });
		}

		return Promise.resolve(responder());
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
});

describe('tryStreamNdjson', () => {
	it('parses newline-delimited records', async () => {
		stubFetch({ '/data-real-full.ndjson': () => ndjsonResponse(['{"id":1}\n{"id":2}\n']) });

		expect(await tryStreamNdjson()).toEqual([wine(1), wine(2)]);
	});

	it('reassembles a record split across chunk boundaries', async () => {
		// The entire reason the buffer exists. A 130,000-line file arrives in network-sized chunks that
		// have no idea where records end; dropping the partial tail would silently lose a record at
		// every chunk boundary — thousands of them, with no error anywhere.
		stubFetch({ '/data-real-full.ndjson': () => ndjsonResponse(['{"id":1}\n{"i', 'd":2}\n{"id":3}\n']) });

		expect(await tryStreamNdjson()).toEqual([wine(1), wine(2), wine(3)]);
	});

	it('flushes a trailing record with no final newline', async () => {
		// The last line of a file usually has no trailing \n, so without the flush the corpus would be
		// short by exactly one record — small enough to never notice.
		stubFetch({ '/data-real-full.ndjson': () => ndjsonResponse(['{"id":1}\n{"id":2}']) });

		expect(await tryStreamNdjson()).toEqual([wine(1), wine(2)]);
	});

	it('skips a malformed line and keeps the rest', async () => {
		// Documented intent: one bad row must not cost the user the rest.
		stubFetch({ '/data-real-full.ndjson': () => ndjsonResponse(['{"id":1}\nNOT JSON\n{"id":3}\n']) });

		expect(await tryStreamNdjson()).toEqual([wine(1), wine(3)]);
	});

	it('skips a malformed trailing line without failing the whole load', async () => {
		stubFetch({ '/data-real-full.ndjson': () => ndjsonResponse(['{"id":1}\n{"id":']) });

		expect(await tryStreamNdjson()).toEqual([wine(1)]);
	});

	it('ignores blank lines', async () => {
		stubFetch({ '/data-real-full.ndjson': () => ndjsonResponse(['{"id":1}\n\n{"id":2}\n']) });

		expect(await tryStreamNdjson()).toEqual([wine(1), wine(2)]);
	});

	it('reports the REAL count as the total once the stream is done, not the estimate', async () => {
		// Not `EXPECTED_REAL_CORPUS_SIZE`. The boot caption enters its "constructing filter index" state
		// on `loaded >= total`, so a final report of `(1, 129_907)` would leave the screen claiming a load
		// still in progress forever — the frozen-count reading the third state exists to prevent. And the
		// final total is a count, so it is no longer flagged as an estimate.
		const onProgress = vi.fn();

		stubFetch({ '/data-real-full.ndjson': () => ndjsonResponse(['{"id":1}\n']) });
		await tryStreamNdjson(onProgress);

		expect(onProgress).toHaveBeenLastCalledWith(1, 1, 'full-corpus-ndjson', false);
	});

	it('reports intermediate progress every PROGRESS_REPORT_EVERY records', async () => {
		// Drives the loader's "Loaded N of ~129,907" caption. If this never fired, the animation would
		// sit at zero for the whole parse and look hung. The intermediate totals are estimates, and say so.
		const onProgress = vi.fn();
		const body = Array.from({ length: PROGRESS_REPORT_EVERY }, (_unused, index) => `{"id":${index}}`).join('\n');

		stubFetch({ '/data-real-full.ndjson': () => ndjsonResponse([`${body}\n`]) });
		await tryStreamNdjson(onProgress);

		expect(onProgress).toHaveBeenCalledWith(PROGRESS_REPORT_EVERY, EXPECTED_REAL_CORPUS_SIZE, 'full-corpus-ndjson', true);
	});

	it.each([
		['the response is not ok', (): unknown => ({ body: null, ok: false })],
		['the body is null', (): unknown => ({ body: null, ok: true })],
		['fetch rejects', (): unknown => {
			throw new Error('network down');
		}],
	])('returns null when %s', async (_label, responder) => {
		stubFetch({ '/data-real-full.ndjson': responder });

		expect(await tryStreamNdjson()).toBeNull();
	});
});

describe('tryLoadJsonFullCorpus', () => {
	it('parses the monolithic corpus and reports one completion update', async () => {
		const onProgress = vi.fn();

		stubFetch({ '/data-real-full.json': () => ({ ok: true, text: async () => Promise.resolve('[{"id":1},{"id":2}]') }) });

		expect(await tryLoadJsonFullCorpus(onProgress)).toEqual([wine(1), wine(2)]);
		expect(onProgress).toHaveBeenCalledWith(2, 2, 'full-corpus-json', false);
	});

	it.each([
		['the response is not ok', (): unknown => ({ ok: false })],
		['the payload is not valid JSON', (): unknown => ({ ok: true, text: async () => Promise.resolve('{oops') })],
		['fetch rejects', (): unknown => {
			throw new Error('network down');
		}],
	])('returns null when %s', async (_label, responder) => {
		stubFetch({ '/data-real-full.json': responder });

		expect(await tryLoadJsonFullCorpus()).toBeNull();
	});
});

/**
 * The synthetic full tier, generated once for the whole file.
 *
 * @remarks
 * 150,000 records take a second or two to generate. Every test that needs the full tier awaits this
 * one promise rather than paying that again; the loader never mutates what it returns.
 */
let fullTierPromise: Promise<{ readonly source: WineCorpusSource; readonly wines: readonly Wine[] }> | null = null;

/**
 * Load the full tier with every real-corpus fetch failing, once.
 *
 * @returns The memoized result.
 */
async function loadSyntheticFullTier(): Promise<{ readonly source: WineCorpusSource; readonly wines: readonly Wine[] }> {
	stubFetch({});
	fullTierPromise ??= loadWineCorpus('full');

	return fullTierPromise;
}

describe('generateSyntheticWines', () => {
	it('reports after every chunk, with the exact total and no estimate flag', () => {
		// "Loaded N of 150,000" on the boot screen: an exact total, so no tilde.
		const onProgress = vi.fn();
		const count = SYNTHETIC_CHUNK_SIZE * 2 + 7;

		generateSyntheticWines(count, 'synthetic-full-tier', onProgress);

		expect(onProgress.mock.calls).toEqual([
			[SYNTHETIC_CHUNK_SIZE, count, 'synthetic-full-tier', false],
			[SYNTHETIC_CHUNK_SIZE * 2, count, 'synthetic-full-tier', false],
			[count, count, 'synthetic-full-tier', false],
		]);
	});

	it('yields exactly the records of a single-call generation, stamped with the tier', () => {
		// Chunking must not change a single record: the default tier is a prefix of the full tier, and
		// the six apps must agree with every other consumer of the same seed.
		const count = SYNTHETIC_CHUNK_SIZE + 3;

		expect(generateSyntheticWines(count, 'synthetic-full-tier')).toEqual(generateWineRange(0, count, undefined, 'full'));
		expect(generateSyntheticWines(count, 'low-memory-tier')).toEqual(generateWineRange(0, count, undefined, 'default'));
	});

	it('reports nothing for an empty request', () => {
		const onProgress = vi.fn();

		expect(generateSyntheticWines(0, 'synthetic-full-tier', onProgress)).toEqual([]);
		expect(onProgress).not.toHaveBeenCalled();
	});
});

describe('loadWineCorpus', () => {
	it('prefers the ndjson real corpus when it lands', async () => {
		stubFetch({ '/data-real-full.ndjson': () => ndjsonResponse(['{"id":1}\n']) });

		await expect(loadWineCorpus('full')).resolves.toEqual({ source: 'full-corpus-ndjson', wines: [wine(1)]});
	});

	it('falls through to the json real corpus when ndjson is unavailable', async () => {
		stubFetch({ '/data-real-full.json': () => ({ ok: true, text: async () => Promise.resolve('[{"id":7}]') }) });

		await expect(loadWineCorpus('full')).resolves.toEqual({ source: 'full-corpus-json', wines: [wine(7)]});
	});

	it('generates the 150,000-wine synthetic tier when no real corpus is available', async () => {
		// The deployed state, and a fresh clone's. A regression to any smaller fallback would serve a
		// different corpus in some apps than in others, and `/compare` would show different counts.
		const { source, wines } = await loadSyntheticFullTier();

		expect(source).toBe('synthetic-full-tier');
		expect(wines).toHaveLength(FULL_WINE_TIER_SIZE);
		expect(wines[0]).toEqual(generateWineRange(0, 1, undefined, 'full')[0]);
		expect(wines.at(-1)).toEqual(generateWineRange(FULL_WINE_TIER_SIZE - 1, FULL_WINE_TIER_SIZE, undefined, 'full')[0]);
	});

	it('treats an EMPTY real corpus as unavailable rather than as success', async () => {
		// A truncated or half-written import leaves a valid-but-empty file; accepting it would boot the
		// app showing zero wines — and "zero results" looks like a filter bug, not a data-loading bug.
		const onProgress = vi.fn();

		stubFetch({
			'/data-real-full.json': (): unknown => ({ ok: true, text: async () => Promise.resolve('[]') }),
			'/data-real-full.ndjson': (): unknown => ndjsonResponse([]),
		});
		const result = await loadWineCorpus('full', onProgress);

		expect(result.source).toBe('synthetic-full-tier');
		expect(onProgress).toHaveBeenLastCalledWith(FULL_WINE_TIER_SIZE, FULL_WINE_TIER_SIZE, 'synthetic-full-tier', false);
	});

	it('generates the default tier on a low-memory device, without fetching the real corpus', async () => {
		const fetchSpy = vi.fn();
		const onProgress = vi.fn();

		vi.stubGlobal('fetch', fetchSpy);
		const { source, wines } = await loadWineCorpus('low-memory', onProgress);

		expect(source).toBe('low-memory-tier');
		expect(wines).toEqual(generateWineRange(0, DEFAULT_TIER_SIZE, undefined, 'default'));
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(onProgress).toHaveBeenLastCalledWith(DEFAULT_TIER_SIZE, DEFAULT_TIER_SIZE, 'low-memory-tier', false);
	});
});

describe('describeWineCorpusTier', () => {
	// Every wine footer renders this string (the two React apps through `describeBootedWineCorpusTier`),
	// and the shared e2e wine flow (`tests/e2e/wineFlow.ts`) asserts `full corpus` positively. That
	// makes the literals a contract between six apps and the e2e suite, not cosmetic copy.
	it.each<[WineCorpusSource, string]>([
		['synthetic-full-tier', 'full corpus · synthetic'],
		['full-corpus-ndjson', 'full corpus · local real reviews'],
		['full-corpus-json', 'full corpus · local real reviews'],
		['default-tier', '10k tier · synthetic'],
		['low-memory-tier', '10k tier · synthetic · low-memory device'],
	])('describes %s as %s', (source, expected) => {
		expect(describeWineCorpusTier(source)).toBe(expected);
	});

	it('says `full corpus` for exactly the 150,000-wine and real tiers', () => {
		// The e2e assertion's premise: the phrase appears on a full boot and never on a 10k one.
		const sources: readonly WineCorpusSource[] = ['default-tier', 'full-corpus-json', 'full-corpus-ndjson', 'low-memory-tier', 'synthetic-full-tier'];

		expect(sources.filter((source) => describeWineCorpusTier(source).includes('full corpus'))).toEqual([
			'full-corpus-json',
			'full-corpus-ndjson',
			'synthetic-full-tier',
		]);
	});
});
