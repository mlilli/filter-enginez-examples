/**
 * Tests for the real-estate location tree.
 *
 * @remarks
 * These sit on the seam between the picker's node ids (`neighborhood:CA/…`) and the listing's
 * `locationId` FIELD value (unprefixed). Getting that translation wrong is silent in both directions:
 * a spec whose `leafIds` carry the prefix matches nothing, so every node reads as unavailable; a node
 * `value` that drops it stops matching the picker's own ids, so nothing ever disables. Both render a
 * perfectly normal-looking tree.
 *
 * `toLocationFieldId` is that translation, and the specs' sets are what the committed location rule and
 * the bundle both match.
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';
import type { PickerTreeNode } from '@filter-enginez/react-ui';

import { describe, expect, it } from 'vitest';

import {
	buildListingLocationTree,
	buildLocationNodeSpecs,
	toLocationFieldId,
} from './extractors.js';

/** A listing carrying only the fields the location tree reads. */
function listing(overrides: Record<string, unknown> = {}): Listing {
	return {
		metroArea: 'San Francisco',
		neighborhood: 'Mission',
		state: 'CA',
		...overrides,
	} as unknown as Listing;
}

describe('toLocationFieldId', () => {
	it.each([
		['a neighborhood', 'neighborhood:CA/SF/Mission', 'CA/SF/Mission'],
		['a metro', 'metro:CA/SF', 'CA/SF'],
		['a state', 'state:CA', 'CA'],
		['the unprefixed root', 'location', 'location'],
	])('drops the level prefix of %s', (_label, nodeId, fieldId) => {
		expect(toLocationFieldId(nodeId)).toBe(fieldId);
	});
});

describe('buildLocationNodeSpecs', () => {
	/** A three-level tree: state → metro → two neighborhoods. */
	const tree: PickerTreeNode = {
		children: [{
			children: [
				{ id: 'neighborhood:CA/SF/Mission', label: 'Mission' },
				{ id: 'neighborhood:CA/SF/Sunset', label: 'Sunset' },
			],
			id: 'metro:CA/SF',
			label: 'SF',
		}],
		id: 'state:CA',
		label: 'CA',
	};

	it('strips the prefix from the field-space ids but keeps it on the node value', () => {
		// The whole translation. `leafIds` are matched against the listing's FIELD value (unprefixed);
		// `value` is echoed back to the picker, which keys on its own prefixed ids.
		const specs = buildLocationNodeSpecs(tree);
		const mission = specs.find((spec) => spec.value === 'neighborhood:CA/SF/Mission');

		expect(mission?.leafIds).toEqual(['CA/SF/Mission']);
	});

	it('rolls every descendant up to its ancestors, each node’s own id first', () => {
		// Disabling a metro has to consider all its neighborhoods — a parent whose set held only its own
		// id would never match any listing and would always read as unavailable.
		const specs = buildLocationNodeSpecs(tree);

		expect(specs.find((spec) => spec.value === 'metro:CA/SF')?.leafIds).toEqual(['CA/SF', 'CA/SF/Mission', 'CA/SF/Sunset']);
		expect(specs.find((spec) => spec.value === 'state:CA')?.leafIds).toEqual(['CA', 'CA/SF', 'CA/SF/Mission', 'CA/SF/Sunset']);
	});

	it('gives a state with a single metro a set of its own', () => {
		// Without the node's own id the state's set and its only metro's set would be equal, and a
		// committed set could not be read back as the node that was clicked.
		const specs = buildLocationNodeSpecs(tree);
		const keys = specs.map((spec) => [...spec.leafIds].sort().join('|'));

		expect(new Set(keys).size).toBe(specs.length);
	});

	it('emits a spec for every node, leaves and branches alike, in pre-order', () => {
		expect(buildLocationNodeSpecs(tree).map((spec) => spec.value)).toEqual([
			'state:CA',
			'metro:CA/SF',
			'neighborhood:CA/SF/Mission',
			'neighborhood:CA/SF/Sunset',
		]);
	});

	it('treats a childless root as its own leaf', () => {
		const specs = buildLocationNodeSpecs({ id: 'neighborhood:CA/SF/Mission', label: 'Mission' });

		expect(specs).toEqual([{ leafIds: ['CA/SF/Mission'], value: 'neighborhood:CA/SF/Mission' }]);
	});

	it('leaves an id alone when it carries no level prefix', () => {
		const specs = buildLocationNodeSpecs({ id: 'unprefixed', label: 'Odd one' });

		expect(specs[0]?.leafIds).toEqual(['unprefixed']);
	});
});

describe('buildListingLocationTree', () => {
	it('groups listings into state → metro → neighborhood', () => {
		const tree = buildListingLocationTree([
			listing(),
			listing({ neighborhood: 'Sunset' }),
			listing({ metroArea: 'Austin', neighborhood: 'Downtown', state: 'TX' }),
		]);
		const states = tree.children ?? [];

		expect(states.map((state) => state.id).sort()).toEqual(['state:CA', 'state:TX']);

		const california = states.find((state) => state.id === 'state:CA');

		expect(california?.children?.[0]?.children).toHaveLength(2);
	});

	it('produces leaf ids that are the listings’ own locationId once translated', () => {
		// The two halves of the seam, checked against each other rather than against a hardcoded
		// string — that is what makes this a real round-trip and not two copies of the same typo.
		const rows = [listing({ locationId: 'CA/San Francisco/Mission' })];
		const leaves = buildLocationNodeSpecs(buildListingLocationTree(rows)).filter((spec) => spec.value.startsWith('neighborhood:'));

		expect(leaves.map((spec) => spec.leafIds)).toEqual([[rows[0]?.locationId]]);
	});

	it('sorts states, metros and neighborhoods alphabetically', () => {
		// Every level has its own comparator, and a comparator is NOT called when its level holds a
		// single entry — so a fixture with one metro per state leaves the metro sort unexercised. This
		// gives one state two metros, deliberately supplied out of order.
		const tree = buildListingLocationTree([
			listing({ metroArea: 'San Francisco', neighborhood: 'Sunset' }),
			listing({ metroArea: 'Bakersfield', neighborhood: 'Westchester' }),
			listing({ metroArea: 'San Francisco', neighborhood: 'Mission' }),
		]);
		const metros = tree.children?.[0]?.children ?? [];

		expect(metros.map((metro) => metro.id)).toEqual(['metro:CA/Bakersfield', 'metro:CA/San Francisco']);

		const sanFrancisco = metros.find((metro) => metro.id === 'metro:CA/San Francisco');

		expect(sanFrancisco?.children?.map((node) => node.label)).toEqual(['Mission', 'Sunset']);
	});

	it('handles an empty corpus without throwing', () => {
		expect(buildListingLocationTree([]).children ?? []).toEqual([]);
	});
});
