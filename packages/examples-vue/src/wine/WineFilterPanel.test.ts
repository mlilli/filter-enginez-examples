/**
 * The Vue wine panel's shared choices: option order, the origin tree's name and height, the slider
 * names, and the busy state on its body.
 *
 * @remarks
 * Every app's panel lists its color, body and sweetness values in the hand-set design order through
 * `orderedPresentOptions`, keeping only values the corpus carries, and the single-color menu beside
 * the color chips follows the SAME order rather than the vocabulary's alphabetical one. The vocabulary
 * below is deliberately alphabetical, so a panel that passed it straight through fails.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { createFilterEngine } from '@filter-enginez/core';
import {
	COLOR_ORDER,
	orderedPresentOptions,
	type PickerTreeNode,
	WINE_ORIGIN_TREE,
	WINE_SLIDER_COPY,
	type WineChipVocabularies,
} from '@filter-enginez/examples-shared/wine-domain';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import WineFilterPanel from './WineFilterPanel.vue';

/** One wine; the panel only needs an engine to bind to. */
const ROWS = [{ body: 'full', color: 'red', id: 'a', originId: 'France', sweetness: 'dry', varietal: 'Merlot' }];

/** Alphabetical, as a corpus scan returns it, with `dessert` absent. */
const VOCABULARIES: WineChipVocabularies = {
	body: ['full', 'light', 'medium'],
	color: ['red', 'rosé', 'sparkling', 'white'],
	sweetness: ['dry', 'off-dry', 'sweet'],
	varietal: ['Merlot'],
};

const ORIGIN_TREE: PickerTreeNode = { children: [{ id: 'France', label: 'France' }], id: 'world', label: 'World' };

/** Every wrapper mounted by a case, unmounted after it. */
const mounted: VueWrapper[] = [];

afterEach(() => {
	for (const wrapper of mounted.splice(0)) {
		wrapper.unmount();
	}
});

/**
 * Mount the panel.
 *
 * @param isComputing - Whether the panel renders as busy.
 * @returns The wrapper.
 */
function mountPanel(isComputing = false) {
	const core = createFilterEngine<Wine>({ sourceData: ROWS as unknown as Wine[] });
	const wrapper = mount(WineFilterPanel, {
		props: { engine: createSignalsEngine(core), isComputing, originSpecs: [], originTree: ORIGIN_TREE, vocabularies: VOCABULARIES },
	});

	mounted.push(wrapper);

	return wrapper;
}

describe('<WineFilterPanel> shared choices', () => {
	it('orders the single-color menu by COLOR_ORDER, not alphabetically', () => {
		const options = mountPanel()
			.findAll('select[aria-label="Filter by exact wine color"] option')
			.map((option) => option.attributes('value'))
			.filter((value) => value !== '');

		expect(options).toEqual(orderedPresentOptions(COLOR_ORDER, VOCABULARIES.color));
		expect(options).toEqual(['red', 'white', 'rosé', 'sparkling']);
	});

	it('orders the color chips the same way', () => {
		const wrapper = mountPanel();
		// Every chip in the panel, in DOM order, narrowed to the color values (no other group shares one).
		const colorChips = wrapper
			.findAll('.fe-chip')
			.map((chip) => chip.text().split('(')[0] ?? '')
			.filter((text) => VOCABULARIES.color.includes(text));

		expect(colorChips).toEqual(['red', 'white', 'rosé', 'sparkling']);
	});

	it('names the origin tree and bounds its height from WINE_ORIGIN_TREE', () => {
		const tree = mountPanel().find('.fe-tree');

		expect(tree.attributes('role')).toBe('group');
		expect(tree.attributes('aria-label')).toBe(WINE_ORIGIN_TREE.groupLabel);
		expect(tree.attributes('style')).toContain(`--fe-tree-max-height: ${WINE_ORIGIN_TREE.maxHeight}`);
	});

	it('names every slider\'s thumbs from WINE_SLIDER_COPY', () => {
		const names = mountPanel().findAll('[role="slider"]').map((thumb) => thumb.attributes('aria-label'));

		for (const copy of Object.values(WINE_SLIDER_COPY)) {
			expect(names).toContain(`${copy.sliderLabel} lower bound`);
			expect(names).toContain(`${copy.sliderLabel} upper bound`);
		}
	});

	it('marks its body busy, for assistive technology too, while the engine computes', () => {
		const body = mountPanel(true).find('.fe-filter-panel__body');

		expect(body.classes()).toContain('fe-filter-panel__body--busy');
		expect(body.attributes('aria-busy')).toBe('true');
	});

	it('leaves its body idle otherwise', () => {
		expect(mountPanel().find('.fe-filter-panel__body').attributes('aria-busy')).toBe('false');
	});
});
