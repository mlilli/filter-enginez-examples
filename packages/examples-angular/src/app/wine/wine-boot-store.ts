/**
 * `WineBootStore` — the wine route's boot state, and the reason `/wine` has no resolver.
 *
 * @remarks
 * ## Why this route breaks the app's resolver idiom
 *
 * `app.routes.ts` argues the route-resolver pattern at length, and it is right for `/books` and
 * `/real-estate`: both boot on the main thread in well under a second, so a resolver that blocks
 * navigation is invisible. **That is also why neither of those routes has a boot screen** — neither
 * needs one.
 *
 * Wine needs one. 150k records over a Comlink worker takes seconds, and a blocking resolver would mean
 * clicking "Wine" on the landing page does nothing at all for that whole time — no spinner, no page,
 * no feedback. Strictly worse than the other five verticals, and it would make the boot-progress
 * pub/sub that `bootWineAsyncEngine` reports through unreachable, since nothing would be rendered to
 * read it.
 *
 * So the page navigates immediately and owns the boot itself. This store is the state that boot
 * produces, and it exists as a class rather than as page fields for one reason: the view needs the
 * engine, and `provideFilterEngineFactory` must be able to reach it. Injecting the page component
 * directly would work and would be a circular import — the page imports the view, so the view cannot
 * import the page. A store both import is the way out.
 *
 * ## `requireEngine` throws rather than returning null
 *
 * The view is rendered under `@if (store.isReady())`, so by the time its providers run the boot has
 * resolved. A nullable accessor would push that guarantee into every consumer as a `!` or a guard,
 * and each of those would be a place to get it wrong quietly. Throwing states the invariant once, and
 * a throw here is a programming error rather than a user-facing failure — a failed boot has its own
 * signal and its own screen.
 *
 * @packageDocumentation
 */

import type { FilterBundle } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';
import type { RxJsEngine } from '@filter-enginez/reactive-rxjs';

import { Injectable, signal } from '@angular/core';
import {
	bootWineAsyncEngine,
	describeWineCorpusTier,
	subscribeWineBootProgress,
	type WineBootProgress,
} from '@filter-enginez/examples-shared/wine-core';
import { createRxJsEngineFromAsync } from '@filter-enginez/reactive-rxjs/worker';

import { readConfigFromUrl } from '../url/url-state.js';
import { deriveWineFacets, type WineFacets } from './wine-facets.js';
import { spawnWineWorker, WINE_DATASET_SIZE } from './wineBoot.js';

@Injectable()
export class WineBootStore {
	/** The RxJS surface over the worker-hosted engine, or `null` until boot resolves. */
	public readonly engine = signal<RxJsEngine<Wine> | null>(null);

	/** Everything derived from the booted corpus, or `null` until boot resolves. */
	public readonly facets = signal<WineFacets | null>(null);

	/**
	 * The predictive-disable bundle, replaced on every engine settle.
	 *
	 * @remarks
	 * Boot state is what this class is FOR, and this is not that — it is written by the view's fetcher,
	 * long after boot. It lives here anyway because a component's `providers` array is evaluated before
	 * its class instance exists, so `provideWineBundle` cannot reference a view field. The store is the
	 * nearest thing to it that a provider factory can reach.
	 */
	public readonly bundle = signal<FilterBundle | null>(null);

	/** Corpus-streaming progress, or `null` before the first chunk. */
	public readonly progress = signal<WineBootProgress | null>(null);

	/** Why the boot failed, or `null`. A failed boot is an ordinary outcome here — see `boot`. */
	public readonly error = signal<string | null>(null);

	/** Records booted, for the footer. */
	public readonly wineCount = signal(0);

	/** Wall-clock boot duration in ms, for the footer. */
	public readonly bootMs = signal(0);

	/**
	 * Which corpus tier actually booted, for the footer.
	 *
	 * @remarks
	 * Kept from `meta.source` so a count of 10,000 on screen has its explanation next to it. A missing
	 * corpus symlink drops the route to the bundled tier three layers away, and the number alone
	 * cannot say so.
	 */
	public readonly corpusTier = signal('');

	/** Teardown for the progress subscription. */
	private _stopProgress: (() => void) | null = null;

	/**
	 * Whether the view may render.
	 *
	 * @returns `true` once both the engine and its facets are in hand.
	 */
	public isReady(): boolean {
		return this.engine() !== null && this.facets() !== null;
	}

	/**
	 * The booted engine.
	 *
	 * @returns The engine.
	 * @throws When read before boot resolves — see the class remarks.
	 */
	public requireEngine(): RxJsEngine<Wine> {
		const engine = this.engine();

		if (engine === null) {
			throw new Error('WineBootStore.requireEngine() before boot resolved');
		}

		return engine;
	}

	/**
	 * The derived facets.
	 *
	 * @returns The facets.
	 * @throws When read before boot resolves — see the class remarks.
	 */
	public requireFacets(): WineFacets {
		const facets = this.facets();

		if (facets === null) {
			throw new Error('WineBootStore.requireFacets() before boot resolved');
		}

		return facets;
	}

	/**
	 * Boot the worker-hosted engine and derive everything the panel needs.
	 *
	 * @remarks
	 * **Progress is subscribed BEFORE the boot is kicked off.** The pub/sub is module-level and reports
	 * as chunks stream; subscribing afterwards would miss every chunk already delivered and leave the
	 * boot screen at zero — on a fast connection, that is the entire boot. Every vertical's page does
	 * this in the same order for the same reason.
	 *
	 * **The corpus is read from the RESIDENT MIRROR, never re-fetched.** `createRxJsEngineFromAsync`
	 * pulls the whole corpus across the Comlink boundary exactly once at boot and keeps it — that is
	 * the adapter's stated bandwidth contract. Calling `asyncEngine.getSourceData()` here would be a
	 * SECOND full structured-clone of 150k records, which does not fail: it just doubles an already
	 * multi-second boot, and it is invisible in code review because the call reads perfectly sensibly.
	 *
	 * **A `?f` link is loaded BEFORE the engine is wrapped**, matching every other route: `loadConfig`
	 * fires its change, and restoring first avoids an immediate redundant write straight back to the
	 * URL. It is awaited here because on this tier it is a round trip.
	 *
	 * A failed boot is reported rather than thrown. The usual causes are the worker failing to spawn or
	 * the corpus 404ing, both of which are ordinary local-setup states rather than bugs, and an
	 * indefinite boot screen reads as a hang.
	 */
	public async boot(): Promise<void> {
		// Subscribe FIRST — see the remarks.
		this._stopProgress = subscribeWineBootProgress((next) => {
			this.progress.set(next);
		});

		try {
			const { asyncEngine, meta } = await bootWineAsyncEngine({
				datasetSize: WINE_DATASET_SIZE,
				spawnWorker: spawnWineWorker,
			});
			const urlConfig = readConfigFromUrl();

			if (urlConfig !== null) {
				try {
					await asyncEngine.loadConfig(urlConfig);
				} catch {
					// Malformed or incompatible link — open on the neutral corpus rather than failing the
					// page. A bad URL should never cost someone the route.
				}
			}

			const engine = await createRxJsEngineFromAsync<Wine>(asyncEngine);

			// `engine.core.getSourceData()`, NOT `asyncEngine.getSourceData()`. The adapter above already
			// pulled the whole corpus across the Comlink boundary exactly once and holds a resident
			// mirror — its own comment calls that the bandwidth contract. Asking the WORKER again is a
			// second full structured-clone of 150k records, which does not fail, it just doubles the boot.
			this.facets.set(deriveWineFacets(engine.core.getSourceData()));
			this.wineCount.set(meta.wineCount);
			this.bootMs.set(meta.bootMs);
			this.corpusTier.set(describeWineCorpusTier(meta.source));
			// LAST. `isReady()` reads both, and the view's providers pull the facets the moment it
			// renders — so publishing the engine first would give the view a frame with no facets.
			this.engine.set(engine);
		} catch (caught: unknown) {
			this.error.set(caught instanceof Error ? caught.message : String(caught));
		}
	}

	/** Release the progress subscription. The engine outlives the page by design — it is cached. */
	public dispose(): void {
		this._stopProgress?.();
		this._stopProgress = null;
	}
}
