/**
 * Applying a smart-filter preset REPLACES the manual filters, in the panel as a whole.
 *
 * @remarks
 * The preset row writes through the shared `commitSmartFilterSelection`, which clears every flat
 * facet rule before it sets the expression; each facet section then adopts its own rule's removal.
 * `wine-domain/commit.test.ts` pins the helper's call order over a fake. This suite pins what a user
 * sees over a real engine: the manual chip goes out, only the expression is left, and the action is
 * marked busy on the click's own frame.
 *
 * It also pins the way back out of a RESTORED preset. `loadConfig` registers a restored preset's leaves
 * as flat rules under minted ids, so "Clear smart filters" has to drop those too, or they would start
 * filtering the moment the expression went, with no chip on screen to explain them.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { createFilterEngine, type FilterEngine, inSet } from '@filter-enginez/core';
import {
	buildSmartFilterExpression,
	deriveSelectedPresetIds,
	type PickerTreeNode,
	wineBusyCore,
	type WineChipVocabularies,
} from '@filter-enginez/examples-shared/wine-domain';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import WineFilterPanel from './WineFilterPanel.svelte';

/** A tiny corpus; the presets only need something to filter. */
const ROWS = [
	{ abv: 14.5, body: 'full', color: 'red', id: 'a', originId: 'France', points: 93, priceUsd: 40, sweetness: 'dry', varietal: 'Cabernet Sauvignon', vintage: 2018 },
	{ abv: 12, body: 'light', color: 'white', id: 'b', originId: 'France', points: 88, priceUsd: 22, sweetness: 'dry', varietal: 'Pinot Grigio', vintage: 2021 },
	{ abv: 13, body: 'medium', color: 'red', id: 'c', originId: 'France', points: 90, priceUsd: 30, sweetness: 'dry', varietal: 'Pinot Noir', vintage: 2019 },
];

const VOCABULARIES: WineChipVocabularies = { body: [], color: ['red', 'white'], sweetness: [], varietal: []};
const ORIGIN_TREE: PickerTreeNode = { children: [{ id: 'France', label: 'France' }], id: 'world', label: 'World' };

// No auto-cleanup in this workspace, so trees would otherwise accumulate across tests.
afterEach(cleanup);

/**
 * Mount the panel over a main-thread engine, seeded before mount the way a `?f` restore leaves it.
 *
 * @param seed - Applies the pre-existing engine state.
 * @returns The rendered result plus the engine core.
 */
function renderPanel(seed: (core: FilterEngine<Wine>) => void = () => undefined) {
	const core = createFilterEngine<Wine>({ sourceData: ROWS as unknown as Wine[] });

	seed(core);

	const view = render(WineFilterPanel, {
		props: { engine: createSignalsEngine(core), originSpecs: [], originTree: ORIGIN_TREE, vocabularies: VOCABULARIES },
	});

	return { ...view, core };
}

describe('<WineFilterPanel> — a preset replaces the manual filters', () => {
	it('leaves only the expression, and the facet section adopts the removal', async () => {
		const { core, getByRole } = renderPanel((seeded) => {
			seeded.addRule('color', inSet<string>('color', ['white']));
		});

		await waitFor(() => {
			expect(getByRole('button', { name: 'white' }).getAttribute('aria-pressed')).toBe('true');
		});
		await fireEvent.click(getByRole('button', { name: 'Bold reds' }));

		expect([...core.getRules().keys()]).toEqual([]);
		expect(deriveSelectedPresetIds(core.getExpression())).toEqual(['bold-reds']);
		await waitFor(() => {
			expect(getByRole('button', { name: 'white' }).getAttribute('aria-pressed')).toBe('false');
		});
	});

	it('marks the action busy when a preset is applied', async () => {
		const { getByRole } = renderPanel();

		wineBusyCore.markResolvedAtLeast(wineBusyCore.captureCurrentVersion());
		expect(wineBusyCore.getIsEngineBusy()).toBe(false);

		await fireEvent.click(getByRole('button', { name: 'Bold reds' }));

		expect(wineBusyCore.getIsEngineBusy()).toBe(true);
	});

	it('"Clear smart filters" on a restored preset leaves no rule behind to keep filtering', async () => {
		const donor = createFilterEngine<Wine>({ sourceData: ROWS as unknown as Wine[] });

		donor.setExpression(buildSmartFilterExpression(['pinot-any']));

		const { core, getByRole } = renderPanel((seeded) => {
			seeded.loadConfig(donor.exportConfig());
		});

		expect(core.getRules().size).toBeGreaterThan(0);
		await fireEvent.click(getByRole('button', { name: 'Clear smart filters' }));

		expect(core.getExpression()).toBeNull();
		expect(core.getRules().size).toBe(0);
		expect(core.getResultCount()).toBe(ROWS.length);
	});
});
