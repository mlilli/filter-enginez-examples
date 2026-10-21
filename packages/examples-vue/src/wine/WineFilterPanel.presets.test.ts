/**
 * Applying a smart-filter preset REPLACES the manual filters, in the Vue panel as a whole.
 *
 * @remarks
 * The same contract as SvelteKit's `WineFilterPanel.presets.test.ts` and React's
 * `WineFilterPanel.test.tsx`, over this panel: the preset row writes through the shared
 * `commitSmartFilterSelection`, the manual chip goes out on its own, only the expression is left, and
 * the action is marked busy on the click's own frame. "Clear smart filters" on a preset RESTORED from a
 * link, written today or by engine 0.0.3, gives back the full corpus: the restore registers none of the
 * preset's leaves, so nothing is left behind to keep filtering once the expression goes.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { createFilterEngine, type FilterEngine, type FilterEngineConfig, inSet } from '@filter-enginez/core';
import {
	buildSmartFilterExpression,
	deriveSelectedPresetIds,
	type PickerTreeNode,
	wineBusyCore,
	type WineChipVocabularies,
} from '@filter-enginez/examples-shared/wine-domain';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { type DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import WineFilterPanel from './WineFilterPanel.vue';

/** A tiny corpus; the presets only need something to filter. */
const ROWS = [
	{ abv: 14.5, body: 'full', color: 'red', id: 'a', originId: 'France', points: 93, priceUsd: 40, sweetness: 'dry', varietal: 'Cabernet Sauvignon', vintage: 2018 },
	{ abv: 12, body: 'light', color: 'white', id: 'b', originId: 'France', points: 88, priceUsd: 22, sweetness: 'dry', varietal: 'Pinot Grigio', vintage: 2021 },
	{ abv: 13, body: 'medium', color: 'red', id: 'c', originId: 'France', points: 90, priceUsd: 30, sweetness: 'dry', varietal: 'Pinot Noir', vintage: 2019 },
];

const VOCABULARIES: WineChipVocabularies = { body: [], color: ['red', 'white'], sweetness: [], varietal: []};
const ORIGIN_TREE: PickerTreeNode = { children: [{ id: 'France', label: 'France' }], id: 'world', label: 'World' };

/** Every wrapper mounted by a test, unmounted after it. */
const mounted: VueWrapper[] = [];

afterEach(() => {
	for (const wrapper of mounted.splice(0)) {
		wrapper.unmount();
	}
});

/**
 * Mount the panel over a main-thread engine, seeded before mount the way a `?f` restore leaves it.
 *
 * @param seed - Applies the pre-existing engine state.
 * @returns The wrapper plus the engine core.
 */
async function mountPanel(seed: (core: FilterEngine<Wine>) => void = () => undefined) {
	const core = createFilterEngine<Wine>({ sourceData: ROWS as unknown as Wine[] });

	seed(core);

	const wrapper = mount(WineFilterPanel, {
		attachTo: document.body,
		props: { engine: createSignalsEngine(core), originSpecs: [], originTree: ORIGIN_TREE, vocabularies: VOCABULARIES },
	});

	mounted.push(wrapper);
	await flushPromises();

	return { core, wrapper };
}

/**
 * The button whose visible text is exactly `label`.
 *
 * @param wrapper - The mounted panel.
 * @param label - The button text.
 * @returns The button.
 */
function button(wrapper: VueWrapper, label: string): DOMWrapper<HTMLButtonElement> {
	const found = wrapper.findAll('button').find((candidate) => candidate.text().trim() === label);

	if (found === undefined) {
		throw new Error(`No button labelled ${label}`);
	}

	return found;
}

describe('<WineFilterPanel> — a preset replaces the manual filters', () => {
	it('leaves only the expression, and the facet section adopts the removal', async () => {
		const { core, wrapper } = await mountPanel((seeded) => {
			seeded.addRule('color', inSet<string>('color', ['white']));
		});

		expect(button(wrapper, 'white').attributes('aria-pressed')).toBe('true');
		await button(wrapper, 'Bold reds').trigger('click');
		await flushPromises();

		expect([...core.getRules().keys()]).toEqual([]);
		expect(deriveSelectedPresetIds(core.getExpression())).toEqual(['bold-reds']);
		expect(button(wrapper, 'white').attributes('aria-pressed')).toBe('false');
	});

	it('marks the action busy when a preset is applied', async () => {
		const { wrapper } = await mountPanel();

		wineBusyCore.markResolvedAtLeast(wineBusyCore.captureCurrentVersion());
		expect(wineBusyCore.getIsEngineBusy()).toBe(false);

		await button(wrapper, 'Bold reds').trigger('click');

		expect(wineBusyCore.getIsEngineBusy()).toBe(true);
	});

	it.each([
		['a link written today', (config: FilterEngineConfig): FilterEngineConfig => config],
		['a link written by engine 0.0.3', (config: FilterEngineConfig): FilterEngineConfig => ({ ...config, rules: config.rules.map(({ id, rule }) => ({ id, rule })) })],
	])('"Clear smart filters" on a preset restored from %s gives back the full corpus', async (_label, link) => {
		const donor = createFilterEngine<Wine>({ sourceData: ROWS as unknown as Wine[] });

		donor.setExpression(buildSmartFilterExpression(['pinot-any']));

		const { core, wrapper } = await mountPanel((seeded) => {
			seeded.loadConfig(link(donor.exportConfig()));
		});

		expect(core.getRules().size).toBe(0);
		expect(deriveSelectedPresetIds(core.getExpression())).toEqual(['pinot-any']);
		await button(wrapper, 'Clear smart filters').trigger('click');

		expect(core.getExpression()).toBeNull();
		expect(core.getRules().size).toBe(0);
		expect(core.getResultCount()).toBe(ROWS.length);
	});
});
