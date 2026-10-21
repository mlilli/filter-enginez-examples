/**
 * Tests for `real-estate/panel.ts` — the six control handlers the view suite does not drive.
 *
 * @remarks
 * ### 🔴 Only the sites no other suite reaches
 *
 * A throw-mutant probe against the WHOLE `packages/examples-vanilla` suite — not against
 * `real-estate/view.test.ts` alone, because coverage is transitive — shows the view suite already
 * drives both arms of `commitFacet`, `commitSelection` and `selectedSet`, the location picker's
 * `onChange`, the property-type chips and the must-have-features chips end-to-end.
 *
 * The six cases below cover the rest. They are not six unrelated sites — they are **three
 * controls**, each contributing a clear/set pair, which is why the file is this short.
 *
 * ### Why a sibling suite rather than more cases in `real-estate/view.test.ts`
 *
 * That spec exists to prove the view composes and tears down; adding six facet-commit cases to it
 * would re-assert this module's contract somewhere else, which is the duplication objection best
 * described as "copy-paste wearing a test's clothes". They belong beside the
 * module they are about.
 *
 * ### The claim worth pinning, and it is not a percentage
 *
 * `commitFacet` exists so that fourteen call sites do not each decide what "nothing selected" means.
 * Clearing a facet is a rule REMOVAL. An `InSetRule` with an empty set matches every item, but writing
 * one would leave a rule registered that the UI does not show, carried in the `?f=` link and logged as
 * a change. The module's own docblock says the call "looks perfectly reasonable in
 * review", which is exactly why the two clearing cases below assert `has(ruleId) === false` rather
 * than inspecting a rule that should not exist at all.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import {
	createFilterEngine,
	type DateRangeRule,
	type FilterEngine,
	type InSetRule,
	text,
	type TextSearchRule,
} from '@filter-enginez/core';
import { createLinkSerializer } from '@filter-enginez/examples-shared/link-serializer';
import { bootRealEstateCore } from '@filter-enginez/examples-shared/real-estate-boot-core';
import { buildRealEstateEngine } from '@filter-enginez/examples-shared/real-estate-core';
import { DATE_PRESET_OPTIONS } from '@filter-enginez/examples-shared/real-estate-domain';
import { TYPEAHEAD_DEBOUNCE_MS } from '@filter-enginez/examples-shared/search-core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRealEstatePanel } from './panel.js';

/**
 * A `Listing`-shaped row carrying every field the panel reads. Cast through `unknown` at the
 * boundary — the mini corpus stands in for a full `Listing`.
 *
 * @param overrides - The fields this row varies.
 * @returns The row.
 */
function makeListing(overrides: { readonly id: string } & Partial<Listing>): Listing {
	return {
		addressLine1: '1 Test Way',
		bathrooms: 2,
		bedrooms: 3,
		city: 'Denver',
		coordinates: { lat: 39.7392, lon: -104.9903 },
		coords: { lat: 39.7392, lng: -104.9903 },
		description: 'A remodeled home near the park.',
		features: ['garage'],
		lastUpdated: '2024-01-01T00:00:00.000Z',
		listedDate: '2024-01-01T00:00:00.000Z',
		locationId: 'CO/Greater Denver/Capitol Hill',
		lotSizeAcres: 0.25,
		metroArea: 'Greater Denver',
		mlsId: 'MLS-1',
		neighborhood: 'Capitol Hill',
		openHouseDates: [],
		photos: [],
		priceUsd: 500_000,
		propertyType: 'single-family',
		schoolDistrict: 'Denver Public Schools',
		squareFeet: 1800,
		state: 'CO',
		status: 'active',
		tier: 'default',
		title: 'A test listing',
		yearBuilt: 2000,
		zip: '80203',
		...overrides,
	} as unknown as Listing;
}

/** Two districts and two statuses, so both chip vocabularies have something to choose between. */
const DATA: readonly Listing[] = [
	makeListing({ id: 'a' }),
	makeListing({
		id: 'b',
		schoolDistrict: 'Jeffco Public Schools',
		status: 'pending',
	}),
];

/**
 * Mount the panel over a fresh engine, repainting from one coarse subscription.
 *
 * @remarks
 * The subscription is not decoration. Every selection-shaped handler reads its CURRENT committed set
 * back out of `latest.rules` before toggling, so a panel that never re-`update`s toggles against a
 * stale snapshot and the second click on a facet does the wrong thing. Mirroring the view's own
 * repaint is what makes the clearing cases below mean anything.
 *
 * @returns The engine and the mounted root.
 */
function mountPanel(core: FilterEngine<Listing> = createFilterEngine<Listing>({ sourceData: DATA })): {
	core: FilterEngine<Listing>;
	markBusy: ReturnType<typeof vi.fn>;
	panel: ReturnType<typeof createRealEstatePanel>;
	root: HTMLElement;
} {
	const markBusy = vi.fn();
	const panel = createRealEstatePanel(core, { markBusy, metroCenters: []});
	const root = document.createElement('div');

	root.append(panel.element);
	document.body.append(root);

	const repaint = (): void => {
		panel.update({ bundle: null, rules: core.getRules() });
	};

	core.subscribe(() => {
		repaint();
	});
	repaint();

	return { core, markBusy, panel, root };
}

/**
 * The `<section>` whose heading starts with `label`.
 *
 * @param root - The mounted root.
 * @param label - The section heading.
 * @returns The section element.
 */
function sectionNamed(root: HTMLElement, label: string): HTMLElement {
	const heading = Array.from(root.querySelectorAll<HTMLElement>('h3.fe-filter-section-label')).find(
		(node) => node.textContent.startsWith(label),
	);
	const node = heading?.parentElement;

	if (node === null || node === undefined) {
		throw new Error(`expected a "${label}" section`);
	}

	return node;
}

/**
 * Every button inside a named section, in render order.
 *
 * @param root - The mounted root.
 * @param label - The section heading.
 * @returns The buttons.
 */
function buttonsIn(root: HTMLElement, label: string): HTMLButtonElement[] {
	return Array.from(sectionNamed(root, label).querySelectorAll('button'));
}

/**
 * The button in a named section whose text is exactly `chipLabel`.
 *
 * @remarks
 * Exact rather than a prefix: with a bundle present a chip also renders a projected-count span, and a
 * prefix match would happily pick "Active (2)" while a stricter test would notice the difference.
 *
 * @param root - The mounted root.
 * @param label - The section heading.
 * @param chipLabel - The chip's visible label.
 * @returns The button.
 */
function chipNamed(root: HTMLElement, label: string, chipLabel: string): HTMLButtonElement {
	const chip = buttonsIn(root, label).find((node) => node.textContent === chipLabel);

	if (chip === undefined) {
		throw new Error(`expected a "${chipLabel}" chip in the "${label}" section`);
	}

	return chip;
}

/**
 * A school-district checkbox, by its label.
 *
 * @param root - The mounted root.
 * @param label - The district.
 * @returns The box.
 */
function districtBox(root: HTMLElement, label: string): HTMLInputElement {
	const row = [...sectionNamed(root, 'School district').querySelectorAll('.fe-checkbox-list__row')].find(
		(node) => node.querySelector('.fe-checkbox-list__label')?.textContent === label,
	);
	const box = row?.querySelector('input');

	if (box === null || box === undefined) {
		throw new Error(`expected a "${label}" school-district box`);
	}

	return box;
}

/** The description-search field (throws if absent, so callers avoid `!`). */
function searchFieldIn(root: HTMLElement): HTMLInputElement {
	const field = sectionNamed(root, 'Description search').querySelector<HTMLInputElement>(
		'.fe-search-input__field',
	);

	if (field === null) {
		throw new Error('expected the description search field');
	}

	return field;
}

/**
 * Commit a search query the way a user does — type, then press Enter.
 *
 * @param field - The search field.
 * @param query - What to type.
 */
function commitQuery(field: HTMLInputElement, query: string): void {
	field.value = query;
	field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));
}

afterEach(() => {
	document.body.replaceChildren();
});

describe('chip facets', () => {
	it('commits a school-district selection as an InSetRule', () => {
		const { core, root } = mountPanel();

		districtBox(root, 'Denver Public Schools').click();

		const rule = core.getRules().get('school-district') as InSetRule<string> | undefined;

		// The FIELD as well as the value. Fourteen facets are built from the same two helpers with only
		// a field name and a rule id to tell them apart, so a copy-paste that filters `city` by a school
		// district is the defect this facet actually admits — and a set-only assertion sails past it.
		expect(rule?.field).toBe('schoolDistrict');
		expect(rule?.config.set).toEqual(['Denver Public Schools']);
	});

	it('clears the school-district facet when its last chip is toggled back off', () => {
		// `has(...) === false`, not an empty rule — see the file docblock. The "obvious" alternative, an
		// empty `InSetRule`, matches every item but stays registered with no chip showing it.
		const { core, root } = mountPanel();

		districtBox(root, 'Denver Public Schools').click();
		districtBox(root, 'Denver Public Schools').click();

		expect(core.getRules().has('school-district')).toBe(false);
	});

	it('renders school districts as the shared height-capped checkbox list, with counts from the bundle', () => {
		const { core, panel, root } = mountPanel();
		const list = sectionNamed(root, 'School district').querySelector<HTMLElement>('.fe-checkbox-list');

		expect(list?.style.maxHeight).toBe('220px');
		expect(sectionNamed(root, 'School district').querySelector('.fe-chip')).toBeNull();

		panel.update({ bundle: core.applyFiltersAndQuery(panel.query), rules: core.getRules() });

		const counts = [...(list?.querySelectorAll('.fe-checkbox-list__count') ?? [])].map((node) => node.textContent);

		expect(counts.length).toBeGreaterThan(0);
	});

	it('keeps focus on a district box through the repaint its own click causes', () => {
		const { root } = mountPanel();
		const box = districtBox(root, 'Denver Public Schools');

		box.focus();
		box.click();

		expect(document.activeElement).toBe(box);
		expect(box.checked).toBe(true);
	});

	it('commits a status selection as an InSetRule', () => {
		const { core, root } = mountPanel();

		chipNamed(root, 'Status', 'pending').click();

		const rule = core.getRules().get('status') as InSetRule<string> | undefined;

		expect(rule?.field).toBe('status');
		expect(rule?.config.set).toEqual(['pending']);
	});
});

describe('the listed-date presets', () => {
	it('commits the selected preset as a DateRangeRule', () => {
		const { core, root } = mountPanel();
		const [firstPreset] = DATE_PRESET_OPTIONS;

		if (firstPreset === undefined) {
			throw new Error('expected at least one date preset');
		}

		// Index 1, because the group renders the "any" escape FIRST and it is not one of the presets.
		buttonsIn(root, 'Listed within')[1]?.click();

		const rule = core.getRules().get('listed-date') as DateRangeRule | undefined;

		expect(rule?.field).toBe('listedDate');
		expect(rule?.config.preset).toBe(firstPreset.value);
	});

	it('clears the facet when "Any time" is chosen', () => {
		// The `value === null` arm. A DateRangeRule carrying no preset would match everything and read
		// as an active filter in the chip row, so this has to remove the rule outright.
		const { core, root } = mountPanel();

		buttonsIn(root, 'Listed within')[1]?.click();

		expect(core.getRules().has('listed-date')).toBe(true);

		buttonsIn(root, 'Listed within')[0]?.click();

		expect(core.getRules().has('listed-date')).toBe(false);
	});
});

describe('the description search', () => {
	it('commits a trimmed, case-insensitive substring query', () => {
		// The surrounding whitespace is the point: the field commits what was typed, and an untrimmed
		// query silently matches nothing on a corpus whose descriptions have no leading spaces.
		const { core, root } = mountPanel();

		commitQuery(searchFieldIn(root), '  remodeled  ');

		const rule = core.getRules().get('text-search') as TextSearchRule | undefined;

		expect(rule?.field).toBe('description');
		expect(rule?.config).toMatchObject({
			caseSensitive: false,
			mode: 'substring',
			query: 'remodeled',
		});
	});

	it('does not filter while the query is still being typed, and commits once typing pauses', () => {
		// The shared typeahead controller: a keystroke re-arms a 250 ms trailing commit, so a substring
		// scan over the corpus runs once per pause rather than once per keystroke.
		vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout']});

		const { core, root } = mountPanel();
		const field = searchFieldIn(root);

		field.value = 'remodeled';
		field.dispatchEvent(new Event('input', { bubbles: true }));

		expect(core.getRules().has('text-search')).toBe(false);

		vi.advanceTimersByTime(TYPEAHEAD_DEBOUNCE_MS);
		expect(core.getRules().has('text-search')).toBe(true);
		vi.useRealTimers();
	});

	it('uses the shared description copy, and marks busy only when something is written', () => {
		const { markBusy, root } = mountPanel();
		const field = searchFieldIn(root);

		expect(field.getAttribute('aria-label')).toBe('Search listing descriptions');
		expect(field.placeholder).toBe('waterfront, remodeled, cul-de-sac…');

		field.focus();
		field.blur();
		expect(markBusy).not.toHaveBeenCalled();

		commitQuery(field, 'remodeled');
		expect(markBusy).toHaveBeenCalledOnce();
	});

	it('clears the facet when the query is emptied', () => {
		// Whitespace-only, not empty — the trim is what decides, and a test that submitted `''` would
		// pass against a module that only checked for the empty string.
		const { core, root } = mountPanel();
		const field = searchFieldIn(root);

		commitQuery(field, 'remodeled');

		expect(core.getRules().has('text-search')).toBe(true);

		commitQuery(field, '   ');

		expect(core.getRules().has('text-search')).toBe(false);
	});

	it('opens on a description query a shared link already committed, and treats it as unchanged', () => {
		// The shared-link shape: the route loads `?f=` into the engine and only then builds the panel.
		// Read BEFORE the first `update`, so the field's text can only have come from the constructor's
		// seed — and a blur writes nothing, because the seeded query is already the committed one.
		const core = createFilterEngine<Listing>({ sourceData: DATA });

		core.addRule('text-search', text('description', { caseSensitive: false, mode: 'substring', query: 'remodeled' }));

		const markBusy = vi.fn();
		const panel = createRealEstatePanel(core, { markBusy, metroCenters: []});
		const root = document.createElement('div');

		root.append(panel.element);
		document.body.append(root);

		const field = searchFieldIn(root);

		expect(field.value).toBe('remodeled');

		field.focus();
		field.blur();

		expect(markBusy).not.toHaveBeenCalled();
		expect((core.getRules().get('text-search') as TextSearchRule | undefined)?.config.query).toBe('remodeled');
		panel.dispose();
	});
});

describe('the location tree over the booted corpus', () => {
	/**
	 * Mount the panel over a fresh engine holding the corpus a page boots from, and click the first
	 * top-level row of the location tree.
	 *
	 * @returns The engine, the state that row names, and how many booted listings sit in that state.
	 */
	async function selectFirstState(): Promise<{
		readonly core: FilterEngine<Listing>;
		readonly expectedCount: number;
		readonly state: string;
	}> {
		// A fresh engine over the booted records, so the selection does not leak into the cached boot.
		const corpus = (await bootRealEstateCore()).core.getSourceData();
		const { core, root } = mountPanel(buildRealEstateEngine(corpus));
		const firstRow = root.querySelector<HTMLElement>('.fe-tree__control');
		const state = firstRow?.querySelector('.fe-tree__label')?.textContent ?? '';

		firstRow?.click();

		return { core, expectedCount: corpus.filter((listing) => listing.state === state).length, state };
	}

	it('passes exactly the listings in the selected state', async () => {
		const { core, expectedCount, state } = await selectFirstState();

		// Non-vacuous: a real state, and a strict, non-empty part of the corpus.
		expect(state).not.toBe('');
		expect(expectedCount).toBeGreaterThan(0);
		expect(expectedCount).toBeLessThan(core.getSourceData().length);
		expect(core.getResultCount()).toBe(expectedCount);
	});

	it('keeps passing them after the state takes a ?f= round trip, as on a reload or a shared link', async () => {
		// The page writes `?f=` on every change and reads it back on load. A location rule over a
		// function field decodes into a rule that tests no field, and the reloaded page shows zero
		// listings with the state still checked.
		const { core, expectedCount } = await selectFirstState();
		const exported = core.exportConfig();
		const serializer = createLinkSerializer('human-readable');
		const reloaded = buildRealEstateEngine(core.getSourceData());

		// The committed rule names its field, so the link carries it as is rather than relying on the
		// decoder to repair it.
		expect(exported.rules.map(({ rule }) => rule.field)).toEqual(['locationId']);

		reloaded.loadConfig(serializer.decode(serializer.encode(exported)));

		expect(reloaded.getResultCount()).toBe(expectedCount);
	});
});

describe('busy marking', () => {
	it('marks busy BEFORE each write, and never for clearing a facet that holds no rule', () => {
		const { core, markBusy, root } = mountPanel();
		const sizes: number[] = [];

		markBusy.mockImplementation(() => {
			sizes.push(core.getRules().size);
		});
		chipNamed(root, 'Status', 'pending').click();
		expect(sizes).toEqual([0]);

		// "Any time" with no date rule committed: nothing to write, nothing to mark.
		chipNamed(root, 'Listed within', 'Any time').click();
		expect(sizes).toEqual([0]);
	});

	it('dims the body and sets aria-busy while busy', () => {
		const { panel, root } = mountPanel();
		const body = root.querySelector('.fe-filter-panel__body');

		expect(body?.getAttribute('aria-busy')).toBe('false');

		panel.setBusy(true);
		expect(body?.classList.contains('fe-filter-panel__body--busy')).toBe(true);
		expect(body?.getAttribute('aria-busy')).toBe('true');

		panel.setBusy(false);
		expect(body?.classList.contains('fe-filter-panel__body--busy')).toBe(false);
	});

	it('names the location tree and the listed-date group with the shared labels', () => {
		const { root } = mountPanel();
		const tree = root.querySelector<HTMLElement>('.fe-tree');

		expect(tree?.getAttribute('aria-label')).toBe('Location');
		expect(tree?.style.getPropertyValue('--fe-tree-max-height')).toBe('14rem');
		expect(root.querySelector('[role="group"][aria-label="Listed within"]')).not.toBeNull();
	});
});
