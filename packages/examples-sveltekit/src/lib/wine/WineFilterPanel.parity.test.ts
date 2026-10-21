/**
 * The wine panel's controls behave and read as in every other app's wine panel.
 *
 * @remarks
 * What is pinned here is what the shared `wine-domain` copy and rules decide, wired through this
 * app's sections: the two searches commit through the typeahead contract and REMOVE their rule when
 * emptied; a search that is only blurred writes nothing and marks nothing busy; the slider thumbs are
 * named from `WINE_SLIDER_COPY`; the price slider's top commits an open maximum; the single-color
 * menu lists colors in the design order; and the origin tree is named and sized from
 * `WINE_ORIGIN_TREE`.
 *
 * **A main-thread engine**, as in `WineFilterPanel.seed.test.ts`: what is under test is what each
 * control writes, which does not depend on the tier.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { createFilterEngine, fuzzy, type RangeRule } from '@filter-enginez/core';
import {
	buildOriginNodeSpecs,
	FALLBACK_BOUNDS,
	type PickerTreeNode,
	WINE_ORIGIN_TREE,
	WINE_SEARCHES,
	WINE_SLIDER_COPY,
	type WineChipVocabularies,
	wineSearchRule,
} from '@filter-enginez/examples-shared/wine-domain';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureCurrentVersion } from './wineBusy.js';
import WineFilterPanel from './WineFilterPanel.svelte';

/** Rows carrying only the fields the panel's rules touch. */
const ROWS = [
	{ abv: 13.5, color: 'white', description: 'citrus and oak', id: 'a', originId: 'France|Bordeaux', points: 92, priceUsd: 40, varietal: 'Chardonnay', vintage: 2018, winery: 'Vandermark' },
	{ abv: 12, color: 'red', description: 'cherry and tannin', id: 'b', originId: 'Italy|Tuscany', points: 88, priceUsd: 22, varietal: 'Sangiovese', vintage: 2020, winery: 'Caruso' },
];

/** The colors the corpus carries, deliberately NOT in the design order. */
const VOCABULARIES: WineChipVocabularies = {
	body: [],
	color: ['white', 'sparkling', 'red'],
	sweetness: [],
	varietal: ['Chardonnay', 'Sangiovese'],
};

/** A two-country origin hierarchy. */
const ORIGIN_TREE: PickerTreeNode = {
	children: [
		{ children: [{ id: 'France|Bordeaux', label: 'Bordeaux' }], id: 'France', label: 'France' },
		{ children: [{ id: 'Italy|Tuscany', label: 'Tuscany' }], id: 'Italy', label: 'Italy' },
	],
	id: 'world',
	label: 'World',
};

afterEach(() => {
	// Not automatic in this app's vitest setup.
	cleanup();
	vi.restoreAllMocks();
});

/**
 * Mount the panel over a fresh engine, optionally seeded.
 *
 * @param seed - Rules to put on the engine before the panel mounts.
 * @returns The rendered panel and the engine.
 */
function renderPanel(seed?: (engine: SignalsEngine<Wine>) => void): { readonly engine: SignalsEngine<Wine> } & ReturnType<typeof render<typeof WineFilterPanel>> {
	const engine = createSignalsEngine(createFilterEngine<Wine>({ sourceData: ROWS as unknown as Wine[] }));

	seed?.(engine);

	const view = render(WineFilterPanel, {
		props: { engine, originSpecs: buildOriginNodeSpecs(ORIGIN_TREE), originTree: ORIGIN_TREE, vocabularies: VOCABULARIES },
	});

	return { ...view, engine };
}

describe.each([
	['notes', WINE_SEARCHES.notes.ariaLabel],
	['winery', WINE_SEARCHES.winery.ariaLabel],
] as const)('the %s search', (ruleId, ariaLabel) => {
	it('writes once for Enter and the blur that follows it', async () => {
		const { engine, getByLabelText } = renderPanel();
		const addRule = vi.spyOn(engine.core, 'addRule');
		const field = getByLabelText(ariaLabel) as HTMLInputElement;

		field.focus();
		await fireEvent.input(field, { target: { value: ' oak ' }});
		await fireEvent.keyDown(field, { key: 'Enter' });
		await fireEvent.blur(field);

		expect(addRule).toHaveBeenCalledOnce();
		expect(engine.core.getRules().get(ruleId)?.config).toEqual(wineSearchRule(ruleId, 'oak').config);
	});

	it('writes nothing, and marks nothing busy, when an untouched empty field is blurred', async () => {
		// A write that changes nothing emits no change, so a busy mark for it would never clear: the
		// "computing" indicator would stay lit.
		const { engine, getByLabelText } = renderPanel();
		const addRule = vi.spyOn(engine.core, 'addRule');
		const removeRule = vi.spyOn(engine.core, 'removeRule');
		const versionBefore = captureCurrentVersion();
		const field = getByLabelText(ariaLabel) as HTMLInputElement;

		field.focus();
		await fireEvent.blur(field);

		expect(addRule).not.toHaveBeenCalled();
		expect(removeRule).not.toHaveBeenCalled();
		expect(captureCurrentVersion()).toBe(versionBefore);
	});

	it('removes its rule when emptied, rather than writing an empty one', async () => {
		const { engine, getByLabelText } = renderPanel((seeded) => {
			seeded.core.addRule(ruleId, fuzzy(WINE_SEARCHES[ruleId].field, { query: 'oak', threshold: 0.4 }));
		});
		const addRule = vi.spyOn(engine.core, 'addRule');
		const field = getByLabelText(ariaLabel) as HTMLInputElement;

		expect(field.value).toBe('oak');

		await fireEvent.input(field, { target: { value: '' }});
		await fireEvent.blur(field);

		expect(addRule).not.toHaveBeenCalled();
		expect(engine.core.getRules().has(ruleId)).toBe(false);
	});

	it('shows a query an external change put on the engine', async () => {
		const { engine, getByLabelText } = renderPanel();
		const field = getByLabelText(ariaLabel) as HTMLInputElement;

		engine.core.addRule(ruleId, wineSearchRule(ruleId, 'tannin'));
		await tick();

		expect(field.value).toBe('tannin');

		engine.core.clearRules();
		await tick();

		expect(field.value).toBe('');
	});
});

describe('the wine sliders', () => {
	it('name their thumbs from the shared slider copy', () => {
		const { getByRole } = renderPanel();

		for (const { sliderLabel } of Object.values(WINE_SLIDER_COPY)) {
			expect(getByRole('slider', { name: `${sliderLabel} lower bound` })).toBeTruthy();
			expect(getByRole('slider', { name: `${sliderLabel} upper bound` })).toBeTruthy();
		}
	});

	it('commit an open maximum when the price slider\'s top thumb is at the top', async () => {
		const { engine, getByLabelText, getByRole } = renderPanel();

		await fireEvent.input(getByLabelText(`${WINE_SLIDER_COPY.price.label} lower bound (editable)`), {
			target: { value: '30' },
		});
		await fireEvent.blur(getByLabelText(`${WINE_SLIDER_COPY.price.label} lower bound (editable)`));

		const rule = engine.core.getRules().get('price') as RangeRule | undefined;

		expect(rule?.config).toEqual({ max: Number.POSITIVE_INFINITY, min: 30 });

		await fireEvent.keyDown(getByRole('slider', { name: `${WINE_SLIDER_COPY.price.sliderLabel} upper bound` }), { key: 'ArrowLeft' });

		const stepped = engine.core.getRules().get('price') as RangeRule | undefined;

		expect(stepped?.config.max).toBeLessThan(FALLBACK_BOUNDS.price.max);
		expect(Number.isFinite(stepped?.config.max)).toBe(true);
	});
});

describe('the option lists', () => {
	it('offers the single-color menu in the design order, keeping only colors the corpus has', () => {
		const { getByLabelText } = renderPanel();
		const select = getByLabelText('Filter by exact wine color') as HTMLSelectElement;
		const values = [...select.options].map((option) => option.value).filter((value) => value !== '');

		expect(values).toEqual(['red', 'white', 'sparkling']);
	});

	it('names and sizes the origin tree from the shared constant', () => {
		const { getByRole } = renderPanel();
		const tree = getByRole('group', { name: WINE_ORIGIN_TREE.groupLabel });

		expect(tree.getAttribute('style')).toContain(WINE_ORIGIN_TREE.maxHeight);
	});
});
