/**
 * `<WineView>`'s `initialBundle`: the panel's chips show their projected counts from the view's first
 * frame when the route hands it the first bundle.
 *
 * @remarks
 * `/wine-server` swaps its server-rendered page for this view once the engine has booted. The view's own
 * fetch loop asks for its first bundle only after it has rendered, so without a bundle handed in, the
 * chips painted bare ("red") and widened a round trip later ("red (1)"), moving the chips after them: a
 * layout shift of 0.0004 at a desktop width. The route now fetches that bundle before the swap.
 *
 * Same stubbed-`fetch` server-backed engine as `WineView.clearAll.test.ts`: the `/query` stub answers
 * with no chip groups, so any count on screen right after the render came from `initialBundle`.
 *
 * @packageDocumentation
 */

import type { FilterBundle } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';

import { FALLBACK_BOUNDS, type PickerTreeNode, type WineChipVocabularies } from '@filter-enginez/examples-shared/wine-domain';
import { createHttpFilterEngine } from '@filter-enginez/examples-shared/wine-server-core';
import { createSignalsEngineFromAsync } from '@filter-enginez/reactive-signals/worker';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WineView from './WineView.svelte';

/** A tiny wine corpus, in the wire (JSON) shape. */
const CORPUS = [
	{ abv: 13.5, body: 'Full', color: 'red', designation: '', id: 'w1', name: 'One', origin: { country: 'France', province: 'Bordeaux', region: '', subregion: '' }, originId: 'France', points: 92, priceUsd: 40, sweetness: 'Dry', tastingNotes: [], varietal: 'Merlot', vintage: 2018, winery: 'Chateau One' },
	{ abv: 12, body: 'Light', color: 'white', designation: '', id: 'w2', name: 'Two', origin: { country: 'France', province: 'Burgundy', region: '', subregion: '' }, originId: 'France', points: 88, priceUsd: 22, sweetness: 'Off-dry', tastingNotes: [], varietal: 'Chardonnay', vintage: 2020, winery: 'Domaine Two' },
];

/** Only the color group, whose chips the cases read. */
const VOCABULARIES: WineChipVocabularies = { body: [], color: ['red', 'white'], sweetness: [], varietal: []};

/** A minimal origin tree. */
const ORIGIN_TREE: PickerTreeNode = { children: [], id: 'world', label: 'World' };

/** The first bundle a route would hand in: one wine of each color. */
const FIRST_BUNDLE: FilterBundle = {
	chipGroups: [
		{
			candidates: [
				{ projectedCount: 1, value: 'red', wouldBeEmpty: false },
				{ projectedCount: 1, value: 'white', wouldBeEmpty: false },
			],
			ruleId: 'color',
		},
	],
	fields: [],
	resultCount: CORPUS.length,
	resultIndices: new Uint32Array([0, 1]),
};

beforeEach(() => {
	vi.stubGlobal('fetch', vi.fn(async (url: string) => {
		const respond = (payload: unknown): Response => new Response(JSON.stringify(payload), { status: 200 });

		return Promise.resolve(String(url).includes('/corpus/')
			? respond({ dataset: 'wine', records: CORPUS })
			: respond({ chipGroups: [], fields: [], matched: CORPUS.length, resultIndices: [0, 1]}));
	}));
});

afterEach(() => {
	vi.unstubAllGlobals();
	cleanup();
});

/**
 * Render the view over a fresh server-backed engine.
 *
 * @param initialBundle - The bundle handed in, if any.
 * @returns The render's container.
 */
async function renderView(initialBundle?: FilterBundle): Promise<HTMLElement> {
	const engine = await createSignalsEngineFromAsync<Wine>(createHttpFilterEngine<Wine>({ dataset: 'wine', debounceMs: 20 }));
	const { container } = render(WineView, {
		props: {
			baselines: FALLBACK_BOUNDS,
			compareDataset: 'wine-server',
			engine,
			...(initialBundle === undefined ? {} : { initialBundle }),
			originSpecs: [],
			originTree: ORIGIN_TREE,
			vocabularies: VOCABULARIES,
		},
	});

	return container;
}

describe('<WineView> initialBundle', () => {
	it('shows the chips’ projected counts in the first render', async () => {
		const container = await renderView(FIRST_BUNDLE);
		const counts = [...container.querySelectorAll('.fe-chip__count')].map((count) => count.textContent.trim());

		expect(counts).toEqual(['(1)', '(1)']);
	});

	it('renders bare chips without one, as before: the counts wait for the first round trip', async () => {
		const container = await renderView();

		expect(container.querySelectorAll('.fe-chip__count')).toHaveLength(0);
	});
});
