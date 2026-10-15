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
 * An `InSetRule` with an empty set still participates in the AND and matches nothing, so clearing a
 * facet has to be a rule REMOVAL — write the empty rule instead and the results go to zero while the
 * UI shows no active filter. The module's own docblock says the call "looks perfectly reasonable in
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
	type TextSearchRule,
} from '@filter-enginez/core';
import { createLinkSerializer } from '@filter-enginez/examples-shared/link-serializer';
import { bootRealEstateCore } from '@filter-enginez/examples-shared/real-estate-boot-core';
import { buildRealEstateEngine } from '@filter-enginez/examples-shared/real-estate-core';
import { DATE_PRESET_OPTIONS } from '@filter-enginez/examples-shared/real-estate-domain';
import { afterEach, describe, expect, it } from 'vitest';

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
	root: HTMLElement;
} {
	const panel = createRealEstatePanel(core, { metroCenters: []});
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

	return { core, root };
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
 * The button in a named section whose text is exactly `text`.
 *
 * @remarks
 * Exact rather than a prefix: with a bundle present a chip also renders a projected-count span, and a
 * prefix match would happily pick "Active (2)" while a stricter test would notice the difference.
 *
 * @param root - The mounted root.
 * @param label - The section heading.
 * @param text - The chip's visible label.
 * @returns The button.
 */
function chipNamed(root: HTMLElement, label: string, text: string): HTMLButtonElement {
	const chip = buttonsIn(root, label).find((node) => node.textContent === text);

	if (chip === undefined) {
		throw new Error(`expected a "${text}" chip in the "${label}" section`);
	}

	return chip;
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

		chipNamed(root, 'School district', 'Denver Public Schools').click();

		const rule = core.getRules().get('school-district') as InSetRule<string> | undefined;

		// The FIELD as well as the value. Fourteen facets are built from the same two helpers with only
		// a field name and a rule id to tell them apart, so a copy-paste that filters `city` by a school
		// district is the defect this facet actually admits — and a set-only assertion sails past it.
		expect(rule?.field).toBe('schoolDistrict');
		expect(rule?.config.set).toEqual(['Denver Public Schools']);
	});

	it('clears the school-district facet when its last chip is toggled back off', () => {
		// `has(...) === false`, not an empty rule — see the file docblock. An `InSetRule` with an empty
		// set participates in the AND and matches nothing, so the "obvious" alternative filters the
		// results to zero while the UI shows no active filter.
		const { core, root } = mountPanel();

		chipNamed(root, 'School district', 'Denver Public Schools').click();
		chipNamed(root, 'School district', 'Denver Public Schools').click();

		expect(core.getRules().has('school-district')).toBe(false);
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

	it('does not filter while the query is still being typed', () => {
		// 🔴 A case a throw-mutant probe cannot find, and why is worth more than the line.
		// `onChange: () => undefined` is a no-op arrow, so reading the source it looks like nothing to
		// test, and no mutant targets it. Only the coverage measurement sees it: one uncovered
		// function, one uncovered line.
		//
		// It is not nothing. The source's own comment says why the handler is inert: the rule commits
		// on blur / Enter, so a substring scan over the corpus runs once per query rather than once per
		// keystroke. An `onChange` that committed would be a plausible "make it feel live" edit that
		// nothing else here would notice. **A handler that deliberately does nothing is exactly the one
		// whose nothing needs pinning.**
		const { core, root } = mountPanel();
		const field = searchFieldIn(root);

		field.value = 'remodeled';
		field.dispatchEvent(new Event('input', { bubbles: true }));

		expect(core.getRules().has('text-search')).toBe(false);
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
