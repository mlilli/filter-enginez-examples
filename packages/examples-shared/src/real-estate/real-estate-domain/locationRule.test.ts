/**
 * Tests for the location rule every real-estate app commits, and for reading a selection back out of
 * it.
 *
 * @remarks
 * The claim that matters is the round trip a `?f=` link takes: a selection committed here, exported,
 * and loaded into another engine has to pass the same listings. Over the generated corpus that is
 * checked against the plainest possible answer — the listings whose `state` is the selected state.
 *
 * @packageDocumentation
 */

import { createFilterEngine, hierarchical, InSetofSetsRule } from '@filter-enginez/core';
import { type Listing, listings } from '@filter-enginez/mock-data/real-estate';
import { describe, expect, it, vi } from 'vitest';

import { buildListingLocationTree, buildLocationNodeSpecs } from './extractors.js';
import { buildListingLocationRule, deriveLocationSelection, writeLocationSelection } from './locationRule.js';

/** The specs of the generated corpus, as every panel builds them. */
const SPECS = buildLocationNodeSpecs(buildListingLocationTree(listings));

/** A state of the corpus, and the listings that sit in it. */
const STATE = listings[0]?.state ?? '';

/** The number of listings in {@link STATE}. */
const STATE_LISTING_COUNT = listings.filter((listing) => listing.state === STATE).length;

describe('buildListingLocationRule', () => {
	it('builds an InSetofSetsRule over locationId, one set per selected node', () => {
		const rule = buildListingLocationRule([`state:${STATE}`], SPECS);

		expect(rule).toBeInstanceOf(InSetofSetsRule);
		expect(rule.field).toBe('locationId');
		expect(rule.config.set).toEqual([SPECS.find((spec) => spec.value === `state:${STATE}`)?.leafIds]);
	});

	it('lists the sets in the tree’s order, whatever order the selection came in', () => {
		const [first, second] = SPECS.filter((spec) => spec.value.startsWith('state:'));

		expect(buildListingLocationRule([second?.value ?? '', first?.value ?? ''], SPECS).config.set)
			.toEqual(buildListingLocationRule([first?.value ?? '', second?.value ?? ''], SPECS).config.set);
	});

	it('drops a selected id the tree does not contain', () => {
		expect(buildListingLocationRule(['state:ZZ'], SPECS).config.set).toEqual([]);
	});

	it('passes exactly the listings in the selected state — the same ones the tree rule passed', () => {
		const engine = createFilterEngine<Listing>({ sourceData: listings });
		const tree = buildListingLocationTree(listings);

		engine.addRule('location', buildListingLocationRule([`state:${STATE}`], SPECS));
		expect(engine.getResultCount()).toBe(STATE_LISTING_COUNT);

		const treeRuleEngine = createFilterEngine<Listing>({ sourceData: listings });

		treeRuleEngine.addRule('location', hierarchical((item: unknown) => `neighborhood:${(item as Listing).locationId}`, {
			selected: [`state:${STATE}`],
			tree,
		}));
		expect([...engine.getResultIndices()]).toEqual([...treeRuleEngine.getResultIndices()]);
		// Non-vacuous: a state is a strict, non-empty part of the corpus.
		expect(STATE_LISTING_COUNT).toBeGreaterThan(0);
		expect(STATE_LISTING_COUNT).toBeLessThan(listings.length);
	});

	it('survives an export and a load into another engine, which is the trip a link takes', () => {
		const engine = createFilterEngine<Listing>({ sourceData: listings });

		engine.addRule('location', buildListingLocationRule([`state:${STATE}`], SPECS));

		const reloaded = createFilterEngine<Listing>({ sourceData: listings });

		reloaded.loadConfig(JSON.parse(JSON.stringify(engine.exportConfig())) as ReturnType<typeof engine.exportConfig>);
		expect(reloaded.getResultCount()).toBe(STATE_LISTING_COUNT);
	});
});

describe('writeLocationSelection', () => {
	it('adds the rule for a non-empty selection', () => {
		const core = { addRule: vi.fn(), removeRule: vi.fn() };

		writeLocationSelection(core, [`state:${STATE}`], SPECS);

		expect(core.addRule).toHaveBeenCalledWith('location', expect.any(InSetofSetsRule));
		expect(core.removeRule).not.toHaveBeenCalled();
	});

	it('removes the rule for an empty selection, so "nothing selected" leaves nothing in the link', () => {
		const core = { addRule: vi.fn(), removeRule: vi.fn() };

		writeLocationSelection(core, [], SPECS);

		expect(core.removeRule).toHaveBeenCalledWith('location');
		expect(core.addRule).not.toHaveBeenCalled();
	});
});

describe('deriveLocationSelection', () => {
	/** A selection at every depth: a state, a metro of another state, a neighborhood of a third. */
	const SELECTION = [
		SPECS.find((spec) => spec.value.startsWith('state:'))?.value ?? '',
		SPECS.filter((spec) => spec.value.startsWith('metro:')).at(-1)?.value ?? '',
		SPECS.filter((spec) => spec.value.startsWith('neighborhood:')).at(-1)?.value ?? '',
	];

	it('reads back the selection the rule was built from', () => {
		expect(deriveLocationSelection(buildListingLocationRule(SELECTION, SPECS), SPECS)).toEqual(SELECTION);
	});

	it('reads a state with a single metro back as the state, and the metro as the metro', () => {
		// The sets differ only by the node's own id; without it the two would read back as one node.
		const singleMetroState = SPECS.find((spec) => spec.value.startsWith('state:') && spec.leafIds.filter((id) => id.split('/').length === 2).length === 1);
		const metro = SPECS.find((spec) => spec.value.startsWith(`metro:${singleMetroState?.value.slice('state:'.length) ?? ''}/`));

		expect(singleMetroState).toBeDefined();
		expect(deriveLocationSelection(buildListingLocationRule([singleMetroState?.value ?? ''], SPECS), SPECS)).toEqual([singleMetroState?.value]);
		expect(deriveLocationSelection(buildListingLocationRule([metro?.value ?? ''], SPECS), SPECS)).toEqual([metro?.value]);
	});

	it('matches a committed set regardless of the order its ids arrive in', () => {
		const spec = SPECS.find((candidate) => candidate.value.startsWith('metro:'));
		const rule = new InSetofSetsRule('locationId', [[...(spec?.leafIds ?? [])].reverse()]);

		expect(deriveLocationSelection(rule, SPECS)).toEqual([spec?.value]);
	});

	it('skips a committed set that names no node of this tree', () => {
		const rule = new InSetofSetsRule('locationId', [['ZZ/Nowhere/Gone'], SPECS[1]?.leafIds ?? []]);

		expect(deriveLocationSelection(rule, SPECS)).toEqual([SPECS[1]?.value]);
	});

	it.each([
		['no rule', undefined],
		['a rule whose config has no sets', hierarchical('locationId', { selected: ['state:CO'], tree: { id: 'location' }})],
		['a set list holding a non-list', new InSetofSetsRule<unknown>('locationId', ['CO' as unknown as readonly unknown[]])],
		['a set holding a non-string', new InSetofSetsRule<unknown>('locationId', [[7]])],
	])('reads %s as nothing selected', (_label, rule) => {
		expect(deriveLocationSelection(rule, SPECS)).toEqual([]);
	});

	it('reads nothing selected before boot, when there are no specs yet', () => {
		expect(deriveLocationSelection(buildListingLocationRule(SELECTION, SPECS), [])).toEqual([]);
	});
});
