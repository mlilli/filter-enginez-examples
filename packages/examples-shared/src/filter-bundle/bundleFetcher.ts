/**
 * `bundleFetcher` — the framework-neutral, transport-neutral predictive-disable fetch loop.
 *
 * @remarks
 * Predictive disable needs one bundle per engine change: a single round trip returning per-candidate
 * `wouldBeEmpty` data for the chips and filtered-except-self bounds for the sliders. Getting that
 * bundle looks trivial and is not, because of three things that have to hold at once.
 *
 * **1. Two transports, and the choice is not the caller's to make twice.** A main-thread engine
 * answers synchronously off `core.applyFiltersAndQuery`. A worker-backed or server-backed engine
 * answers a round trip later off `asyncEngine.applyFiltersAndQuery`. Worse, the two are not
 * interchangeable: `createAsyncCoreShim` deliberately makes the SYNC path throw on an async engine
 * rather than silently running the filter on the main thread — the exact work the worker tier exists
 * to avoid. So "call the sync one and fall back" is not available; the branch has to be explicit, and
 * `books-domain/bundle.ts` is sync-only by design for precisely this reason.
 *
 * **2. Overlapping fetches are the normal case.** A user dragging a slider outruns a worker round
 * trip easily. Without a stale guard the LAST fetch to resolve wins rather than the LATEST one
 * issued — and since a slower earlier request usually carries a WIDER result set, the visible symptom
 * is a panel re-enabling chips the user just filtered away. It reads as a filter that silently failed
 * to apply, not as a race.
 *
 * **3. The busy indicator must clear on every outcome.** Resolved, superseded, or failed — all three
 * advance the resolved version. Skipping any one of them leaves `userActionVersion` permanently ahead
 * of `resolvedVersion`, so the "computing" indicator stays lit for the rest of the session, over
 * perfectly correct results, with no further event able to clear it.
 *
 * This module is the one place those three live. It holds no framework primitive — no hook, no store,
 * no signal — so React's `useEffect`, Svelte's `$effect`, Vue's `watchEffect` and Angular's `effect`
 * each drive the same loop through {@link BundleFetcher.request} and tear it down through
 * {@link BundleFetcher.dispose}.
 *
 * @packageDocumentation
 */

import type { FilterBundle, FilterBundleQuery } from '@filter-enginez/core';

/**
 * The minimum an engine must expose to answer a bundle query.
 *
 * @remarks
 * Structural rather than importing `SignalsEngine` / `RxJsEngine`, so this module stays free of any
 * reactive surface — the Svelte and vanilla verticals hold shapes that satisfy this without either
 * adapter package in their graph. `asyncEngine`'s presence is the transport switch.
 */
export interface BundleQueryable {
	/** The bare engine. Answers synchronously on a main-thread tier. */
	readonly core: {
		applyFiltersAndQuery(query?: FilterBundleQuery): FilterBundle;
	};
	/** Present on worker-backed and server-backed tiers. When present it is authoritative. */
	readonly asyncEngine?: {
		applyFiltersAndQuery(query?: FilterBundleQuery): Promise<FilterBundle>;
	};
}

/** Callbacks the host framework supplies. Only `onBundle` is required. */
export interface BundleFetchHandlers {
	/** Receives each bundle that is still current when it arrives. Never called for a stale fetch. */
	readonly onBundle: (bundle: FilterBundle) => void;
	/**
	 * Snapshot the busy tracker's current user-action version at fetch START. Paired with
	 * {@link BundleFetchHandlers.onSettled}; supply both or neither.
	 */
	readonly captureVersion?: () => number;
	/**
	 * A fetch failed. The previous bundle is deliberately left in place — predictive disable is an
	 * ENHANCEMENT, so a failed round trip should degrade to slightly stale hints rather than blanking
	 * every control. Called for genuine failures only, never for supersession.
	 */
	readonly onError?: (error: unknown) => void;
	/**
	 * A fetch reached a terminal state — resolved, superseded, OR failed. Receives the version
	 * captured at start. Called exactly once per {@link BundleFetcher.request}, and called even when
	 * the result was discarded: a cancelled fetch still returned real work, and the busy predicate is
	 * monotonic, so advancing on every outcome is what keeps the indicator from stranding.
	 */
	readonly onSettled?: (fetchVersion: number) => void;
}

/** The fetch loop's handle. One per mounted panel. */
export interface BundleFetcher {
	/**
	 * Discard any in-flight fetch's RESULT without issuing a new one. Idempotent. Call on teardown.
	 *
	 * The request itself is not aborted — a worker round trip has no cancellation channel and the work
	 * is already underway — so `onSettled` still fires. Only `onBundle` is suppressed.
	 */
	dispose(): void;
	/** Issue a fetch, superseding any in-flight one. */
	request(query: FilterBundleQuery): void;
}

/**
 * Create a bundle fetch loop over an engine.
 *
 * @param source - The engine. `asyncEngine`, when present, wins over `core`.
 * @param handlers - Host-framework callbacks.
 * @returns A {@link BundleFetcher}.
 *
 * @example
 * ```ts
 * // Svelte
 * const fetcher = createBundleFetcher(engine, { onBundle: (next) => { bundle = next; } });
 * $effect(() => { lastChange; fetcher.request(query); });
 * onDestroy(() => fetcher.dispose());
 * ```
 */
export function createBundleFetcher(source: BundleQueryable, handlers: BundleFetchHandlers): BundleFetcher {
	// A monotonically increasing id identifying the newest request. Each in-flight fetch closes over
	// the id it was issued under and compares on arrival; anything that is not the newest is stale.
	//
	// A counter rather than a per-fetch boolean flag because supersession and teardown are the same
	// event from the fetch's point of view — both mean "you are no longer the answer anyone wants" —
	// and one comparison expresses both without the two paths drifting apart.
	let newestRequestId = 0;
	let isDisposed = false;

	/**
	 * Whether a fetch issued under `requestId` may still deliver its bundle.
	 *
	 * @param requestId - The id the fetch was issued under.
	 * @returns `true` when it is still the newest request and the fetcher is live.
	 */
	function isCurrent(requestId: number): boolean {
		return !isDisposed && requestId === newestRequestId;
	}

	/**
	 * Deliver a bundle if it is still wanted, then settle regardless.
	 *
	 * @param requestId - The id the fetch was issued under.
	 * @param version - The version captured at fetch start.
	 * @param bundle - The bundle, or `null` when the fetch failed.
	 * @param error - The failure, when there was one.
	 */
	function complete(requestId: number, version: number, bundle: FilterBundle | null, error?: unknown): void {
		if (bundle !== null && isCurrent(requestId)) {
			handlers.onBundle(bundle);
		}
		if (bundle === null) {
			handlers.onError?.(error);
		}
		handlers.onSettled?.(version);
	}

	return {
		dispose(): void {
			isDisposed = true;
		},

		request(query: FilterBundleQuery): void {
			if (isDisposed) {
				return;
			}
			newestRequestId += 1;

			const requestId = newestRequestId;
			// Captured BEFORE the call, not after: the point of the version is to record what the user
			// had already asked for when this fetch started. Capturing on resolve would fold in every
			// action taken during the round trip and clear the indicator for work not yet reflected.
			const version = handlers.captureVersion?.() ?? 0;
			const { asyncEngine } = source;

			if (asyncEngine === undefined) {
				try {
					complete(requestId, version, source.core.applyFiltersAndQuery(query));
				} catch (error) {
					complete(requestId, version, null, error);
				}

				return;
			}

			void asyncEngine.applyFiltersAndQuery(query).then(
				(bundle) => {
					complete(requestId, version, bundle);
				},
				(error: unknown) => {
					complete(requestId, version, null, error);
				},
			);
		},
	};
}
