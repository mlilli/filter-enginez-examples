/**
 * `WineBootStore.publish`: a booted engine reaches the view with the panel's first bundle already in the
 * store.
 *
 * @remarks
 * The view's own fetch loop asks for its first bundle only after it has rendered, so a view rendered
 * without one painted bare chips ("red") that widened a round trip later ("red (1)") and moved the chips
 * after them: a layout shift of up to 0.0007 at a desktop width wherever no prerendered snapshot covered
 * the boot. The store now fetches that bundle before it publishes the engine.
 *
 * The engine is a stand-in answering on the main thread; the worker boot before `publish` is not under
 * test here (this app's test builder cannot replace its module).
 */

import type { FilterBundle } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';
import type { RxJsEngine } from '@filter-enginez/reactive-rxjs';

import { FALLBACK_BOUNDS } from '@filter-enginez/examples-shared/wine-domain';
import { describe, expect, it } from 'vitest';

import { WineBootStore } from './wine-boot-store.js';
import { type WineFacets } from './wine-facets.js';

/** The first bundle the stand-in engine answers with. */
const FIRST_BUNDLE = {
	chipGroups: [{ candidates: [{ projectedCount: 1, value: 'red', wouldBeEmpty: false }], ruleId: 'color' }],
	fields: [],
	resultCount: 1,
	resultIndices: new Uint32Array([0]),
} as unknown as FilterBundle;

/** Facets for a one-color corpus. */
const FACETS = {
	baselines: FALLBACK_BOUNDS,
	originSpecs: [],
	originTree: null,
	vocabularies: { body: [], color: ['red'], sweetness: [], varietal: []},
} as unknown as WineFacets;

/** The corpus details the boot reports. */
const META = { bootMs: 12, source: 'default-tier', wineCount: 1 } as const;

/**
 * A stand-in engine that records whether the store had published it when it was asked for a bundle.
 *
 * @param store - The store under test.
 * @param answer - What a bundle query does.
 * @returns The engine, and what it saw.
 */
function engineFor(store: WineBootStore, answer: () => FilterBundle): { readonly engine: RxJsEngine<Wine>; readonly wasPublishedWhenAsked: boolean[] } {
	const wasPublishedWhenAsked: boolean[] = [];
	const engine = {
		core: {
			applyFiltersAndQuery: (): FilterBundle => {
				wasPublishedWhenAsked.push(store.engine() !== null);

				return answer();
			},
		},
	} as unknown as RxJsEngine<Wine>;

	return { engine, wasPublishedWhenAsked };
}

describe('WineBootStore.publish', () => {
	it('fetches the panel’s first bundle before it publishes the engine', async () => {
		const store = new WineBootStore();
		const { engine, wasPublishedWhenAsked } = engineFor(store, () => FIRST_BUNDLE);

		await store.publish(engine, FACETS, META);

		expect(wasPublishedWhenAsked).toEqual([false]);
		expect(store.bundle()).toBe(FIRST_BUNDLE);
		expect(store.engine()).toBe(engine);
		expect(store.isReady()).toBe(true);
	});

	it('publishes the engine without a bundle when the fetch fails: the view starts as it did', async () => {
		const store = new WineBootStore();
		const { engine } = engineFor(store, () => {
			throw new Error('worker gone');
		});

		await store.publish(engine, FACETS, META);

		expect(store.bundle()).toBeNull();
		expect(store.engine()).toBe(engine);
	});
});
