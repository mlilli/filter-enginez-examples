/**
 * Applying a smart-filter preset over an ASYNC engine must light the results-header chip.
 *
 * @remarks
 * The sibling of `WineView.clearAll.test.ts`, over the same stubbed-`fetch` stand-in for
 * `/wine-server`, and built for the same reason: this path only breaks on a tier where the engine's
 * state arrives back over a wire.
 *
 * **What it guards.** The panel's lit preset chips are a writable `$derived` over
 * `deriveSelectedPresetIds($expression)`, which keys presets by `rule.serialize()`. On the worker and
 * server tiers the expression arrives as a structured-clone COPY of the committed rule — the right
 * `.config`, no prototype — unless it is rehydrated; an un-rehydrated copy makes the derivation throw
 * `rule.serialize is not a function`, takes the whole panel's reactive graph down with it, and the
 * header chip never appears, on either wine route.
 *
 * `createAsyncMirrorRefreshers` rehydrates the expression through the rule registry, symmetrically
 * with the rules, and `createSignalsEngineFromAsync.test.ts` pins that. This test exists because that
 * unit test cannot see the consequence: a throw inside a Svelte derivation is not a failed assertion
 * anywhere, it is a panel that silently stops updating.
 *
 * The e2e specs cover the same path at 20 seconds of Playwright timeout per failure and a `pnpm dev`
 * server per route. This is the same coverage in 150ms.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { FALLBACK_BOUNDS, type PickerTreeNode, type WineChipVocabularies } from '@filter-enginez/examples-shared/wine-domain';
import { createHttpFilterEngine } from '@filter-enginez/examples-shared/wine-server-core';
import { createSignalsEngineFromAsync } from '@filter-enginez/reactive-signals/worker';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WineView from './WineView.svelte';

/** A tiny wine corpus in the wire (JSON) shape, matching `WineView.clearAll.test.ts`. */
const CORPUS = [
	{ abv: 13.5, body: 'Full', color: 'red', designation: '', id: 'w1', name: 'One', origin: { country: 'France', province: 'Bordeaux', region: '', subregion: '' }, originId: 'France', points: 92, priceUsd: 40, sweetness: 'Dry', tastingNotes: [], varietal: 'Merlot', vintage: 2018 },
	{ abv: 12, body: 'Light', color: 'white', designation: '', id: 'w2', name: 'Two', origin: { country: 'France', province: 'Burgundy', region: '', subregion: '' }, originId: 'France', points: 88, priceUsd: 22, sweetness: 'Off-dry', tastingNotes: [], varietal: 'Chardonnay', vintage: 2020 },
];

const VOCABULARIES: WineChipVocabularies = { body: [], color: ['red', 'white'], sweetness: [], varietal: []};
const ORIGIN_TREE: PickerTreeNode = { children: [], id: 'world', label: 'World' };

beforeEach(() => {
	vi.stubGlobal('fetch', vi.fn(async (url: string) => {
		const path = String(url);
		const respond = (payload: unknown): Response => new Response(JSON.stringify(payload), { status: 200 });

		if (path.includes('/corpus/')) {
			return Promise.resolve(respond({ dataset: 'wine', records: CORPUS }));
		}

		return Promise.resolve(respond({ chipGroups: [], fields: [], matched: CORPUS.length, resultIndices: [0, 1]}));
	}));
});

afterEach(() => {
	vi.unstubAllGlobals();
	cleanup();
});

describe('<WineView> over a server-backed engine — smart-filter presets', () => {
	it('applying a preset lights the results-header chip and the preset chip itself', async () => {
		const engine = await createSignalsEngineFromAsync<Wine>(createHttpFilterEngine<Wine>({ dataset: 'wine', debounceMs: 20 }));
		const { container, getByRole } = render(WineView, {
			props: { baselines: FALLBACK_BOUNDS, compareDataset: 'wine-server', engine, originSpecs: [], originTree: ORIGIN_TREE, vocabularies: VOCABULARIES },
		});

		// ── The server tier's Compare target, asserted here because this is the only unit-test
		// harness that renders `/wine-server`'s shape, and it is the ONLY side that can see the bug.
		//
		// A test on `/wine` cannot catch a hardcoded `dataset="wine"` — mutation-verified: hardcoding
		// the literal leaves the vanilla `/wine` case green, because `/wine`'s correct answer IS
		// `'wine'`. Only a render that passes `'wine-server'` can tell a threaded prop from a coincidence.
		//
		// It rides in this test rather than its own file to avoid a THIRD copy of the corpus / stubbed
		// -fetch harness these two files already share.
		expect(
			new URL(container.querySelector<HTMLAnchorElement>('a.fe-compare-link')?.href ?? '').searchParams.get('dataset'),
			'the server route offered the browser-tier comparison',
		).toBe('wine-server');

		// By name, not by position. The FIRST `.fe-chip` on the page happens to be a preset — the smart
		// filters render above the panel body — which is why five e2e specs named "toggling an InSet
		// filter" have in fact been clicking a preset all along. Naming it here says what is meant.
		await fireEvent.click(getByRole('button', { name: 'Bold reds' }));

		await waitFor(() => {
			expect(container.querySelectorAll('.fe-filter-chip').length).toBeGreaterThan(0);
		});

		// And the panel's own chip, which is the half that actually derives through the expression: the
		// header chip alone would still appear if `activePresets` were stuck empty.
		expect(getByRole('button', { name: 'Bold reds' }).getAttribute('aria-pressed')).toBe('true');

		engine.dispose();
	});
});
