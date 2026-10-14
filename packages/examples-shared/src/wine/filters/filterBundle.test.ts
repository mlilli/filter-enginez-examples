/**
 * Tests for the wine panel's pure bundle helpers.
 *
 * @remarks
 * These cover the three exported functions that are pure data transforms rather than hooks:
 * `buildOriginNodeSpecs`, `bundleHistogramToBuckets`, and (from `filterConfig`) `sameSelection`.
 * They are worth testing precisely because they are invisible from the outside — a wrong
 * `heightFraction` renders a plausible-looking histogram with the wrong bar heights, and a wrong
 * `inSelection` dims the wrong bars. Neither would fail a typecheck, a lint, or an e2e smoke test.
 *
 * Both React apps use this one shared surface, so these tests cover it once for both.
 */

import type { PickerTreeNode } from '@filter-enginez/react-ui';

import { createFilterEngine } from '@filter-enginez/core';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { buildOriginNodeSpecs, bundleHistogramToBuckets } from './filterBundle.js';
import { FALLBACK_BOUNDS, sameSelection, useBaselineBounds } from './filterConfig.js';

/** A two-country origin tree, one with nested subregions, mirroring the real picker's shape. */
const ORIGIN_TREE: PickerTreeNode = {
	children: [
		{
			children: [
				{ id: 'IT-PIE', label: 'Piedmont' },
				{ children: [{ id: 'IT-VEN-VAL', label: 'Valpolicella' }], id: 'IT-VEN', label: 'Veneto' },
			],
			id: 'IT',
			label: 'Italy',
		},
		{ children: [{ id: 'FR-BOR', label: 'Bordeaux' }], id: 'FR', label: 'France' },
	],
	id: 'origin',
	label: 'Origin',
};

/** Build a histogram in the typed-array shape the engine bundle returns. */
function histogram(counts: readonly number[], edges: readonly number[]): {
	bucketEdges: Float64Array;
	counts: Uint32Array;
} {
	return { bucketEdges: Float64Array.from(edges), counts: Uint32Array.from(counts) };
}

describe('buildOriginNodeSpecs', () => {
	it('gives each node its own id and every id beneath it, so selecting a country implies its regions', () => {
		const byValue = new Map(buildOriginNodeSpecs(ORIGIN_TREE).map((s) => [s.value, s.leafIds]));

		// Italy's set includes the subregion two levels down, not just its direct children — and the
		// intermediate ids too, which wines whose origin stops at that level carry.
		expect(new Set(byValue.get('IT'))).toEqual(new Set(['IT', 'IT-PIE', 'IT-VEN', 'IT-VEN-VAL']));
		expect(byValue.get('FR')).toEqual(['FR', 'FR-BOR']);
	});

	it('gives a leaf a single-element set — the shape the bundle expects', () => {
		const byValue = new Map(buildOriginNodeSpecs(ORIGIN_TREE).map((s) => [s.value, s.leafIds]));

		expect(byValue.get('IT-PIE')).toEqual(['IT-PIE']);
		expect(byValue.get('FR-BOR')).toEqual(['FR-BOR']);
	});

	it('treats an intermediate node as both a node and a parent', () => {
		// Veneto has a child, so it is not a leaf — but it must still be selectable, carrying its
		// own descendants. Getting this wrong makes mid-tree nodes permanently unselectable.
		const byValue = new Map(buildOriginNodeSpecs(ORIGIN_TREE).map((s) => [s.value, s.leafIds]));

		expect(byValue.get('IT-VEN')).toEqual(['IT-VEN', 'IT-VEN-VAL']);
	});

	it('excludes the synthetic root, which is not a selectable node', () => {
		expect(buildOriginNodeSpecs(ORIGIN_TREE).map((s) => s.value)).not.toContain('origin');
	});

	it('returns nothing for a childless tree', () => {
		expect(buildOriginNodeSpecs({ id: 'origin', label: 'Origin' })).toEqual([]);
	});
});

describe('bundleHistogramToBuckets', () => {
	it('is re-exported from this module, and is the same function', () => {
		// The behavior is tested once, in `filter-bundle/bundleReaders.test.ts`, where the function
		// lives. What this module owes a test is that its re-export RESOLVES, since wine's two React sections import the
		// function from here and a broken hop is a runtime error no typecheck sees.
		const buckets = bundleHistogramToBuckets(histogram([1, 3], [0, 50, 100]), 0, 100);

		expect(buckets.map((bucket) => bucket.heightFraction)).toEqual([1 / 3, 1]);
	});
});

describe('sameSelection', () => {
	it('is true for the same reference', () => {
		const a = ['red', 'white'];

		expect(sameSelection(a, a)).toBe(true);
	});

	it('is true for equal contents in the same order', () => {
		expect(sameSelection(['red', 'white'], ['red', 'white'])).toBe(true);
	});

	it('is ORDER-SENSITIVE, unlike the membership check the other panels use', () => {
		// Deliberate: this guards the optimistic re-sync, where a reordering IS a change worth
		// re-rendering for. Do not "fix" it into set equality without checking those call sites.
		expect(sameSelection(['red', 'white'], ['white', 'red'])).toBe(false);
	});

	it('is false when lengths differ', () => {
		expect(sameSelection(['red'], ['red', 'white'])).toBe(false);
		expect(sameSelection([], ['red'])).toBe(false);
	});

	it('is true for two empty selections', () => {
		expect(sameSelection([], [])).toBe(true);
	});
});

describe('useBaselineBounds', () => {
	/**
	 * Render the hook over an engine holding `rows`.
	 *
	 * @param rows - The corpus the engine boots with.
	 * @returns The hook result for the price slider.
	 */
	function boundsOver(rows: readonly unknown[]): { max: number; min: number } {
		const engine = createSignalsEngine(createFilterEngine({ sourceData: [...rows]}));
		const wrapper = ({ children }: { children: ReactNode }): React.ReactElement =>
			createElement(FilterEngineProvider, { children, engine });

		return renderHook(() => useBaselineBounds('price'), { wrapper }).result.current;
	}

	it('falls back to the placeholder bounds before the corpus arrives', () => {
		// The wine engine boots asynchronously (worker + streamed corpus), so the panel mounts against an
		// EMPTY engine for the first frames. Deriving over zero values yields a degenerate single-point
		// range, which renders as a slider whose handles sit on top of each other and cannot be dragged.
		expect(boundsOver([])).toEqual(FALLBACK_BOUNDS.price);
	});

	it('derives real bounds once the corpus is present', () => {
		// And the fallback is a PLACEHOLDER, not a ceiling: a $650 bottle stays reachable even though
		// FALLBACK_BOUNDS.price caps at 400. Clamping here is what would quietly hide the expensive tail.
		const bounds = boundsOver([{ priceUsd: 12 }, { priceUsd: 650 }]);

		expect(bounds.max).toBeGreaterThanOrEqual(650);
		expect(bounds.min).toBeLessThanOrEqual(12);
	});
});
