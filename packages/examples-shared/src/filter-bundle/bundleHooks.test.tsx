/**
 * Tests for the bundle-consuming hooks: {@link useChipExclusion}, {@link useFieldBounds},
 * {@link useFieldHistogram} and {@link useToggleWouldBeEmpty}, plus `useFetchFilterBundle`'s async
 * branch.
 *
 * @remarks
 * `useFetchFilterBundle.test.tsx` covers the re-fetch KEYING (the render-loop hazard). This file
 * covers what the panels actually read out of the bundle.
 *
 * **Why every "no data yet" case is tested explicitly.** These hooks all run before the first bundle
 * resolves — the panel renders immediately, the bundle arrives a tick later. If any of them returned
 * something other than the documented empty value in that window, every chip in the panel would flash
 * disabled on mount, or a slider would render with a collapsed available zone. Returning `null` / an
 * empty `Map` is the contract, not an implementation detail.
 *
 * And the direction matters more than the values. A predictive-disable that wrongly says "available"
 * is a dead end the user walks into; one that wrongly says "unavailable" hides data they could have
 * reached. Both are silent — the UI looks completely normal either way.
 */

import { createFilterEngine, type FilterBundle, inSet } from '@filter-enginez/core';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useMemo } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import {
	FilterBundleContext,
	useChipExclusion,
	useFieldBounds,
	useFieldHistogram,
	useToggleWouldBeEmpty,
} from './index.js';

const rows = [
	{ id: 'a', kind: 'alpha', size: 10 },
	{ id: 'b', kind: 'beta', size: 20 },
	{ id: 'c', kind: 'alpha', size: 30 },
];

type Row = (typeof rows)[number];

afterEach(cleanup);

/**
 * Wrap a hook in a bundle context holding the supplied bundle.
 *
 * @remarks
 * The context value is MEMOIZED, matching both real providers (`RealEstateFilterPanel` and
 * `WineFilterPanel` each do `useMemo(() => ({ bundle }), [bundle])`). That is not incidental: the
 * consuming hooks memoize on the context object's identity, so a wrapper that built a fresh
 * `{ bundle }` each render would make the memoization look broken here while it works in production.
 * My first draft did exactly that and the stability test failed for the wrapper's reasons, not the
 * hook's.
 *
 * @param bundle - The bundle to publish, or `null` for the pre-resolution window.
 * @returns A React wrapper component.
 */
function withBundle(bundle: FilterBundle | null) {
	const Wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement => {
		const value = useMemo(() => ({ bundle }), []);

		return <FilterBundleContext value={value}>{children}</FilterBundleContext>;
	};

	return Wrapper;
}

/**
 * A bundle carrying one chip group and one field, with everything else empty.
 *
 * @param overrides - Partial bundle fields to merge in.
 * @returns A `FilterBundle`-shaped object.
 */
function makeBundle(overrides: Partial<FilterBundle> = {}): FilterBundle {
	return {
		chipGroups: [{
			candidates: [
				{ projectedCount: 2, value: 'alpha', wouldBeEmpty: false },
				{ projectedCount: 0, value: 'beta', wouldBeEmpty: true },
			],
			ruleId: 'kind',
		}],
		fields: [{
			bounds: { max: 30, min: 10 },
			fieldKey: 'size',
			histogram: { bucketEdges: [], counts: []},
			ruleId: 'size',
		}],
		resultCount: 2,
		resultIndices: new Uint32Array([0, 2]),
		...overrides,
	} as unknown as FilterBundle;
}

describe('useChipExclusion', () => {
	it('returns an empty map before the first bundle resolves', () => {
		// The mount window. A non-empty map here would flash every chip disabled on first paint.
		const { result } = renderHook(() => useChipExclusion('kind'), { wrapper: withBundle(null) });

		expect(result.current.size).toBe(0);
	});

	it('returns an empty map with no provider at all', () => {
		// A panel rendered outside the provider must degrade to "no predictive data", not throw. The
		// hooks are used by shared sections that some verticals mount without the bundle context.
		const { result } = renderHook(() => useChipExclusion('kind'));

		expect(result.current.size).toBe(0);
	});

	it('returns an empty map for a rule the query did not include', () => {
		// Not every facet is in every bundle query. A facet absent from the query must read as "no information",
		// which the controls treat as "all enabled" — never as "all disabled".
		const { result } = renderHook(() => useChipExclusion('not-queried'), { wrapper: withBundle(makeBundle()) });

		expect(result.current.size).toBe(0);
	});

	it('maps every candidate to its exclusion datum', () => {
		const { result } = renderHook(() => useChipExclusion('kind'), { wrapper: withBundle(makeBundle()) });

		expect(result.current.get('alpha')).toEqual({ projectedCount: 2, wouldBeEmpty: false });
		expect(result.current.get('beta')).toEqual({ projectedCount: 0, wouldBeEmpty: true });
	});

	it('returns a stable map across re-renders with the same context', () => {
		// The map feeds `ChipToggleGroup`'s props. A fresh Map each render would defeat memoization in
		// every chip of every group on every unrelated state change.
		const { rerender, result } = renderHook(() => useChipExclusion('kind'), { wrapper: withBundle(makeBundle()) });
		const first = result.current;

		rerender();

		expect(result.current).toBe(first);
	});
});

describe('useFieldBounds', () => {
	it('returns null before the first bundle resolves', () => {
		const { result } = renderHook(() => useFieldBounds('size'), { wrapper: withBundle(null) });

		expect(result.current).toBeNull();
	});

	it('returns null with no provider', () => {
		expect(renderHook(() => useFieldBounds('size')).result.current).toBeNull();
	});

	it('returns null for a field the query did not include', () => {
		const { result } = renderHook(() => useFieldBounds('not-queried'), { wrapper: withBundle(makeBundle()) });

		expect(result.current).toBeNull();
	});

	it('returns the filtered-except-self bounds', () => {
		const { result } = renderHook(() => useFieldBounds('size'), { wrapper: withBundle(makeBundle()) });

		expect(result.current).toEqual({ max: 30, min: 10 });
	});

	it.each([
		['min', { max: 30, min: null }],
		['max', { max: null, min: 10 }],
		['both', { max: null, min: null }],
	])('returns null when %s is null — an empty subset, not a zero-width range', (_label, bounds) => {
		// Null bounds mean NO current result occupies this field. Coercing that to `{min: 0, max: 0}`
		// would dim the entire slider track and read as "nothing is available anywhere", when the
		// honest answer is "no information — fall back to the baseline".
		const bundle = makeBundle({
			fields: [{ bounds, fieldKey: 'size', histogram: { bucketEdges: [], counts: []}, ruleId: 'size' }],
		} as unknown as Partial<FilterBundle>);
		const { result } = renderHook(() => useFieldBounds('size'), { wrapper: withBundle(bundle) });

		expect(result.current).toBeNull();
	});
});

describe('useFieldHistogram', () => {
	/**
	 * A bundle whose `size` field carries real buckets.
	 *
	 * @remarks
	 * {@link makeBundle}'s own field deliberately carries an EMPTY histogram, which is its own test case
	 * below — so a populated one has to be built explicitly rather than by tweaking the shared fixture.
	 *
	 * @returns The bundle.
	 */
	function withBuckets(): FilterBundle {
		return makeBundle({
			fields: [{
				bounds: { max: 30, min: 10 },
				fieldKey: 'size',
				histogram: { bucketEdges: Float64Array.from([10, 20, 30]), counts: Uint32Array.from([1, 3]) },
				ruleId: 'size',
			}],
		});
	}

	it.each([
		['before the first bundle resolves', withBundle(null), 'size'],
		['for a field the query did not include', withBundle(makeBundle()), 'not-queried'],
		['for a queried field that carried no buckets', withBundle(makeBundle()), 'size'],
	])('returns undefined %s', (_label, wrapper, ruleId) => {
		// Undefined and not `[]`, in all three cases: the sliders render an absent histogram as NO
		// overlay and an empty one as an overlay of nothing — a blank 38px band above the track. The
		// third case is the subtle one, since the field IS in the bundle; only its buckets are missing.
		expect(renderHook(() => useFieldHistogram(ruleId, 10, 30), { wrapper }).result.current).toBeUndefined();
	});

	it('returns undefined with no provider', () => {
		expect(renderHook(() => useFieldHistogram('size', 10, 30)).result.current).toBeUndefined();
	});

	it('reshapes the field histogram into normalized buckets', () => {
		const { result } = renderHook(() => useFieldHistogram('size', 10, 30), { wrapper: withBundle(withBuckets()) });

		expect(result.current?.map((bucket) => [bucket.bucketMin, bucket.bucketMax, bucket.count])).toEqual([
			[10, 20, 1],
			[20, 30, 3],
		]);
		// Normalized against the tallest bucket, which is what lets the slider render a height without
		// knowing the corpus scale.
		expect(result.current?.map((bucket) => bucket.heightFraction)).toEqual([1 / 3, 1]);
	});

	it('reflects the selection it is given', () => {
		const { result } = renderHook(() => useFieldHistogram('size', 10, 15), { wrapper: withBundle(withBuckets()) });

		expect(result.current?.map((bucket) => bucket.inSelection)).toEqual([true, false]);
	});

	it('returns a stable array across re-renders with the same context and selection', () => {
		// The array is a prop on every `<RangeSlider>`. A fresh one per render would re-run the bar
		// mapping in six sliders on every unrelated state change in the panel.
		const { rerender, result } = renderHook(() => useFieldHistogram('size', 10, 30), {
			wrapper: withBundle(withBuckets()),
		});
		const first = result.current;

		rerender();

		expect(result.current).toBe(first);
	});
});

describe('useToggleWouldBeEmpty', () => {
	/**
	 * Mount the hook over a real engine.
	 *
	 * @param rule - The candidate rule the toggle would add.
	 * @returns The render result plus the engine, so a test can mutate it.
	 */
	function mountToggle(rule: Parameters<typeof useToggleWouldBeEmpty>[0]) {
		const engine = createSignalsEngine(createFilterEngine<Row>({ sourceData: rows }));
		const view = renderHook(() => useToggleWouldBeEmpty<Row>(rule), {
			wrapper: ({ children }) => <FilterEngineProvider engine={engine}>{children}</FilterEngineProvider>,
		});

		return { engine, view };
	}

	it('is false while some current result passes the candidate rule', () => {
		const { view } = mountToggle(inSet<string>('kind', ['alpha']));

		expect(view.result.current).toBe(false);
	});

	it('is true when no current result passes it', () => {
		const { view } = mountToggle(inSet<string>('kind', ['nonexistent']));

		expect(view.result.current).toBe(true);
	});

	it('recomputes when a DIFFERENT facet narrows the results', () => {
		// The reason the hook subscribes to every engine change rather than to its own rule. Filtering
		// to `beta` leaves no `alpha` result, so an alpha toggle must become disabled — even though
		// nothing about the alpha rule itself changed.
		const { engine, view } = mountToggle(inSet<string>('kind', ['alpha']));

		expect(view.result.current).toBe(false);

		act(() => {
			engine.core.addRule('kind-filter', inSet<string>('kind', ['beta']));
		});

		expect(view.result.current).toBe(true);
	});

	it('becomes enabled again when the narrowing rule is removed', () => {
		const { engine, view } = mountToggle(inSet<string>('kind', ['alpha']));

		act(() => {
			engine.core.addRule('kind-filter', inSet<string>('kind', ['beta']));
		});
		act(() => {
			engine.core.removeRule('kind-filter');
		});

		expect(view.result.current).toBe(false);
	});
});
