/**
 * Tests for the wine worker's three-tier corpus resolution.
 *
 * @remarks
 * This logic lives outside `wine.worker.ts` so it is testable: that file calls
 * `exposeFilterEngineWorker` at module load, so importing it needs a real worker `self`.
 *
 * What is being protected: the chain falls back by design, so a broken NDJSON tier serves the 10k
 * bundled tier and looks completely healthy — while every performance claim the demo exists to
 * demonstrate becomes untrue.
 *
 * **The fallback is not silent.** It emits one `console.warn` naming both remedies, because a missing
 * corpus symlink otherwise looks like an engine problem rather than a setup one. The UI still renders
 * fine and nothing errors, so the tests below are the only thing that can see a BROKEN tier; the
 * warning only covers an ABSENT one.
 *
 * `fetch` is stubbed rather than mocked at the module boundary, so the real stream-reading loop runs
 * against real `ReadableStream`s — including chunk boundaries that split a record in half, which is
 * the reason the buffering code exists.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { afterEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import {
	describeWineCorpusTier,
	EXPECTED_FULL_CORPUS_SIZE,
	loadWineCorpus,
	PROGRESS_REPORT_EVERY,
	tryLoadJsonFullCorpus,
	tryStreamNdjson,
	type WineCorpusSource,
} from './wineCorpusLoader.js';

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
		// The entire reason the buffer exists. A 130k-line file arrives in network-sized chunks that
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
		// Documented intent: one bad row must not cost the user the other 129,906.
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
		// Not `EXPECTED_FULL_CORPUS_SIZE`. The boot caption enters its "constructing filter index" state
		// on `loaded >= total`, so a final report of `(1, 129_907)` would leave the screen claiming a load
		// still in progress forever — the frozen-count reading the third state exists to prevent. The
		// constant equals the corpus on disk, so the estimate is right by coincidence rather than by
		// construction; a regenerated corpus of a different size would take the state away in all six
		// verticals with nothing going red.
		const onProgress = vi.fn();

		stubFetch({ '/data-real-full.ndjson': () => ndjsonResponse(['{"id":1}\n']) });
		await tryStreamNdjson(onProgress);

		expect(onProgress).toHaveBeenLastCalledWith(1, 1, 'full-corpus-ndjson');
	});

	it('reports intermediate progress every PROGRESS_REPORT_EVERY records', async () => {
		// Drives the loader's "Loaded N of ~130k" caption. If this never fired, the animation would sit
		// at zero for the whole parse and look hung.
		const onProgress = vi.fn();
		const body = Array.from({ length: PROGRESS_REPORT_EVERY }, (_unused, index) => `{"id":${index}}`).join('\n');

		stubFetch({ '/data-real-full.ndjson': () => ndjsonResponse([`${body}\n`]) });
		await tryStreamNdjson(onProgress);

		expect(onProgress).toHaveBeenCalledWith(PROGRESS_REPORT_EVERY, EXPECTED_FULL_CORPUS_SIZE, 'full-corpus-ndjson');
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
		expect(onProgress).toHaveBeenCalledWith(2, 2, 'full-corpus-json');
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

describe('loadWineCorpus', () => {
	const fallback = [wine(90), wine(91)];

	/**
	 * Silence the default-tier warning by default.
	 *
	 * @remarks
	 * Spied rather than left to print: the fallback is the expected outcome in six of the tests
	 * below, so an unsilenced warn buries the suite's real output under repeated paragraphs. The
	 * test that owns the behavior re-reads the spy rather than turning it off.
	 *
	 * @returns The spy, so a test can assert on it.
	 */
	const spyOnFallbackWarning = (): MockInstance<(...args: readonly unknown[]) => void> =>
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);

	it('warns, with both remedies, when it falls back to the bundled tier', async () => {
		// Without the warning, a missing corpus symlink makes both fetches 404 and the tier drop below
		// WORKER_THRESHOLD with nothing anywhere saying so. The remedies are asserted because "corpus
		// unavailable" alone is not actionable.
		const warn = spyOnFallbackWarning();

		stubFetch({});
		await loadWineCorpus(fallback);

		expect(warn).toHaveBeenCalledTimes(1);

		const [message] = warn.mock.calls[0] ?? [];

		expect(String(message)).toContain('regen:wine:real --accept-data-license');
		expect(String(message)).toContain('pnpm link:wine-corpus');
		expect(String(message)).toContain('WORKER_THRESHOLD');
	});

	it('stays quiet when a full-corpus tier lands', async () => {
		const warn = spyOnFallbackWarning();

		stubFetch({ '/data-real-full.ndjson': () => ndjsonResponse(['{"id":1}\n']) });
		await loadWineCorpus(fallback);

		expect(warn).not.toHaveBeenCalled();
	});

	it('prefers the ndjson tier when it lands', async () => {
		stubFetch({ '/data-real-full.ndjson': () => ndjsonResponse(['{"id":1}\n']) });

		await expect(loadWineCorpus(fallback)).resolves.toEqual({ source: 'full-corpus-ndjson', wines: [wine(1)]});
	});

	it('falls through to the json tier when ndjson is unavailable', async () => {
		stubFetch({ '/data-real-full.json': () => ({ ok: true, text: async () => Promise.resolve('[{"id":7}]') }) });

		await expect(loadWineCorpus(fallback)).resolves.toEqual({ source: 'full-corpus-json', wines: [wine(7)]});
	});

	it('falls back to the bundled tier when neither full corpus is available', async () => {
		spyOnFallbackWarning();
		stubFetch({});

		await expect(loadWineCorpus(fallback)).resolves.toEqual({ source: 'default-tier', wines: fallback });
	});

	it.each([
		['ndjson', { '/data-real-full.ndjson': (): unknown => ndjsonResponse([]) }],
		['json', { '/data-real-full.json': (): unknown => ({ ok: true, text: async () => Promise.resolve('[]') }) }],
	])('treats an EMPTY %s corpus as unavailable rather than as success', async (_tier, routes) => {
		// The case worth the most here. A truncated or half-written regen leaves a valid-but-empty
		// file; accepting it would boot the app showing zero wines instead of falling back to the 10k
		// tier — and "zero results" looks like a filter bug, not a data-loading bug, so it would be
		// chased in entirely the wrong place.
		spyOnFallbackWarning();
		stubFetch(routes);

		await expect(loadWineCorpus(fallback)).resolves.toMatchObject({ source: 'default-tier' });
	});

	it('reports the default tier through onProgress so the loader can finish', async () => {
		// Without this the caption would stall at its last real value and never reach 100%.
		const onProgress = vi.fn();

		spyOnFallbackWarning();
		stubFetch({});
		await loadWineCorpus(fallback, onProgress);

		expect(onProgress).toHaveBeenCalledWith(fallback.length, fallback.length, 'default-tier' satisfies WineCorpusSource);
	});
});

describe('describeWineCorpusTier', () => {
	// Every wine footer renders this string (the two React apps through `describeBootedWineCorpusTier`),
	// and the shared e2e wine flow (`tests/e2e/wineFlow.ts`) asserts on its exact wording — a check that
	// FAILS when the corpus is missing rather than passing quietly over the wrong tier. That makes the
	// literals a contract between six apps and the e2e suite, not cosmetic copy, so they are pinned
	// here rather than left to whoever edits the function next.
	// Typed on `it.each` rather than with `satisfies` on each entry: `satisfies` checks the literal
	// and still widens it to `string` for the callback's parameter, so the source argument would stop
	// being a `WineCorpusSource` and `tsc` would reject the call.
	it.each<[WineCorpusSource, string]>([
		['full-corpus-ndjson', 'full corpus'],
		['full-corpus-json', 'full corpus'],
	])('describes %s as %s', (source, expected) => {
		expect(describeWineCorpusTier(source)).toBe(expected);
	});

	it('describes the bundled fallback as `bundled 10k tier`', () => {
		// The one string that must never appear in a healthy run. It is the visible end of the
		// silent-fallback chain — a missing symlink, a dev server that will not serve one, an HTML
		// error page parsed as records all land here, and a working app over a smaller corpus looks
		// exactly like a working app.
		expect(describeWineCorpusTier('default-tier')).toBe('bundled 10k tier');
	});

	it('distinguishes the two full-corpus tiers from the fallback', () => {
		// Guards the shape, not just the values: a rewrite that returned one constant would satisfy
		// each case above only if it happened to pick that case's string, but this fails outright.
		expect(describeWineCorpusTier('full-corpus-ndjson')).not.toBe(describeWineCorpusTier('default-tier'));
	});
});
