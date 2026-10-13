/**
 * Synthesize the `/lab` route's `DatasetEntry` from the books one.
 *
 * @remarks
 * `<DatasetRoute>` owns the entire boot path — lazy boot, the `<BrainSynapse>` progress loader, the
 * boot-error screen, `<FilterEngineProvider>` and optional URL sync — and it is driven entirely by a
 * `DatasetEntry`. Since that entry is DATA, `/lab` is books' entry with a different `Component`:
 * zero change to `DatasetRoute`, zero duplicated boot, and the `examples-shared` books slice caches
 * its boot, so arriving from `/books` reuses the already-booted engine AND its current filter state.
 *
 * @packageDocumentation
 */

import type { DatasetEntry } from '../datasets.js';

/**
 * Build the lab's dataset entry, or `null` when the books entry is missing.
 *
 * @remarks
 * 🔴 **Call this ONCE, at module scope, and hold the result.** `DatasetRoute`'s boot effect is keyed
 * on entry identity, and the books entry's `boot` returns a fresh `{ engine }` object on every call
 * even though `bootBooksEngine` caches the bundle underneath. A caller that rebuilds the entry per
 * render therefore hands the effect a new dependency each pass, and the cycle closes: effect fires →
 * boot resolves → `setBooted` → render → new identity → effect fires again, forever.
 *
 * **React never throws for it.** "Maximum update depth exceeded" catches synchronous setState
 * cascades; this one turns on a resolved promise, so it presents as a tab spinning at 100% CPU with
 * a clean console. `LabRoute` holds the result at module scope and `labRoute.test.tsx` asserts
 * `boot` is invoked exactly once across re-renders, because the guard is what survives somebody
 * inlining this call for readability.
 *
 * The `undefined` arm is a REAL branch rather than a defensive one: a typo in the dataset id would
 * otherwise render a lab over no engine at all, so it gets a case rather than a `v8 ignore`.
 *
 * @param booksEntry - The books entry from the app's dataset registry, if it is present.
 * @param Component - The component `<DatasetRoute>` renders inside the engine provider.
 * @returns The synthesized entry, or `null` when there is no books dataset to borrow.
 */
export function buildLabEntry(
	booksEntry: DatasetEntry | undefined,
	Component: React.ComponentType,
): DatasetEntry | null {
	if (booksEntry === undefined) {
		return null;
	}

	// `supportsUrlState: false` because `/lab` is a demonstration surface rather than a shareable
	// filter state — URL sync on a route with no filter panel would write an empty `?f`.
	return { ...booksEntry, Component, supportsUrlState: false };
}
