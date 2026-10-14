/**
 * `wineCorpusTier` — the names of the wine corpus sources and the footer label for each.
 *
 * @remarks
 * Split from `wineCorpusLoader.ts` because the two run on different threads. The loader runs in the
 * worker and imports the synthetic generator; these names and labels are read on the main thread by
 * every wine footer. Keeping them apart keeps the generator's tables out of every main-thread bundle.
 *
 * @packageDocumentation
 */

/**
 * Which source produced the corpus a wine route booted.
 *
 * @remarks
 *   - `'default-tier'` — the 10,000-wine default tier, loaded on the main thread
 *     (`VITE_WINE_TIER=default`).
 *   - `'full-corpus-ndjson'` / `'full-corpus-json'` — the local real review corpus.
 *   - `'synthetic-full-tier'` — the 150,000 synthetic wines, generated in the worker.
 *   - `'low-memory-tier'` — the 10,000-wine default tier, generated in the worker because the device
 *     reported too little memory for the full tier.
 */
export type WineCorpusSource =
	| 'default-tier'
	| 'full-corpus-json'
	| 'full-corpus-ndjson'
	| 'low-memory-tier'
	| 'synthetic-full-tier';

/**
 * Which tier the worker is asked to build.
 *
 * @remarks
 * `'full'` runs the chain in the module docblock; `'low-memory'` generates the default tier. Sent to
 * the worker as a plain string in `factoryOptions`, which is why it is a string union rather than a
 * boolean flag: the worker validates it, and an unknown value builds the full tier.
 */
export type WineWorkerTier = 'full' | 'low-memory';

/**
 * A short, user-facing label for the tier a wine route actually booted.
 *
 * @remarks
 * **Shared so the verticals cannot describe the same state different ways.** Every wine footer
 * renders this next to the record count, because a count alone states WHAT happened and never why.
 *
 * Every full-tier label contains `full corpus`, which `tests/e2e/wineFlow.ts` asserts positively; the
 * two 10,000-wine labels never do.
 *
 * @param source - Which source produced the corpus.
 * @returns A label suitable for a footer, e.g. `'full corpus · synthetic'`.
 */
export function describeWineCorpusTier(source: WineCorpusSource): string {
	switch (source) {
		case 'default-tier': {
			return '10k tier · synthetic';
		}
		case 'full-corpus-json':
		case 'full-corpus-ndjson': {
			return 'full corpus · local real reviews';
		}
		case 'low-memory-tier': {
			return '10k tier · synthetic · low-memory device';
		}
		case 'synthetic-full-tier': {
			return 'full corpus · synthetic';
		}
	}
}

/**
 * The footer label of the server-backed wine routes (`/wine-server` in SvelteKit and vanilla).
 *
 * @remarks
 * Those routes filter on a server, which holds the 10,000-wine default tier rather than the 150,000
 * the browser routes generate: the deployment runs on Cloudflare's Workers Free plan, which allows
 * 10 ms of CPU and 128 MB of memory per request. The label says so, because two wine routes reporting
 * different counts with no reason given is worse than either number. Shared so both server routes and
 * `tests/e2e/vanilla-wine-server.spec.ts` read one string.
 */
export const SERVER_WINE_TIER_LABEL = '10k tier · synthetic · sized for the server';
