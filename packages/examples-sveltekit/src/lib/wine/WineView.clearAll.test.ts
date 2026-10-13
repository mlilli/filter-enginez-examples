/**
 * Component-level guard for `/wine-server` "Clear all": over the DEBOUNCED, server-backed engine the
 * header's active-filter chips must clear on a clear-all, not only on the per-chip ×. The unit test in
 * `serverEngine.test.ts` pins the transport's event coalescing; this drives the whole `<WineView>` →
 * header wiring the user actually touches, so a regression anywhere along
 * chip → engine → `activeRules` → chip-removal shows up here.
 *
 * @remarks
 * Deliberately built over `createHttpFilterEngine` + `createSignalsEngineFromAsync` (a stubbed-`fetch`
 * stand-in for `/wine-server`), NOT a main-thread engine: the failure ONLY reproduces on the debounced
 * async tier, where a clear-all's `removeRule × N` + `setExpression(null)` burst coalesces to one
 * delivered event. A main-thread engine emits each event separately and would pass regardless.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { FALLBACK_BOUNDS, type PickerTreeNode, type WineChipVocabularies } from '@filter-enginez/examples-shared/wine-domain';
import { createHttpFilterEngine } from '@filter-enginez/examples-shared/wine-server-core';
import { createSignalsEngineFromAsync } from '@filter-enginez/reactive-signals/worker';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WineView from './WineView.svelte';

/** A tiny wine corpus — only the fields `<WineCard>` + the chip vocab touch, in the wire (JSON) shape. */
const CORPUS = [
	{ abv: 13.5, body: 'Full', color: 'red', designation: '', id: 'w1', name: 'One', origin: { country: 'France', province: 'Bordeaux', region: '', subregion: '' }, originId: 'France', points: 92, priceUsd: 40, sweetness: 'Dry', tastingNotes: [], varietal: 'Merlot', vintage: 2018, winery: 'Chateau One' },
	{ abv: 12, body: 'Light', color: 'white', designation: '', id: 'w2', name: 'Two', origin: { country: 'France', province: 'Burgundy', region: '', subregion: '' }, originId: 'France', points: 88, priceUsd: 22, sweetness: 'Off-dry', tastingNotes: [], varietal: 'Chardonnay', vintage: 2020, winery: 'Domaine Two' },
];

/** Chip vocabularies passed to the panel (the color group is the one the test toggles). */
const VOCABULARIES: WineChipVocabularies = { body: [], color: ['red', 'white'], sweetness: [], varietal: []};

/** A minimal, valid origin tree so the picker renders without a real hierarchy. */
const ORIGIN_TREE: PickerTreeNode = { children: [], id: 'world', label: 'World' };

beforeEach(() => {
	vi.stubGlobal('fetch', vi.fn(async (url: string) => {
		const path = String(url);
		const respond = (payload: unknown): Response => new Response(JSON.stringify(payload), { status: 200 });

		if (path.includes('/corpus/')) {
			return Promise.resolve(respond({ dataset: 'wine', records: CORPUS }));
		}

		// `/query`: the active-filter chips derive from the engine's rules, not this payload, so a static
		// response is enough — it only needs to not error.
		return Promise.resolve(respond({ chipGroups: [], fields: [], matched: CORPUS.length, resultIndices: [0, 1]}));
	}));
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('<WineView> over a server-backed engine — clear all', () => {
	it('clearing all filters removes the header active-filter chips', async () => {
		// Small debounce (not 0): the clear-all burst must still coalesce, which is the whole point.
		const engine = await createSignalsEngineFromAsync<Wine>(createHttpFilterEngine<Wine>({ dataset: 'wine', debounceMs: 20 }));

		const { container, getByRole } = render(WineView, {
			props: {
				baselines: FALLBACK_BOUNDS,
				// This harness stands in for `/wine-server`, so it passes that route's comparison target.
				compareDataset: 'wine-server',
				engine,
				originSpecs: [],
				originTree: ORIGIN_TREE,
				vocabularies: VOCABULARIES,
			},
		});

		// Toggle the "red" color chip → an active-filter pill appears in the results header.
		await fireEvent.click(getByRole('button', { name: 'red' }));
		await waitFor(() => {
			expect(container.querySelectorAll('.fe-filter-chip').length).toBeGreaterThan(0);
		});

		// Clear all → the header pills MUST disappear (the failure mode: they survive on the debounced
		// server tier if the coalesced burst delivers only an `expression` event, which never refreshes rules).
		await fireEvent.click(getByRole('button', { name: 'Clear all' }));
		await waitFor(() => {
			expect(container.querySelectorAll('.fe-filter-chip')).toHaveLength(0);
		});

		engine.dispose();
	});
});
