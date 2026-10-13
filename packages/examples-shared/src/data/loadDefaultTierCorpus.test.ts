/**
 * Tests for {@link loadDefaultTierCorpus} — the stream-with-bundled-fallback default-tier loader.
 *
 * @remarks
 * Transport-only, driven through an injected `fetchImpl` stub. Covers the streamed path (records +
 * `streamed: true`), and the three fall-back triggers — a rejecting fetch, a non-OK response, and an
 * empty-but-OK stream — each resolving to the bundled corpus with `streamed: false` and a final
 * progress ping.
 */

import { describe, expect, it, vi } from 'vitest';

import { type CorpusPageProgress } from './loadCorpusPaged.js';
import { loadDefaultTierCorpus } from './loadDefaultTierCorpus.js';

interface Row {
	readonly id: number;
}

const corpusOf = (n: number): readonly Row[] => Array.from({ length: n }, (_unused, id) => ({ id }));

/** A one-page fake server returning `corpus` as a single `?tier=default` page. */
function streamingFetch(corpus: readonly Row[]): typeof fetch {
	return vi.fn(async (input: RequestInfo | URL) => {
		const url = new URL(input as string, 'http://localhost');
		const limit = Number(url.searchParams.get('limit'));
		const offset = Number(url.searchParams.get('offset'));

		return Promise.resolve({
			json: async () => Promise.resolve({ items: corpus.slice(offset, offset + limit), total: corpus.length }),
			ok: true,
			status: 200,
		});
	}) as unknown as typeof fetch;
}

const BUNDLED = corpusOf(3);
const loadBundled = async (): Promise<readonly Row[]> => Promise.resolve(BUNDLED);

describe('loadDefaultTierCorpus', () => {
	it('streams the default tier when the endpoint serves it', async () => {
		const result = await loadDefaultTierCorpus<Row>('books', loadBundled, {
			fetchImpl: streamingFetch(corpusOf(2500)),
			pageSize: 1000,
		});

		expect(result.streamed).toBe(true);
		expect(result.records).toHaveLength(2500);
	});

	it('requests the DEFAULT tier (never full), even if a caller tried to override it', async () => {
		const fetchImpl = streamingFetch(corpusOf(5));

		await loadDefaultTierCorpus<Row>('books', loadBundled, { fetchImpl, pageSize: 10 });

		const calls = (fetchImpl as unknown as { mock: { calls: readonly (readonly unknown[])[] }}).mock.calls;
		const url = new URL(String(calls[0]?.[0]), 'http://x');

		expect(url.searchParams.get('tier')).toBe('default');
	});

	it('falls back to the bundled corpus when the fetch rejects (no server)', async () => {
		const progress: CorpusPageProgress[] = [];
		const rejectingFetch = (async () => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch;

		const result = await loadDefaultTierCorpus<Row>('books', loadBundled, {
			fetchImpl: rejectingFetch,
			onProgress: (p) => progress.push(p),
		});

		expect(result.streamed).toBe(false);
		expect(result.records).toBe(BUNDLED);
		expect(progress).toEqual([{ loaded: 3, total: 3 }]);
	});

	it('falls back on a non-OK response (endpoint present but erroring)', async () => {
		const notOk = (async () => Promise.resolve({ json: async () => Promise.resolve({}), ok: false, status: 500 })) as unknown as typeof fetch;

		const result = await loadDefaultTierCorpus<Row>('books', loadBundled, { fetchImpl: notOk });

		expect(result.streamed).toBe(false);
		expect(result.records).toBe(BUNDLED);
	});

	it('falls back when the stream is empty (MSW passthrough / truncated dataset)', async () => {
		const result = await loadDefaultTierCorpus<Row>('books', loadBundled, { fetchImpl: streamingFetch([]) });

		expect(result.streamed).toBe(false);
		expect(result.records).toBe(BUNDLED);
	});
});
