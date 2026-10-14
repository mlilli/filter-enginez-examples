/**
 * `wineCorpusLoader` — the wine worker's corpus resolution, extracted so it can be tested.
 *
 * @remarks
 * **Why this is a separate module.** `wine.worker.ts` calls `exposeFilterEngineWorker` at the top
 * level, so importing it registers a Comlink endpoint and needs a real worker `self`. That makes the
 * whole file untestable by import — the same shape as `examples-server`'s `cli.ts` / `server.ts`,
 * which are excluded from coverage as self-executing entry shells.
 *
 * Those shells are excluded because their substance already lives in extracted modules
 * (`applyConfig`, `cliArgs`, `format`). This file restores that same property here: the worker keeps
 * only its registration call, and the logic that actually decides something moves where it can be
 * exercised.
 *
 * ## The chain
 *
 * On the full tier, three sources are tried in order, and the first that yields records wins:
 *
 *   1. **`/data-real-full.ndjson`** — the local real review corpus, streamed line by line. It exists
 *      only on a development machine where `pnpm link:wine-corpus` has run; it is never committed,
 *      packaged or deployed.
 *   2. **`/data-real-full.json`** — the same corpus as one JSON array, for a machine that has only
 *      that export.
 *   3. **The synthetic full tier** — {@link FULL_WINE_TIER_SIZE} wines from the seeded generator,
 *      built in chunks inside the worker so the boot screen can count them in. This is what every
 *      deployed page runs, and what a fresh clone runs.
 *
 * The real corpus is tried first so a developer who has linked it sees it, and every failure on the
 * way down returns `null` rather than throwing, so a missing file costs one 404 and nothing else.
 *
 * On the low-memory tier (see `wineMemoryTier.ts`) the chain is skipped entirely: the worker
 * generates the first {@link DEFAULT_TIER_SIZE} wines of the same stream, which are exactly the
 * default tier.
 *
 * Kept free of `self`, Comlink and the engine on purpose, so the tests need only a `fetch` stub. The
 * source names and their footer labels live in `wineCorpusTier.ts`, apart from this module, because
 * the main thread needs them and must not bundle the generator this module imports.
 *
 * @packageDocumentation
 */

import {
	DEFAULT_TIER_SIZE,
	FULL_WINE_TIER_SIZE,
	generateWineRange,
	type Wine,
} from '@filter-enginez/mock-data/wine/generator';

import { type WineCorpusSource, type WineWorkerTier } from './wineCorpusTier.js';

/**
 * The local real review corpus's known size (129,907 valid rows).
 *
 * @remarks
 * Used only as the ESTIMATED total in the intermediate progress reports while that corpus streams,
 * because a stream cannot know its own length until it ends. The final report carries the real count.
 */
export const EXPECTED_REAL_CORPUS_SIZE = 129_907;

/**
 * Report progress every this-many records parsed from the real corpus. Sized so the main thread
 * receives roughly 15 updates over the parse — smooth enough to animate a counter without flooding
 * the channel.
 */
export const PROGRESS_REPORT_EVERY = 8_000;

/**
 * Records generated per chunk of the synthetic tier, with one progress report after each.
 *
 * @remarks
 * 150,000 / 5,000 is 30 reports over a generation of roughly one to two seconds, the same cadence as
 * the real-corpus stream. The chunks exist for the count on the boot screen, not for responsiveness:
 * the generation runs in the worker, so the page stays interactive whatever the chunk size.
 */
export const SYNTHETIC_CHUNK_SIZE = 5_000;

/**
 * Shape of the callbacks the worker factory expects from the main thread, delivered via
 * `wrapInWorker`'s `factoryCallbacks` field. Each value arrives as a Comlink remote function — the
 * worker invokes them as if local; Comlink routes the call back via postMessage.
 */
export interface WineWorkerCallbacks {
	/**
	 * Report load progress.
	 *
	 * @param loaded - Records loaded or generated so far.
	 * @param total - The total. Exact, except while the real corpus streams (see `isTotalEstimated`).
	 * @param source - Which source is producing the records.
	 * @param isTotalEstimated - `true` only for the intermediate reports of the real-corpus stream,
	 *   whose total is {@link EXPECTED_REAL_CORPUS_SIZE} until the stream ends.
	 */
	readonly onProgress?: (loaded: number, total: number, source: WineCorpusSource, isTotalEstimated: boolean) => void;
}

/** A progress reporter, once narrowed out of the callbacks bag. */
type ProgressReporter = WineWorkerCallbacks['onProgress'];

/**
 * Stream the NDJSON real corpus from `/data-real-full.ndjson`.
 *
 * @remarks
 * Returns `null` on any failure — 404, network error, a body that cannot be read — so the caller can
 * fall through to the next source. Malformed individual LINES are skipped rather than aborting the
 * parse: one bad row should not cost the rest.
 *
 * @param onProgress - Optional reporter, called every {@link PROGRESS_REPORT_EVERY} records.
 * @returns The parsed records, or `null` if this source is unavailable.
 */
export async function tryStreamNdjson(onProgress?: ProgressReporter): Promise<null | readonly Wine[]> {
	try {
		const res = await fetch('/data-real-full.ndjson');

		if (!res.ok || res.body === null) {
			return null;
		}

		const reader = res.body.getReader();
		const decoder = new TextDecoder('utf-8');
		const wines: Wine[] = [];
		let buffer = '';

		// Read chunk → decode → split on \n → parse each COMPLETE line, holding the trailing partial
		// line in `buffer` for the next iteration to prepend. A record can straddle a chunk boundary,
		// which is the whole reason for the buffer.
		while (true) {
			const { done: isDone, value } = await reader.read();

			if (isDone) {
				break;
			}
			buffer += decoder.decode(value, { stream: true });
			let newlineIdx = buffer.indexOf('\n');

			while (newlineIdx !== -1) {
				const line = buffer.slice(0, newlineIdx);

				buffer = buffer.slice(newlineIdx + 1);
				if (line.length > 0) {
					try {
						wines.push(JSON.parse(line) as Wine);
					} catch {
						// Malformed line — skip. One bad row must not kill the whole boot.
					}
				}
				if (wines.length > 0 && wines.length % PROGRESS_REPORT_EVERY === 0) {
					onProgress?.(wines.length, EXPECTED_REAL_CORPUS_SIZE, 'full-corpus-ndjson', true);
				}
				newlineIdx = buffer.indexOf('\n');
			}
		}
		// Flush a trailing line that did not end in \n — the last record of a file usually will not.
		if (buffer.length > 0) {
			try {
				wines.push(JSON.parse(buffer) as Wine);
			} catch {
				// Same rationale as above.
			}
		}
		// 🔴 The FINAL report passes the real count as the total, where the intermediate ones above pass
		// the estimate. That asymmetry is the point.
		//
		// The boot caption's third state — the one naming the index build, so the screen does not read as
		// a hang while it happens — is entered on `loaded >= total`. (Named rather than quoted:
		// `tests/tooling/bootCaptionSingleSource.test.ts` does not exempt comments, deliberately.)
		// With the estimate here, that would hold only while the constant happens to equal the corpus on
		// disk.
		onProgress?.(wines.length, wines.length, 'full-corpus-ndjson', false);

		return wines;
	} catch {
		return null;
	}
}

/**
 * Load the monolithic JSON real corpus from `/data-real-full.json`.
 *
 * @remarks
 * Atomic parse, so progress is a single 100% update once it completes. Used when the NDJSON variant
 * is absent.
 *
 * @param onProgress - Optional reporter, called once on success.
 * @returns The parsed records, or `null` if this source is unavailable.
 */
export async function tryLoadJsonFullCorpus(onProgress?: ProgressReporter): Promise<null | readonly Wine[]> {
	try {
		const res = await fetch('/data-real-full.json');

		if (!res.ok) {
			return null;
		}
		const text = await res.text();
		const wines = JSON.parse(text) as readonly Wine[];

		onProgress?.(wines.length, wines.length, 'full-corpus-json', false);

		return wines;
	} catch {
		return null;
	}
}

/**
 * Generate the first `count` wines of the synthetic stream in chunks, reporting after each chunk.
 *
 * @remarks
 * Record `i` of the stream depends only on the seed and `i`, so generating in chunks yields exactly the
 * records one `generateWines(count)` call would. Every record is stamped with the tier it belongs to:
 * `'full'` for the 150,000-wine tier, `'default'` for the 10,000-wine one.
 *
 * @param count - How many wines to generate.
 * @param source - The source to report progress under.
 * @param onProgress - Optional reporter, called after every {@link SYNTHETIC_CHUNK_SIZE} records and
 *   once more at the end. Every report carries the exact total.
 * @returns The generated wines, in stream order.
 */
export function generateSyntheticWines(
	count: number,
	source: Extract<WineCorpusSource, 'low-memory-tier' | 'synthetic-full-tier'>,
	onProgress?: ProgressReporter,
): readonly Wine[] {
	const tier = source === 'synthetic-full-tier' ? 'full' : 'default';
	const wines: Wine[] = [];

	for (let start = 0; start < count; start += SYNTHETIC_CHUNK_SIZE) {
		const end = Math.min(start + SYNTHETIC_CHUNK_SIZE, count);

		// A loop, not `push(...chunk)`: spreading thousands of arguments is a stack-size hazard.
		for (const wine of generateWineRange(start, end, undefined, tier)) {
			wines.push(wine);
		}
		onProgress?.(wines.length, count, source, false);
	}

	return wines;
}

/**
 * Resolve the wine corpus for the requested tier.
 *
 * @remarks
 * A real-corpus source that returns an EMPTY array is treated as unavailable, not as success: an empty
 * NDJSON file (a truncated or half-written import) would otherwise boot the app showing zero wines.
 *
 * @param tier - Which tier to build. See {@link WineWorkerTier}.
 * @param onProgress - Optional reporter, forwarded to each source.
 * @returns The corpus and which source produced it.
 */
export async function loadWineCorpus(
	tier: WineWorkerTier,
	onProgress?: ProgressReporter,
): Promise<{ readonly source: WineCorpusSource; readonly wines: readonly Wine[] }> {
	if (tier === 'low-memory') {
		return { source: 'low-memory-tier', wines: generateSyntheticWines(DEFAULT_TIER_SIZE, 'low-memory-tier', onProgress) };
	}

	const ndjson = await tryStreamNdjson(onProgress);

	if (ndjson !== null && ndjson.length > 0) {
		return { source: 'full-corpus-ndjson', wines: ndjson };
	}

	const json = await tryLoadJsonFullCorpus(onProgress);

	if (json !== null && json.length > 0) {
		return { source: 'full-corpus-json', wines: json };
	}

	return {
		source: 'synthetic-full-tier',
		wines: generateSyntheticWines(FULL_WINE_TIER_SIZE, 'synthetic-full-tier', onProgress),
	};
}
