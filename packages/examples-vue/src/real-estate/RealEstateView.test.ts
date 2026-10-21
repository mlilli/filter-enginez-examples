/**
 * Functional-parity test for the full Vue real-estate experience: mount `<RealEstateView>` over a mini
 * engine of `Listing`-shaped rows and prove the headline interactions match the React/Svelte apps.
 *
 * @remarks
 * The books view has the same test for the same reason, but this one carries more weight, because the
 * real-estate route is the first thing in this vertical to use `provide`/`inject` for its
 * predictive-disable bundle. A green run means five separate things are wired correctly and could each
 * fail silently:
 *
 *   1. the panel commits through `realEstateCommit` and the engine's refs move the results,
 *   2. `<RealEstateView>`'s fetcher publishes a bundle and the sections actually inject it,
 *   3. the results header's chips are derived from the ENGINE's rules,
 *   4. removing a chip un-selects the matching control, because the panel derives from those same
 *      rules rather than mirroring them, and
 *   5. the shared `<ResultGrid>` renders `<ListingCard>` through its scoped slot.
 *
 * Point 2 is the one with no visible failure mode: a bundle that never arrives leaves every control
 * ENABLED, which is exactly what "no information" is supposed to look like. So the disable state is
 * asserted directly rather than inferred from the panel looking right.
 *
 * The geo section is deliberately absent here — it is dynamically imported in `onMounted` and jsdom
 * never awaits that import before the assertions run, which is the same reason the panel treats it as
 * optional in production.
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { createFilterEngine, inSet, type InSetRule, text, type TextSearchRule } from '@filter-enginez/core';
import {
	buildListingLocationTree,
	buildLocationNodeSpecs,
	deriveBaselineBounds,
	deriveMetroCenters,
	deriveRealEstateVocabularies,
	type NumericBounds,
	REAL_ESTATE_DESCRIPTION_SEARCH,
	REAL_ESTATE_LISTED_DATE_LABEL,
	REAL_ESTATE_LOCATION_TREE,
	REAL_ESTATE_SCHOOL_DISTRICT_LIST_MAX_HEIGHT,
	REAL_ESTATE_SLIDER_FIELD_IDS,
	type RealEstateSliderFieldId,
	SLIDER_CLAMPS,
	SLIDER_FIELD_GETTERS,
	SLIDER_STEPS,
} from '@filter-enginez/examples-shared/real-estate-domain';
import { RESULT_COPY } from '@filter-enginez/examples-shared/verticals';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { type DOMWrapper, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';

import RealEstateView from './RealEstateView.vue';

/** A router with the landing + real-estate routes so `<RouterLink>` inside the shell resolves. */
function makeRouter(): Router {
	return createRouter({
		history: createMemoryHistory(),
		routes: [
			{ component: { template: '<div />' }, path: '/' },
			{ component: { template: '<div />' }, path: '/real-estate' },
		],
	});
}

/**
 * A `Listing`-shaped row carrying every field the panel + card touch. Cast through `unknown` at the
 * boundary — the mini corpus stands in for a full `Listing`.
 */
function makeListing(overrides: { readonly id: string } & Partial<Listing>): Listing {
	return {
		addressLine1: '1 Test Way',
		bathrooms: 2,
		bedrooms: 3,
		city: 'Denver',
		coordinates: { lat: 39.7392, lon: -104.9903 },
		coords: { lat: 39.7392, lng: -104.9903 },
		description: 'A pleasant home near the park.',
		features: ['garage'],
		lastUpdated: '2026-07-01T00:00:00.000Z',
		listedDate: '2026-07-01T00:00:00.000Z',
		locationId: 'CO/Greater Denver/Highlands',
		lotSizeAcres: 0.25,
		metroArea: 'Greater Denver',
		mlsId: 'MLS1',
		neighborhood: 'Highlands',
		openHouseDates: [],
		photos: [],
		priceUsd: 500_000,
		propertyType: 'single-family',
		schoolDistrict: 'Denver Public Schools',
		squareFeet: 2000,
		state: 'CO',
		status: 'active',
		tier: 'default',
		title: 'A pleasant home',
		yearBuilt: 2000,
		zip: '80211',
		...overrides,
	} as unknown as Listing;
}

/**
 * Four listings across two property types, two statuses and two school districts.
 *
 * @remarks
 * `condo` appears only in `pending` status, which is what makes the predictive-disable assertion
 * possible: filtering to `sold` must project `condo` as empty, because no sold listing is one.
 */
const DATA: readonly Listing[] = [
	makeListing({ id: 'a', priceUsd: 400_000, propertyType: 'single-family', status: 'active' }),
	makeListing({ id: 'b', priceUsd: 600_000, propertyType: 'single-family', status: 'sold' }),
	makeListing({ id: 'c', priceUsd: 350_000, propertyType: 'condo', status: 'pending' }),
	makeListing({ id: 'd', priceUsd: 800_000, propertyType: 'townhouse', status: 'active' }),
];

/** Build a fresh signals engine over the mini corpus. */
function bootEngine(): SignalsEngine<Listing> {
	return createSignalsEngine(createFilterEngine({ sourceData: DATA }));
}

/** The route's own baseline derivation, so the sliders get the same tracks the app gives them. */
function deriveBaselines(): Record<RealEstateSliderFieldId, NumericBounds> {
	const entries = REAL_ESTATE_SLIDER_FIELD_IDS.map(
		(fieldId) =>
			[
				fieldId,
				deriveBaselineBounds(
					DATA.map(SLIDER_FIELD_GETTERS[fieldId]),
					SLIDER_CLAMPS[fieldId],
					SLIDER_STEPS[fieldId],
				),
			] as const,
	);

	return Object.fromEntries(entries) as Record<RealEstateSliderFieldId, NumericBounds>;
}

/** Mount `<RealEstateView>` with a test router and the same derived props the route computes. */
async function mountView(engine: SignalsEngine<Listing>): Promise<VueWrapper> {
	const locationTree = buildListingLocationTree(DATA);
	const router = makeRouter();
	// Mount first (installs the router plugin, which kicks off the memory-history initial navigation),
	// THEN await `isReady` — awaiting before install would hang forever.
	const wrapper = mount(RealEstateView, {
		global: { plugins: [router]},
		props: {
			baselines: deriveBaselines(),
			engine,
			locationSpecs: buildLocationNodeSpecs(locationTree),
			locationTree,
			metroCenters: deriveMetroCenters(DATA),
			vocabularies: deriveRealEstateVocabularies(DATA),
		},
	});

	await router.isReady();
	await flushPromises();

	return wrapper;
}

/** The rendered chip whose visible text starts with `label` (throws if absent, so callers avoid `!`). */
function chipByText(wrapper: VueWrapper, label: string): DOMWrapper<Element> {
	const node = wrapper.findAll('.fe-chip').find((candidate) => candidate.text().startsWith(label));

	if (node === undefined) {
		throw new Error(`no chip with text "${label}"`);
	}

	return node;
}

/** The button whose `aria-label` matches (throws if absent, so callers avoid `!`). */
function buttonByAria(wrapper: VueWrapper, label: string): DOMWrapper<Element> {
	const node = wrapper.findAll('button').find((candidate) => candidate.attributes('aria-label') === label);

	if (node === undefined) {
		throw new Error(`no button with aria-label "${label}"`);
	}

	return node;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('<RealEstateView> full-parity interactions', () => {
	it('renders the panel, the location tree and one card per listing', async () => {
		const engine = bootEngine();
		const wrapper = await mountView(engine);

		expect(wrapper.find('.fe-result-count__number').text()).toBe('4');
		expect(wrapper.findAll('.fe-listing-card')).toHaveLength(4);
		// The hierarchy renders from the tree, so the top level is the one state in the mini corpus.
		expect(wrapper.findAll('.fe-tree__label').map((row) => row.text())).toEqual(['CO']);
		// Six range sliders, from the `RANGE_FACETS` table.
		expect(wrapper.findAll('.fe-range-slider')).toHaveLength(6);

		engine.dispose();
	});

	it('narrows the count + grid when a property-type chip is toggled', async () => {
		const engine = bootEngine();
		const wrapper = await mountView(engine);

		await chipByText(wrapper, 'single family').trigger('click');
		await flushPromises();

		// The grid updates immediately; the count rolls to its new value over ~600ms.
		expect(wrapper.findAll('.fe-listing-card')).toHaveLength(2);
		await vi.waitFor(() => {
			expect(wrapper.find('.fe-result-count__number').text()).toBe('2');
		});

		engine.dispose();
	});

	it('restores the full set when an active-filter chip is removed', async () => {
		const engine = bootEngine();
		const wrapper = await mountView(engine);

		await chipByText(wrapper, 'condo').trigger('click');
		await flushPromises();
		await vi.waitFor(() => {
			expect(wrapper.find('.fe-result-count__number').text()).toBe('1');
		});

		await buttonByAria(wrapper, 'Remove Type filter').trigger('click');
		await flushPromises();

		expect(wrapper.findAll('.fe-listing-card')).toHaveLength(4);
		// The CONTROL follows the rule, because the panel's chips derive from `activeRules` rather than
		// mirroring the clicks. A chip left looking selected over results it no longer affects is the
		// failure the derivation prevents by construction.
		expect(chipByText(wrapper, 'condo').classes()).not.toContain('fe-chip--selected');

		engine.dispose();
	});

	it('seeds the panel from rules already on the engine, and extends them on the next click', async () => {
		// The `?f` restore path, which is the whole reason selection is derived rather than mirrored:
		// `RealEstatePage` calls `core.loadConfig(urlConfig)` BEFORE this view mounts, so the panel has to
		// read a selection it never saw committed. A local mirror would render both chips UNSELECTED over
		// correct results, and then write a one-element set on the next click — silently dropping the two
		// restored values it did not know about.
		const engine = bootEngine();

		engine.core.addRule('property-type', inSet<string>('propertyType', ['single-family', 'condo']));

		const wrapper = await mountView(engine);

		expect(chipByText(wrapper, 'single family').classes()).toContain('fe-chip--selected');
		expect(chipByText(wrapper, 'condo').classes()).toContain('fe-chip--selected');

		await chipByText(wrapper, 'townhouse').trigger('click');
		await flushPromises();

		const rule = engine.core.getRule('property-type') as InSetRule<string> | undefined;

		expect(rule?.config.set).toEqual(['single-family', 'condo', 'townhouse']);

		engine.dispose();
	});

	it('disables a chip the bundle projects as empty', async () => {
		// The provide/inject path, asserted directly. A bundle that never arrives leaves every control
		// enabled — which is what "no information" is meant to look like — so a panel that looks correct
		// proves nothing on its own.
		const engine = bootEngine();
		const wrapper = await mountView(engine);

		await chipByText(wrapper, 'sold').trigger('click');
		await flushPromises();

		// No sold listing is a condo, so adding `condo` to the type facet would empty the results.
		await vi.waitFor(() => {
			expect(chipByText(wrapper, 'condo').attributes('disabled')).toBeDefined();
		});

		engine.dispose();
	});

	it('gives the result scroller a keyboard-reachable, labelled stop', async () => {
		// WCAG 2.1.1: the cards are articles with nothing tabbable inside, so the scrolling container
		// itself has to be the tab stop or the results are unreachable by keyboard.
		const engine = bootEngine();
		const wrapper = await mountView(engine);
		const scroller = wrapper.find('.fe-result-grid__scroller');

		expect(scroller.attributes('role')).toBe('group');
		expect(scroller.attributes('tabindex')).toBe('0');
		expect(scroller.attributes('aria-label')).toBe(RESULT_COPY['real-estate'].scrollerLabel);

		engine.dispose();
	});
});

describe('<RealEstateView> Clear all', () => {
	it('drops every rule with ONE clearRules, including one no facet lists, and one Undo restores them', async () => {
		const engine = bootEngine();

		engine.core.addRule('property-type', inSet<string>('propertyType', ['condo']));
		// A rule under an id no control owns, as a hand-edited `?f` link could carry.
		engine.core.addRule('hand-written', inSet<string>('status', ['pending']));

		const wrapper = await mountView(engine);
		const clearRules = vi.spyOn(engine.core, 'clearRules');
		const removeRule = vi.spyOn(engine.core, 'removeRule');

		await wrapper.find('.fe-active-filters__clear').trigger('click');
		await flushPromises();

		expect(clearRules).toHaveBeenCalledOnce();
		expect(removeRule).not.toHaveBeenCalled();
		expect(engine.core.getRules().size).toBe(0);
		expect(chipByText(wrapper, 'condo').classes()).not.toContain('fe-chip--selected');

		(engine.core as unknown as { devtools: { undo: () => void }}).devtools.undo();
		await flushPromises();

		expect([...engine.core.getRules().keys()].sort()).toEqual(['hand-written', 'property-type']);

		engine.dispose();
	});
});

describe('<RealEstateView> description search', () => {
	/**
	 * The description field.
	 *
	 * @param wrapper - The mounted view.
	 * @returns The input.
	 */
	function descriptionField(wrapper: VueWrapper): DOMWrapper<HTMLInputElement> {
		return wrapper.find<HTMLInputElement>(`input[aria-label="${REAL_ESTATE_DESCRIPTION_SEARCH.ariaLabel}"]`);
	}

	it('reads its copy from REAL_ESTATE_DESCRIPTION_SEARCH and commits on blur', async () => {
		const engine = bootEngine();
		const wrapper = await mountView(engine);
		const field = descriptionField(wrapper);

		expect(field.attributes('placeholder')).toBe(REAL_ESTATE_DESCRIPTION_SEARCH.placeholder);
		await field.setValue(' park ');
		await field.trigger('blur');

		expect((engine.core.getRule('text-search') as TextSearchRule | undefined)?.config.query).toBe('park');

		engine.dispose();
	});

	it('removes the rule when the query empties', async () => {
		const engine = bootEngine();

		engine.core.addRule('text-search', text('description', { caseSensitive: false, mode: 'substring', query: 'park' }));

		const wrapper = await mountView(engine);
		const field = descriptionField(wrapper);

		expect(field.element.value).toBe('park');
		await field.setValue('');
		await field.trigger('blur');

		expect(engine.core.getRules().has('text-search')).toBe(false);

		engine.dispose();
	});

	it('writes nothing for a blur on an untouched empty field', async () => {
		const engine = bootEngine();
		const wrapper = await mountView(engine);
		const removeRule = vi.spyOn(engine.core, 'removeRule');
		const addRule = vi.spyOn(engine.core, 'addRule');

		await descriptionField(wrapper).trigger('blur');

		expect(removeRule).not.toHaveBeenCalled();
		expect(addRule).not.toHaveBeenCalled();

		engine.dispose();
	});

	it('empties the field when Clear all removes the rule', async () => {
		const engine = bootEngine();
		const wrapper = await mountView(engine);
		const field = descriptionField(wrapper);

		await field.setValue('park');
		await field.trigger('blur');
		await flushPromises();
		await wrapper.find('.fe-active-filters__clear').trigger('click');
		await flushPromises();

		expect(field.element.value).toBe('');

		engine.dispose();
	});
});

describe('<RealEstateView> shared panel copy', () => {
	it('names and bounds the location tree, bounds the school list, and names the listed-date group', async () => {
		const engine = bootEngine();
		const wrapper = await mountView(engine);
		const tree = wrapper.find('.fe-tree');

		expect(tree.attributes('aria-label')).toBe(REAL_ESTATE_LOCATION_TREE.groupLabel);
		expect(tree.attributes('style')).toContain(`--fe-tree-max-height: ${REAL_ESTATE_LOCATION_TREE.maxHeight}`);
		expect(wrapper.find('.fe-checkbox-list').attributes('style')).toContain(
			`max-height: ${REAL_ESTATE_SCHOOL_DISTRICT_LIST_MAX_HEIGHT}`,
		);
		expect(wrapper.find(`[role="group"][aria-label="${REAL_ESTATE_LISTED_DATE_LABEL}"]`).exists()).toBe(true);

		engine.dispose();
	});

	it('puts the listings noun after the count', async () => {
		const engine = bootEngine();
		const wrapper = await mountView(engine);

		expect(wrapper.find('.fe-results-header').text()).toContain(RESULT_COPY['real-estate'].noun);

		engine.dispose();
	});
});
