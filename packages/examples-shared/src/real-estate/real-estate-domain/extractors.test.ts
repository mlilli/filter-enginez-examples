/**
 * Tests for the real-estate field extractors + location tree.
 *
 * @remarks
 * These sit on the seam between the picker's node ids (`neighborhood:CA/…`) and the listing's
 * `locationId` FIELD value (unprefixed). Getting that translation wrong is silent in both directions:
 * a spec whose `leafIds` carry the prefix matches nothing, so every node reads as unavailable; a node
 * `value` that drops it stops matching the picker's own ids, so nothing ever disables. Both render a
 * perfectly normal-looking tree.
 *
 * `extractListingCoords` also renames `lon` to `lng` — the corpus and the engine's `GeoCoords`
 * disagree on the spelling, and a pass-through would leave `lng` undefined, which reads as "no
 * coordinates" and quietly drops the listing from every distance filter.
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';
import type { PickerTreeNode } from '@filter-enginez/react-ui';

import { describe, expect, it } from 'vitest';

import {
	buildListingLocationTree,
	buildLocationNodeSpecs,
	extractListingCoords,
	extractListingLocationId,
} from './extractors.js';

/**
 * Narrow a `FieldExtractor` to its function form.
 *
 * @remarks
 * `FieldExtractor` is a union — a string key, an accessor function, or undefined. These two are
 * always the function form, but the union has to be narrowed before it can be called.
 *
 * @param extractor - The extractor under test.
 * @returns The same extractor, callable.
 */
function asFn(extractor: unknown): (item: unknown) => unknown {
	return extractor as (item: unknown) => unknown;
}

/** A listing carrying only the fields these extractors read. */
function listing(overrides: Record<string, unknown> = {}): Listing {
	return {
		coordinates: { lat: 37.7, lon: -122.4 },
		metroArea: 'San Francisco',
		neighborhood: 'Mission',
		state: 'CA',
		...overrides,
	} as unknown as Listing;
}

describe('extractListingCoords', () => {
	it('renames lon to lng for the engine', () => {
		// The corpus says `lon`; `GeoCoords` says `lng`. A pass-through leaves `lng` undefined, which
		// the geo rule reads as "no coordinates" and drops the listing from every distance filter.
		expect(asFn(extractListingCoords)(listing())).toEqual({ lat: 37.7, lng: -122.4 });
	});

	it.each([
		['coordinates are absent', { coordinates: undefined }],
		['lat is not a number', { coordinates: { lat: 'north', lon: -122.4 }}],
		['lon is not a number', { coordinates: { lat: 37.7, lon: null }}],
	])('returns undefined when %s', (_label, overrides) => {
		expect(asFn(extractListingCoords)(listing(overrides))).toBeUndefined();
	});

	it.each([
		['null', null],
		['undefined', undefined],
	])('returns undefined for a %s item rather than throwing', (_label, item) => {
		// The extractor runs against every record in the corpus; one sparse row must not take down the
		// whole filter pass.
		expect(asFn(extractListingCoords)(item)).toBeUndefined();
	});

	it('accepts zero coordinates — the null island is a valid point', () => {
		// A truthiness check instead of `typeof` would reject lat/lon of 0 and silently drop listings
		// on the equator or prime meridian.
		expect(asFn(extractListingCoords)(listing({ coordinates: { lat: 0, lon: 0 }}))).toEqual({ lat: 0, lng: 0 });
	});
});

describe('extractListingLocationId', () => {
	it('builds a prefixed state/metro/neighborhood path', () => {
		expect(asFn(extractListingLocationId)(listing())).toBe('neighborhood:CA/San Francisco/Mission');
	});

	it.each([
		['state', { state: undefined }],
		['metroArea', { metroArea: undefined }],
		['neighborhood', { neighborhood: undefined }],
	])('returns undefined when %s is missing', (_label, overrides) => {
		// A partial path would still be a STRING, so it would match nothing and disable the whole
		// branch rather than being treated as "this listing has no location".
		expect(asFn(extractListingLocationId)(listing(overrides))).toBeUndefined();
	});

	it.each([
		['null', null],
		['undefined', undefined],
	])('returns undefined for a %s item', (_label, item) => {
		expect(asFn(extractListingLocationId)(item)).toBeUndefined();
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

	it('strips the neighborhood prefix from leaf ids but keeps it on the node value', () => {
		// The whole translation. `leafIds` are matched against the listing's FIELD value (unprefixed);
		// `value` is echoed back to the picker, which keys on its own prefixed ids.
		const specs = buildLocationNodeSpecs(tree);
		const mission = specs.find((spec) => spec.value === 'neighborhood:CA/SF/Mission');

		expect(mission?.leafIds).toEqual(['CA/SF/Mission']);
	});

	it('rolls every descendant leaf up to its ancestors', () => {
		// Disabling a metro has to consider all its neighborhoods — a parent whose leafIds held only
		// its own id would never match any listing and would always read as unavailable.
		const specs = buildLocationNodeSpecs(tree);

		expect(specs.find((spec) => spec.value === 'metro:CA/SF')?.leafIds).toEqual(['CA/SF/Mission', 'CA/SF/Sunset']);
		expect(specs.find((spec) => spec.value === 'state:CA')?.leafIds).toEqual(['CA/SF/Mission', 'CA/SF/Sunset']);
	});

	it('emits a spec for every node, leaves and branches alike', () => {
		expect(buildLocationNodeSpecs(tree)).toHaveLength(4);
	});

	it('treats a childless root as its own leaf', () => {
		const specs = buildLocationNodeSpecs({ id: 'neighborhood:CA/SF/Mission', label: 'Mission' });

		expect(specs).toEqual([{ leafIds: ['CA/SF/Mission'], value: 'neighborhood:CA/SF/Mission' }]);
	});

	it('leaves a leaf id alone when it carries no neighborhood prefix', () => {
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

	it('produces node ids the extractor output can match', () => {
		// The two halves of the seam, checked against each other rather than against a hardcoded
		// string — that is what makes this a real round-trip and not two copies of the same typo.
		const rows = [listing()];
		const tree = buildListingLocationTree(rows);
		const specs = buildLocationNodeSpecs(tree);
		const fieldValue = String(asFn(extractListingLocationId)(rows[0]));
		const leafValue = fieldValue.replace('neighborhood:', '');

		expect(specs.some((spec) => spec.leafIds.includes(leafValue))).toBe(true);
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
