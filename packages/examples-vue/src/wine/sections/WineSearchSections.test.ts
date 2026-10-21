/**
 * The two wine searches over a real engine: what they write, when, and what an empty query means.
 *
 * @remarks
 * Both bind the shared typeahead contract, so the cases are the same for each: the query commits once
 * typing pauses and at once on Enter, the rule is the shared `wineSearchRule`, an empty query REMOVES
 * the rule (tasting notes and winery alike), and a blur that changes nothing writes nothing and leaves
 * the busy indicator dark, which is what keeps it from sticking after blurring an empty field. An
 * external removal (Clear all, a pill's ×) empties the field.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { createFilterEngine, type FilterEngine, type FuzzySearchRule } from '@filter-enginez/core';
import { TYPEAHEAD_DEBOUNCE_MS } from '@filter-enginez/examples-shared/search-core';
import { WINE_SEARCHES, wineBusyCore, wineSearchRule } from '@filter-enginez/examples-shared/wine-domain';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import WineNotesSection from './WineNotesSection.vue';
import WinerySearchSection from './WinerySearchSection.vue';

/** Three wines with distinct notes and wineries. */
const ROWS = [
	{ description: 'Black cherry and cedar.', id: 'a', tastingNotes: ['cherry'], winery: 'Vandermark' },
	{ description: 'Lemon zest and wet stone.', id: 'b', tastingNotes: ['citrus'], winery: 'Caruso' },
	{ description: 'Toasted oak and vanilla.', id: 'c', tastingNotes: ['oak'], winery: 'Hartmann' },
];

/** Every wrapper mounted by a case, unmounted after it. */
const mounted: VueWrapper[] = [];

afterEach(() => {
	for (const wrapper of mounted.splice(0)) {
		wrapper.unmount();
	}
	vi.useRealTimers();
});

/** The two sections, keyed by the search id they own. */
const SECTIONS = [
	['notes', WineNotesSection],
	['winery', WinerySearchSection],
] as const;

/**
 * Mount one search section over a main-thread engine, with the busy tracker settled.
 *
 * @param section - The component.
 * @returns The wrapper, the engine core and the field.
 */
function mountSection(section: (typeof SECTIONS)[number][1]) {
	const core: FilterEngine<Wine> = createFilterEngine<Wine>({ sourceData: ROWS as unknown as Wine[] });
	const wrapper = mount(section, {
		attachTo: document.body,
		props: { engine: createSignalsEngine(core), leaveExpressionMode: vi.fn() },
	});

	mounted.push(wrapper);
	wineBusyCore.markResolvedAtLeast(wineBusyCore.captureCurrentVersion());

	return { core, field: wrapper.find('input'), wrapper };
}

describe.each(SECTIONS)('the %s search', (searchId, section) => {
	it('reads its copy from WINE_SEARCHES', () => {
		const { field, wrapper } = mountSection(section);

		expect(field.attributes('aria-label')).toBe(WINE_SEARCHES[searchId].ariaLabel);
		expect(field.attributes('placeholder')).toBe(WINE_SEARCHES[searchId].placeholder);
		expect(wrapper.text()).toContain(WINE_SEARCHES[searchId].label);
	});

	it('commits the shared rule once typing pauses', async () => {
		vi.useFakeTimers();
		const { core, field } = mountSection(section);

		await field.setValue('cedar');
		expect(core.getRules().has(searchId)).toBe(false);

		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);

		const rule = core.getRules().get(searchId) as FuzzySearchRule | undefined;

		expect(rule?.config).toEqual((wineSearchRule(searchId, 'cedar') as FuzzySearchRule).config);
	});

	it('commits at once on Enter, and once only', async () => {
		const { core, field } = mountSection(section);
		const addRule = vi.spyOn(core, 'addRule');

		(field.element as HTMLInputElement).focus();
		await field.setValue('  oak ');
		await field.trigger('keydown', { key: 'Enter' });
		await field.trigger('blur');

		expect(addRule).toHaveBeenCalledOnce();
		expect((core.getRules().get(searchId) as FuzzySearchRule | undefined)?.config.query).toBe('oak');
	});

	it('removes the rule when the query empties', async () => {
		const { core, field } = mountSection(section);

		await field.setValue('oak');
		await field.trigger('blur');
		expect(core.getRules().has(searchId)).toBe(true);

		await field.setValue('');
		await field.trigger('blur');

		expect(core.getRules().has(searchId)).toBe(false);
	});

	it('writes nothing, and marks nothing busy, for a blur on an untouched empty field', async () => {
		const { core, field } = mountSection(section);
		const removeRule = vi.spyOn(core, 'removeRule');

		await field.trigger('blur');

		expect(removeRule).not.toHaveBeenCalled();
		expect(wineBusyCore.getIsEngineBusy()).toBe(false);
	});

	it('marks the engine busy before it writes', async () => {
		const { core, field } = mountSection(section);
		let isBusyAtWrite: boolean | undefined;

		vi.spyOn(core, 'addRule').mockImplementation(() => {
			isBusyAtWrite = wineBusyCore.getIsEngineBusy();
		});
		await field.setValue('oak');
		await field.trigger('blur');

		expect(isBusyAtWrite).toBe(true);
	});

	it('empties the field when the rule is removed from outside', async () => {
		const { core, field } = mountSection(section);

		await field.setValue('oak');
		await field.trigger('blur');
		core.clearRules();
		await flushPromises();

		expect((field.element as HTMLInputElement).value).toBe('');
	});
});
