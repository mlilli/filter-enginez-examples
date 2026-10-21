/**
 * Tests for the wine panel's bundle-consuming hooks and its async fetch path.
 *
 * @remarks
 * The wine demo is the **worker-backed** vertical: its 150k-row corpus lives behind Comlink, so this
 * panel's fetch takes the async branch that the main-thread books panel never touches. That branch
 * carries the busy indicator's contract as well as the bundle's, and the two interact in a way worth
 * pinning down.
 *
 * **`markResolvedAtLeast` runs on EVERY outcome** — resolved, cancelled, and failed. That looks like
 * over-signalling until you consider the alternative: a fetch that is cancelled or throws without
 * advancing the resolved version leaves `userActionVersion > resolvedVersion` forever, so the
 * "computing" indicator stays lit for the rest of the session with no further event able to clear it.
 * The user sees a permanently-spinning panel over perfectly correct results. Each of the three
 * outcomes is asserted separately here because each is a separate way to strand it.
 *
 * The reader hooks are asserted for their EMPTY answers as much as their populated ones. A missing
 * group must read as "no information" (all enabled) rather than "nothing available" — the wrong
 * default renders a panel where every chip is dimmed and the user cannot tell whether the corpus is
 * empty or the app is broken.
 */

import type { NumericBounds } from '@filter-enginez/react-ui';

import { createFilterEngine, type FilterBundle, inSet } from '@filter-enginez/core';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	type BundleContextValue,
	FilterBundleContext,
	useBundleChipExclusion,
	useBundleFieldMeta,
	useBundleOriginDisabledSet,
	useBundleSliderHistogram,
	useFetchFilterBundle,
} from './filterBundle.js';

afterEach(cleanup);

const baselines = {
	abv: { max: 20, min: 5 },
	points: { max: 100, min: 80 },
	price: { max: 500, min: 4 },
	vintage: { max: 2020, min: 1990 },
} as unknown as Record<'abv' | 'points' | 'price' | 'vintage', NumericBounds>;

/**
 * Wrap a subtree in a bundle context.
 *
 * @param bundle - The bundle the hooks will read, or `null` for the pre-fetch window.
 * @returns A wrapper component for `renderHook`.
 */
function withBundle(bundle: FilterBundle | null) {
	const value: BundleContextValue = { baselines, bundle };

	return ({ children }: { children: React.ReactNode }): React.ReactElement => (
		<FilterBundleContext value={value}>{children}</FilterBundleContext>
	);
}

/** A promise plus its resolver, so a test decides WHEN a fetch completes. */
function deferred(): { promise: Promise<FilterBundle>; resolve: (bundle: FilterBundle) => void } {
	let resolve!: (bundle: FilterBundle) => void;
	const promise = new Promise<FilterBundle>((res) => {
		resolve = res;
	});

	return { promise, resolve };
}

/**
 * A bundle reporting a recognizable result count.
 *
 * @param resultCount - The count this bundle reports.
 * @returns A `FilterBundle`-shaped stub.
 */
function bundleWithCount(resultCount: number): FilterBundle {
	return { chipGroups: [], fields: [], resultCount, resultIndices: new Uint32Array() };
}

/** A bundle carrying one chip group, one origin group and one field. */
function makeBundle(): FilterBundle {
	return {
		chipGroups: [
			{
				candidates: [
					{ projectedCount: 12, value: 'red', wouldBeEmpty: false },
					{ projectedCount: 0, value: 'rosé', wouldBeEmpty: true },
				],
				ruleId: 'color',
			},
			{
				candidates: [
					{ projectedCount: 4, value: 'IT', wouldBeEmpty: false },
					{ projectedCount: 0, value: 'FR-BOR', wouldBeEmpty: true },
				],
				ruleId: 'origin',
			},
		],
		fields: [{ bounds: { max: 90, min: 12 }, fieldKey: 'priceUsd', ruleId: 'price' }],
		resultCount: 12,
		resultIndices: new Uint32Array([0]),
	} as unknown as FilterBundle;
}

describe('useBundleChipExclusion', () => {
	it('maps a group\'s candidates to their exclusion data', () => {
		const { result } = renderHook(() => useBundleChipExclusion('color'), { wrapper: withBundle(makeBundle()) });

		expect(result.current.get('red')).toEqual({ projectedCount: 12, wouldBeEmpty: false });
		expect(result.current.get('rosé')).toEqual({ projectedCount: 0, wouldBeEmpty: true });
	});

	it('returns an empty map before the bundle arrives', () => {
		const { result } = renderHook(() => useBundleChipExclusion('color'), { wrapper: withBundle(null) });

		expect(result.current.size).toBe(0);
	});

	it('returns an empty map for a group the bundle does not carry', () => {
		// "No information", not "nothing available". Returning a map of all-disabled entries here would
		// dim every chip in the section during the first render window after boot.
		const { result } = renderHook(() => useBundleChipExclusion('body'), { wrapper: withBundle(makeBundle()) });

		expect(result.current.size).toBe(0);
	});

	it('returns an empty map with no provider at all', () => {
		const { result } = renderHook(() => useBundleChipExclusion('color'));

		expect(result.current.size).toBe(0);
	});
});

describe('useBundleFieldMeta', () => {
	it('finds a field by ruleId', () => {
		const { result } = renderHook(() => useBundleFieldMeta('price'), { wrapper: withBundle(makeBundle()) });

		expect(result.current?.bounds).toEqual({ max: 90, min: 12 });
	});

	it.each([
		['the bundle has not arrived', withBundle(null)],
		['there is no provider', undefined],
	])('returns null when %s', (_label, wrapper) => {
		const { result } = renderHook(() => useBundleFieldMeta('price'), wrapper ? { wrapper } : undefined);

		expect(result.current).toBeNull();
	});

	it('returns null for a field that was not part of the query', () => {
		// The slider falls back to its baseline bounds. A non-null empty object here would shade the
		// track as though nothing in the corpus were reachable.
		const { result } = renderHook(() => useBundleFieldMeta('abv'), { wrapper: withBundle(makeBundle()) });

		expect(result.current).toBeNull();
	});
});

describe('useBundleSliderHistogram', () => {
	const POINTS_BASELINE = { max: 100, min: 80 };

	it('returns the field\'s bars once the bundle carries its histogram', () => {
		const bundle = {
			chipGroups: [],
			fields: [
				{
					bounds: { max: 100, min: 80 },
					fieldKey: 'points',
					histogram: { bucketEdges: Float64Array.from([80, 90, 100]), counts: Uint32Array.from([3, 5]) },
					ruleId: 'points',
				},
			],
		} as unknown as FilterBundle;
		const { result } = renderHook(() => useBundleSliderHistogram('points', POINTS_BASELINE, 80, 100), {
			wrapper: withBundle(bundle),
		});

		expect(result.current?.map((bar) => bar.count)).toEqual([3, 5]);
	});

	it.each([
		['the bundle has not arrived', withBundle(null)],
		['there is no provider', undefined],
	])('returns undefined, not an empty bar list, when %s', (_label, wrapper) => {
		// `undefined` is what makes the slider skip its overlay; an empty list would draw an empty strip.
		const { result } = renderHook(
			() => useBundleSliderHistogram('points', POINTS_BASELINE, 80, 100),
			wrapper ? { wrapper } : undefined,
		);

		expect(result.current).toBeUndefined();
	});
});

describe('useBundleOriginDisabledSet', () => {
	it('collects only the nodes that would empty the results', () => {
		const { result } = renderHook(() => useBundleOriginDisabledSet(), { wrapper: withBundle(makeBundle()) });

		expect([...result.current]).toEqual(['FR-BOR']);
	});

	it.each([
		['the bundle has not arrived', withBundle(null)],
		['there is no provider', undefined],
	])('returns an empty set when %s', (_label, wrapper) => {
		const { result } = renderHook(() => useBundleOriginDisabledSet(), wrapper ? { wrapper } : undefined);

		expect(result.current.size).toBe(0);
	});

	it('returns an empty set when the bundle carries no origin group', () => {
		const bundle = { ...makeBundle(), chipGroups: []} as unknown as FilterBundle;
		const { result } = renderHook(() => useBundleOriginDisabledSet(), { wrapper: withBundle(bundle) });

		expect(result.current.size).toBe(0);
	});
});

const vocabularies = { body: ['full'], color: ['red'], sweetness: ['dry'], varietal: ['Merlot']};
const originSpecs = [{ depth: 0, label: 'Italy', leafIds: ['IT-PIE'], value: 'IT' }];

/** Render the fetched bundle's result count. */
const FetchHarness = (): React.ReactElement => {
	const bundle = useFetchFilterBundle(baselines, vocabularies, originSpecs);

	return <span data-testid="count">{bundle === null ? 'pending' : String(bundle.resultCount)}</span>;
};

/**
 * A signals engine exposing an `asyncEngine`, as the worker-backed wine tier does.
 *
 * @param applyFiltersAndQuery - The async fetch the hook will call.
 * @returns An engine the provider accepts.
 */
function workerBackedEngine(applyFiltersAndQuery: () => Promise<FilterBundle>): SignalsEngine<unknown> {
	const engine = createSignalsEngine(createFilterEngine({ sourceData: [{ id: 'w1' }]}));

	return { ...engine, asyncEngine: { applyFiltersAndQuery }} as unknown as SignalsEngine<unknown>;
}

describe('useFetchFilterBundle — the worker path', () => {
	it('renders the bundle the async engine resolves', async () => {
		const engine = workerBackedEngine(async () => Promise.resolve(makeBundle()));

		await act(async () => {
			await Promise.resolve();
			render(<FilterEngineProvider engine={engine}><FetchHarness /></FilterEngineProvider>);
		});

		expect(screen.getByTestId('count').textContent).toBe('12');
	});

	it('logs and recovers when the worker fetch rejects', async () => {
		// A rejected round-trip must not take the panel down: the previous bundle stays on screen and
		// the next engine event re-fetches. Silence would be worse than the error — a worker that has
		// died stops answering, and without the log there is nothing to attribute the staleness to.
		const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const engine = workerBackedEngine(async () => Promise.reject(new Error('worker gone')));

		await act(async () => {
			await Promise.resolve();
			render(<FilterEngineProvider engine={engine}><FetchHarness /></FilterEngineProvider>);
		});

		expect(screen.getByTestId('count').textContent).toBe('pending');
		expect(error).toHaveBeenCalledWith('[useFetchFilterBundle] worker fetch failed:', expect.any(Error));
		error.mockRestore();
	});

	it('discards an EARLIER fetch that resolves after a newer one', async () => {
		// The stale guard, asserted through what the user would see. A tear-down here means a newer query
		// is already in flight; letting the older resolution through replaces the newer, narrower answer
		// with the older, wider one — which reads as a filter that silently failed to apply.
		//
		// Asserting "no unmount warning" instead would prove nothing: React 19 dropped that warning, so
		// the test would pass with the guard deleted.
		const gates = [deferred(), deferred()];
		let call = 0;
		const engine = workerBackedEngine(async () => gates[call++]?.promise ?? Promise.resolve(makeBundle()));
		const { rerender } = render(<FilterEngineProvider engine={engine}><FetchHarness /></FilterEngineProvider>);

		// A rule mutation re-keys the effect: the first fetch is cancelled, a second is issued.
		await act(async () => {
			engine.core.addRule('probe', inSet<string>('id', ['w1']));
			await Promise.resolve();
		});
		rerender(<FilterEngineProvider engine={engine}><FetchHarness /></FilterEngineProvider>);

		// The NEWER fetch answers first, then the cancelled older one.
		await act(async () => {
			gates[1]?.resolve(bundleWithCount(2));
			gates[0]?.resolve(bundleWithCount(500));
			await Promise.all(gates.map(async (gate) => gate.promise));
		});

		expect(screen.getByTestId('count').textContent).toBe('2');
	});
});
