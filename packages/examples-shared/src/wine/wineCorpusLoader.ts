/**
 * `wineCorpusLoader` — the wine worker's three-tier corpus resolution, extracted so it can be tested.
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
 * And it does decide something load-bearing. The fallback chain picks between a ~130k-record corpus
 * and the 10k bundled tier, and it falls back SILENTLY by design — every failure path returns `null`
 * rather than throwing, so a fresh clone still boots. That is the right behavior and also exactly the
 * kind of thing that hides: if the NDJSON tier broke, the wine demo would quietly serve 10k records
 * and look completely healthy while every performance claim it demonstrates became untrue.
 *
 * Kept isomorphic-ish on purpose: nothing here touches `self`, Comlink, or the engine, so the tests
 * need only a `fetch` stub.
 *
 * @packageDocumentation
 */

import { type Wine } from '@filter-enginez/mock-data/wine';

/**
 * The real Kaggle Wine Reviews dataset's known size (129,907 valid rows after dropping 64 sparse
 * ones). Used purely for the loader's "Loaded N of ~130k" copy — if the real count comes back
 * different, the caption just lags a few hundred bottles, which is fine.
 */
export const EXPECTED_FULL_CORPUS_SIZE = 129_907;

/**
 * Report progress every this-many records parsed. Sized so the main thread receives roughly 10-15
 * updates over the ~1-2s parse — smooth enough to animate a counter without flooding the channel.
 */
export const PROGRESS_REPORT_EVERY = 8_000;

/** Which tier of the fallback chain produced the corpus. */
export type WineCorpusSource = 'default-tier' | 'full-corpus-json' | 'full-corpus-ndjson';

/**
 * A short, user-facing label for the tier a wine route actually booted.
 *
 * @remarks
 * **Shared so the verticals cannot describe the same state different ways.** Every wine footer
 * renders this next to the record count, because a count alone states WHAT happened and never why:
 * "10,000 bottles" with no tier points at the engine boot, when the usual cause is a missing corpus
 * symlink, three layers away and invisible from the number on screen.
 *
 * @param source - Which tier of the fallback chain produced the corpus
 * @returns A label suitable for a footer, e.g. `'bundled 10k tier'`
 */
export function describeWineCorpusTier(source: WineCorpusSource): string {
	return source === 'default-tier' ? 'bundled 10k tier' : 'full corpus';
}

/**
 * Shape of the callbacks the worker factory expects from the main thread, delivered via
 * `wrapInWorker`'s `factoryCallbacks` field. Each value arrives as a Comlink remote function — the
 * worker invokes them as if local; Comlink routes the call back via postMessage.
 */
export interface WineWorkerCallbacks {
	/**
	 * `loaded` is the count of parsed wine records so far. `total` is the expected total
	 * (`EXPECTED_FULL_CORPUS_SIZE` when streaming the real corpus, the actual count otherwise).
	 * `source` describes which fallback tier landed.
	 */
	readonly onProgress?: (loaded: number, total: number, source: WineCorpusSource) => void;
}

/** A progress reporter, once narrowed out of the callbacks bag. */
type ProgressReporter = WineWorkerCallbacks['onProgress'];

/**
 * Stream the NDJSON full corpus from `/data-real-full.ndjson`.
 *
 * @remarks
 * Returns `null` on any failure — 404, network error, a body that cannot be read — so the caller can
 * fall through to the next tier. Malformed individual LINES are skipped rather than aborting the
 * parse: the corpus should be clean, but one bad row should not cost the user the other 129,906.
 *
 * @param onProgress - Optional reporter, called every {@link PROGRESS_REPORT_EVERY} records.
 * @returns The parsed records, or `null` if this tier is unavailable.
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
					onProgress?.(wines.length, EXPECTED_FULL_CORPUS_SIZE, 'full-corpus-ndjson');
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
		// disk: regenerate the corpus a hundred rows short and the pause would stop being narrated in ALL
		// SIX verticals at once, silently, leaving a frozen count.
		//
		// `tryLoadJsonFullCorpus` and the default tier report their real counts at completion too. The
		// estimate belongs only where it is honest: in the intermediate reports, which cannot know the end.
		onProgress?.(wines.length, wines.length, 'full-corpus-ndjson');

		return wines;
	} catch {
		return null;
	}
}

/**
 * Load the monolithic JSON full corpus from `/data-real-full.json`.
 *
 * @remarks
 * Atomic parse, so progress is a single 100% update once it completes. Used when the NDJSON variant
 * is absent — e.g. before `pnpm regen:wine:real` has been re-run since the import-script change.
 *
 * @param onProgress - Optional reporter, called once on success.
 * @returns The parsed records, or `null` if this tier is unavailable.
 */
export async function tryLoadJsonFullCorpus(onProgress?: ProgressReporter): Promise<null | readonly Wine[]> {
	try {
		const res = await fetch('/data-real-full.json');

		if (!res.ok) {
			return null;
		}
		const text = await res.text();
		const wines = JSON.parse(text) as readonly Wine[];

		onProgress?.(wines.length, wines.length, 'full-corpus-json');

		return wines;
	} catch {
		return null;
	}
}

/**
 * Resolve the wine corpus through the three-tier chain: NDJSON → monolithic JSON → bundled default.
 *
 * @remarks
 * A tier that returns an EMPTY array is treated as unavailable, not as success. That matters: an
 * empty NDJSON file (a truncated or half-written regen) would otherwise be accepted and the app would
 * boot showing zero wines rather than falling back to the 10k tier.
 *
 * @param defaultWines - The bundled default tier, used when neither full-corpus tier lands.
 * @param onProgress - Optional reporter, forwarded to each tier.
 * @returns The corpus and which tier produced it.
 */
export async function loadWineCorpus(
	defaultWines: readonly Wine[],
	onProgress?: ProgressReporter,
): Promise<{ readonly source: WineCorpusSource; readonly wines: readonly Wine[] }> {
	const ndjson = await tryStreamNdjson(onProgress);

	if (ndjson !== null && ndjson.length > 0) {
		return { source: 'full-corpus-ndjson', wines: ndjson };
	}

	const json = await tryLoadJsonFullCorpus(onProgress);

	if (json !== null && json.length > 0) {
		return { source: 'full-corpus-json', wines: json };
	}

	// **The one place that knows both full tiers missed, so the only place that can say so.**
	// The house logging rules put this exact case under `warn`: "something unexpected happened
	// but was handled (e.g. worker requested but unavailable, falling back)". Without it, a missing
	// corpus symlink makes both fetches 404 and the tier fall back below `WORKER_THRESHOLD` with
	// nothing on screen or in the console to say why. The remedies are named because "corpus
	// unavailable" is not actionable on its own.
	//
	// This fires on a deployed app too, where the default tier IS the correct state and the 116 MB
	// corpus is deliberately not shipped. One line per boot, stating a true fact about which tier is
	// running, is diagnostic rather than noise — and a warning that only appears in development is a
	// warning nobody sees when it matters.
	console.warn(
		'[wine] Full corpus unavailable — the worker is falling back to the bundled 10k tier, which is '
		+ 'BELOW WORKER_THRESHOLD and does not need a worker at all. Both /data-real-full.ndjson and '
		+ '/data-real-full.json failed to load. Locally: in the engine repo, run '
		+ '`pnpm --filter @filter-enginez/mock-data regen:wine:real --accept-data-license` (the data is '
		+ 'CC BY-NC-SA 4.0 and stays on your machine), then `pnpm link:wine-corpus` here to link it into '
		+ 'every vertical. On a deployed build this is expected — the corpus is never published.',
	);
	onProgress?.(defaultWines.length, defaultWines.length, 'default-tier');

	return { source: 'default-tier', wines: defaultWines };
}
