/**
 * Tests for the framework-neutral bundle fetch loop.
 *
 * @remarks
 * Three behaviors here are invisible in a rendered panel and each fails in a way that looks like
 * something else entirely, which is why they get direct assertions rather than being covered
 * incidentally through a component:
 *
 *   - **Stale suppression.** Without it the panel shows an older, WIDER result set, re-enabling chips
 *     the user just filtered away. That reads as a filter that failed to apply, not as a race.
 *   - **Settling on every outcome.** A fetch that is superseded or fails and does not settle strands
 *     the busy indicator lit for the rest of the session, over correct results.
 *   - **Transport choice.** Falling through to the sync core on an async engine would run the filter
 *     on the main thread — the work the worker tier exists to avoid — and still produce a correct
 *     bundle, so nothing downstream would look wrong.
 *
 * Resolution order is driven explicitly with deferred promises. Out-of-order completion IS the
 * subject, so the tests must control it rather than await it.
 */

import type { FilterBundle, FilterBundleQuery } from '@filter-enginez/core';

import { describe, expect, it, vi } from 'vitest';

import { type BundleQueryable, createBundleFetcher } from './bundleFetcher.js';

const QUERY: FilterBundleQuery = {
	chipGroups: [{ candidates: ['alpha'], field: 'kind', kind: 'inSet', ruleId: 'kind' }],
};

/**
 * A bundle carrying a recognizable count, so a test can tell WHICH fetch delivered.
 *
 * @param resultCount - The count this bundle reports.
 * @returns A `FilterBundle`-shaped stub.
 */
function bundleWithCount(resultCount: number): FilterBundle {
	return { chipGroups: [], fields: [], resultCount, resultIndices: new Uint32Array() };
}

/** A promise plus its resolver + rejector, so a test decides when and how a fetch completes. */
function deferred(): {
	promise: Promise<FilterBundle>;
	reject: (error: unknown) => void;
	resolve: (bundle: FilterBundle) => void;
} {
	let resolve!: (bundle: FilterBundle) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<FilterBundle>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, reject, resolve };
}

/** Let queued promise callbacks run. */
async function flush(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

/**
 * A sync (main-thread) engine.
 *
 * @param applyFiltersAndQuery - The sync query implementation.
 * @returns A source with no `asyncEngine`.
 */
function syncSource(applyFiltersAndQuery: () => FilterBundle): BundleQueryable {
	return { core: { applyFiltersAndQuery }};
}

/**
 * A worker/server-backed engine — an `asyncEngine` alongside a core that must never be called.
 *
 * @param applyFiltersAndQuery - The async query implementation.
 * @returns A source carrying both, as the real worker tier does.
 */
function asyncSource(applyFiltersAndQuery: () => Promise<FilterBundle>): {
	source: BundleQueryable;
	syncSpy: ReturnType<typeof vi.fn>;
} {
	const syncSpy = vi.fn(() => bundleWithCount(-1));

	return { source: { asyncEngine: { applyFiltersAndQuery }, core: { applyFiltersAndQuery: syncSpy }}, syncSpy };
}

describe('the sync transport', () => {
	it('delivers a bundle in the same tick', () => {
		const onBundle = vi.fn();

		createBundleFetcher(syncSource(() => bundleWithCount(5)), { onBundle }).request(QUERY);

		expect(onBundle).toHaveBeenCalledWith(bundleWithCount(5));
	});

	it('reports a thrown query as an error and leaves the previous bundle alone', () => {
		// A partially-shaped corpus — a fixture missing a queried numeric field — must degrade to
		// slightly stale hints, not a blanked panel. Predictive disable is an enhancement.
		const onBundle = vi.fn();
		const onError = vi.fn();
		const boom = new Error('bad field');

		createBundleFetcher(syncSource(() => {
			throw boom;
		}), { onBundle, onError }).request(QUERY);

		expect(onError).toHaveBeenCalledWith(boom);
		expect(onBundle).not.toHaveBeenCalled();
	});

	it('settles even when the query throws', () => {
		// The indicator has to clear on the failure path too, or it stays lit forever.
		const onSettled = vi.fn();

		createBundleFetcher(syncSource(() => {
			throw new Error('bad field');
		}), { captureVersion: () => 7, onBundle: vi.fn(), onSettled }).request(QUERY);

		expect(onSettled).toHaveBeenCalledWith(7);
	});
});

describe('the async transport', () => {
	it('prefers the async engine and never touches the sync core', async () => {
		// The load-bearing assertion. Calling the core here would run the 150k filter on the main
		// thread and still produce a perfectly correct bundle — the failure is invisible except as jank.
		const { source, syncSpy } = asyncSource(async () => Promise.resolve(bundleWithCount(3)));
		const onBundle = vi.fn();

		createBundleFetcher(source, { onBundle }).request(QUERY);
		await flush();

		expect(onBundle).toHaveBeenCalledWith(bundleWithCount(3));
		expect(syncSpy).not.toHaveBeenCalled();
	});

	it('reports a rejected round trip as an error', async () => {
		const boom = new Error('worker gone');
		const { source } = asyncSource(async () => Promise.reject(boom));
		const onBundle = vi.fn();
		const onError = vi.fn();

		createBundleFetcher(source, { onBundle, onError }).request(QUERY);
		await flush();

		expect(onError).toHaveBeenCalledWith(boom);
		expect(onBundle).not.toHaveBeenCalled();
	});
});

describe('supersession', () => {
	it('ignores an earlier fetch that resolves AFTER a newer one', async () => {
		// The case that actually happens: a slider drag issues faster than a worker answers. The older
		// request usually carries the WIDER result set, so letting it land re-enables chips the user
		// just filtered away.
		const gates = [deferred(), deferred()];
		let call = 0;
		const { source } = asyncSource(async () => gates[call++]?.promise ?? Promise.resolve(bundleWithCount(0)));
		const onBundle = vi.fn();
		const fetcher = createBundleFetcher(source, { onBundle });

		fetcher.request(QUERY);
		fetcher.request(QUERY);

		gates[1]?.resolve(bundleWithCount(2));
		gates[0]?.resolve(bundleWithCount(500));
		await flush();

		expect(onBundle).toHaveBeenCalledTimes(1);
		expect(onBundle).toHaveBeenCalledWith(bundleWithCount(2));
	});

	it('still settles a superseded fetch', async () => {
		// Suppressing the RESULT is not the same as pretending the work never happened. A superseded
		// fetch that never settles leaves its captured version unresolved forever.
		const gates = [deferred(), deferred()];
		let call = 0;
		const versions = [10, 20];
		let versionCall = 0;
		const { source } = asyncSource(async () => gates[call++]?.promise ?? Promise.resolve(bundleWithCount(0)));
		const onSettled = vi.fn();
		const fetcher = createBundleFetcher(source, {
			captureVersion: () => versions[versionCall++] ?? 0,
			onBundle: vi.fn(),
			onSettled,
		});

		fetcher.request(QUERY);
		fetcher.request(QUERY);

		gates[0]?.resolve(bundleWithCount(500));
		gates[1]?.resolve(bundleWithCount(2));
		await flush();

		expect(onSettled.mock.calls.flat().sort((a, b) => a - b)).toEqual([10, 20]);
	});

	it('does not treat a superseded fetch as an error', async () => {
		// Supersession is routine, not a failure. Routing it through `onError` would spam the console
		// on every slider drag and train whoever reads those logs to ignore the real ones.
		const gates = [deferred(), deferred()];
		let call = 0;
		const { source } = asyncSource(async () => gates[call++]?.promise ?? Promise.resolve(bundleWithCount(0)));
		const onError = vi.fn();
		const fetcher = createBundleFetcher(source, { onBundle: vi.fn(), onError });

		fetcher.request(QUERY);
		fetcher.request(QUERY);
		gates[0]?.resolve(bundleWithCount(500));
		gates[1]?.resolve(bundleWithCount(2));
		await flush();

		expect(onError).not.toHaveBeenCalled();
	});
});

describe('dispose', () => {
	it('suppresses a bundle that arrives after teardown', async () => {
		const gate = deferred();
		const { source } = asyncSource(async () => gate.promise);
		const onBundle = vi.fn();
		const fetcher = createBundleFetcher(source, { onBundle });

		fetcher.request(QUERY);
		fetcher.dispose();
		gate.resolve(bundleWithCount(9));
		await flush();

		expect(onBundle).not.toHaveBeenCalled();
	});

	it('still settles a fetch that was in flight at teardown', async () => {
		// A route can unmount mid-round-trip, and the busy tracker outlives the route: it is a module
		// singleton per dataset. Not settling here strands the indicator for the NEXT visit.
		const gate = deferred();
		const { source } = asyncSource(async () => gate.promise);
		const onSettled = vi.fn();
		const fetcher = createBundleFetcher(source, { captureVersion: () => 4, onBundle: vi.fn(), onSettled });

		fetcher.request(QUERY);
		fetcher.dispose();
		gate.resolve(bundleWithCount(9));
		await flush();

		expect(onSettled).toHaveBeenCalledWith(4);
	});

	it('ignores requests made after disposal', () => {
		const applyFiltersAndQuery = vi.fn(() => bundleWithCount(1));
		const fetcher = createBundleFetcher(syncSource(applyFiltersAndQuery), { onBundle: vi.fn() });

		fetcher.dispose();
		fetcher.request(QUERY);

		expect(applyFiltersAndQuery).not.toHaveBeenCalled();
	});

	it('is idempotent', () => {
		const fetcher = createBundleFetcher(syncSource(() => bundleWithCount(1)), { onBundle: vi.fn() });

		fetcher.dispose();

		expect(() => {
			fetcher.dispose();
		}).not.toThrow();
	});
});

describe('version capture', () => {
	it('captures BEFORE the round trip, not on resolve', async () => {
		// The version records what the user had already asked for when this fetch began. Capturing on
		// resolve would fold in every action taken DURING the round trip and clear the indicator for
		// work not yet reflected in any bundle — the indicator would blink off mid-drag.
		const gate = deferred();
		const { source } = asyncSource(async () => gate.promise);
		let userActionVersion = 1;
		const onSettled = vi.fn();

		createBundleFetcher(source, { captureVersion: () => userActionVersion, onBundle: vi.fn(), onSettled }).request(QUERY);

		userActionVersion = 99;
		gate.resolve(bundleWithCount(1));
		await flush();

		expect(onSettled).toHaveBeenCalledWith(1);
	});

	it('works with no busy tracker wired up at all', () => {
		// Both callbacks are optional and travel together. A vertical without a busy indicator supplies
		// neither, and must not crash on the optional call.
		const onBundle = vi.fn();

		expect(() => {
			createBundleFetcher(syncSource(() => bundleWithCount(1)), { onBundle }).request(QUERY);
		}).not.toThrow();
		expect(onBundle).toHaveBeenCalledTimes(1);
	});
});
