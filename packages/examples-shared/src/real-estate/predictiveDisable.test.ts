/**
 * Tests for the real-estate panel's predictive-disable contract.
 *
 * @remarks
 * These assert the ENGINE-side behavior the panel depends on, not the React rendering: given a
 * bundle query shaped like `RealEstateFilterPanel`'s, does an active geo radius correctly mark the
 * unreachable school districts as `wouldBeEmpty`? A panel that leaves the districts out of its query
 * never gets the answer, however well the engine computes it.
 *
 * The scenario: select a Denver-area radius, then try to select the Austin school district. Without
 * predictive disable every district stays clickable and that pair renders zero results.
 */

import { createFilterEngine, geo, inSet } from '@filter-enginez/core';
import { type Listing, listings } from '@filter-enginez/mock-data/real-estate';
import { describe, expect, it } from 'vitest';

import { buildListingLocationTree, buildLocationNodeSpecs, extractListingCoords } from './real-estate-domain/extractors.js';

/** The location tree flattened into bundle candidates, exactly as the panel does it. */
const locationSpecs = buildLocationNodeSpecs(buildListingLocationTree(listings));

/** A 15-mile commute radius, the panel's default, in km. */
const FIFTEEN_MILES_KM = 24.14;

/** Centroid of a metro's listings — mirrors `GeoRadiusSection`'s `deriveMetroCenters`. */
function metroCenter(metroArea: string): { lat: number; lng: number; } {
	const inMetro = listings.filter((listing) => listing.metroArea === metroArea);

	return {
		lat: inMetro.reduce((sum, l) => sum + l.coordinates.lat, 0) / inMetro.length,
		lng: inMetro.reduce((sum, l) => sum + l.coordinates.lon, 0) / inMetro.length,
	};
}

/** Every school district in the corpus, as the panel derives them. */
const allDistricts = Array.from(new Set(listings.map((l) => l.schoolDistrict))).sort();

/** The panel's school-district chip group, in isolation. */
const districtGroup = {
	candidates: allDistricts,
	field: 'schoolDistrict',
	kind: 'inSet' as const,
	ruleId: 'school-district',
};

/** Boot an engine over the full corpus with an optional Denver radius applied. */
function bootEngine(options: { readonly withDenverRadius: boolean; }): ReturnType<typeof createFilterEngine<Listing>> {
	const engine = createFilterEngine<Listing>({ sourceData: listings });

	if (options.withDenverRadius) {
		engine.addRule(
			'geo-proximity',
			geo(extractListingCoords, { center: metroCenter('Greater Denver'), radiusKm: FIFTEEN_MILES_KM }),
		);
	}

	return engine;
}

describe('real-estate predictive disable', () => {
	it('leaves every district selectable when no other filter is active', () => {
		const engine = bootEngine({ withDenverRadius: false });
		const bundle = engine.applyFiltersAndQuery({ chipGroups: [districtGroup]});
		const candidates = bundle.chipGroups[0]?.candidates ?? [];

		expect(candidates).toHaveLength(allDistricts.length);
		expect(candidates.filter((c) => c.wouldBeEmpty)).toHaveLength(0);
	});

	it('marks out-of-radius districts unreachable once a Denver radius is active', () => {
		const engine = bootEngine({ withDenverRadius: true });

		// Sanity: the radius itself matched something, so a later empty projection means "this
		// district is out of range", not "the geo rule filtered everything away".
		expect(engine.getResultCount()).toBeGreaterThan(0);

		const bundle = engine.applyFiltersAndQuery({ chipGroups: [districtGroup]});
		const candidates = bundle.chipGroups[0]?.candidates ?? [];
		const reachable = candidates.filter((c) => !c.wouldBeEmpty).map((c) => c.value);

		// Only the Denver-metro districts survive. Asserted as a set rather than a count so the
		// failure message names the district that changed.
		expect(new Set(reachable)).toEqual(new Set(['Cherry Creek', 'Denver Public', 'Jeffco Public']));
	});

	it('marks Austin ISD unreachable under a Denver radius', () => {
		const engine = bootEngine({ withDenverRadius: true });
		const bundle = engine.applyFiltersAndQuery({ chipGroups: [districtGroup]});
		const austin = bundle.chipGroups[0]?.candidates.find((c) => c.value === 'Austin ISD');

		expect(austin).toBeDefined();
		expect(austin?.wouldBeEmpty).toBe(true);
		expect(austin?.projectedCount).toBe(0);
	});

	it('agrees with what actually committing the pair would produce', () => {
		// The invariant that matters: `wouldBeEmpty` is a promise about a future click. Verify it by
		// making the click and confirming the engine really does land on zero — otherwise the panel
		// could disable a chip that would have worked.
		const engine = bootEngine({ withDenverRadius: true });

		engine.addRule('school-district', inSet<string>('schoolDistrict', ['Austin ISD']));
		expect(engine.getResultCount()).toBe(0);
	});

	it('never reports an ALREADY-SELECTED district as unreachable', () => {
		// The escape-hatch invariant: whatever else is active, the user must be able to deselect. A
		// selected district's own results all pass it, so it can never project empty.
		const engine = bootEngine({ withDenverRadius: true });

		engine.addRule('school-district', inSet<string>('schoolDistrict', ['Denver Public']));

		const bundle = engine.applyFiltersAndQuery({ chipGroups: [districtGroup]});
		const selected = bundle.chipGroups[0]?.candidates.find((c) => c.value === 'Denver Public');

		expect(selected?.wouldBeEmpty).toBe(false);
	});

	it('disables location-tree nodes outside an active radius, at every level', () => {
		const engine = bootEngine({ withDenverRadius: true });
		const bundle = engine.applyFiltersAndQuery({
			chipGroups: [{ candidates: locationSpecs, field: 'locationId', kind: 'inSetOfSets', ruleId: 'location' }],
		});
		const candidates = bundle.chipGroups[0]?.candidates ?? [];
		const byId = new Map(candidates.map((c) => [c.value, c]));

		// The ancestors containing Denver stay reachable...
		expect(byId.get('state:CO')?.wouldBeEmpty).toBe(false);
		expect(byId.get('metro:CO/Greater Denver')?.wouldBeEmpty).toBe(false);
		// ...and an unrelated state collapses.
		expect(byId.get('state:WA')?.wouldBeEmpty).toBe(true);
	});

	it('discriminates neighborhoods that share a name across metros', () => {
		// The reason `locationId` is a materialized composite rather than the bare `neighborhood`
		// field. "Capitol Hill" exists in both Greater Seattle and Greater Denver; keyed on the bare
		// name, BOTH would project as reachable under a Denver radius — a false ENABLE, which is
		// worse than no predictive disable at all because it looks authoritative.
		const engine = bootEngine({ withDenverRadius: true });
		const bundle = engine.applyFiltersAndQuery({
			chipGroups: [{ candidates: locationSpecs, field: 'locationId', kind: 'inSetOfSets', ruleId: 'location' }],
		});
		const byId = new Map((bundle.chipGroups[0]?.candidates ?? []).map((c) => [c.value, c]));

		expect(byId.get('neighborhood:CO/Greater Denver/Capitol Hill')?.wouldBeEmpty).toBe(false);
		expect(byId.get('neighborhood:WA/Greater Seattle/Capitol Hill')?.wouldBeEmpty).toBe(true);
	});

	it('keeps every listing addressable by its locationId', () => {
		// The materialized field and the tree's leaf ids have to agree or the whole mechanism
		// silently reports everything unreachable. Pin the two together.
		const leafIds = new Set(
			locationSpecs
				.filter((spec) => spec.leafIds.length === 1 && spec.value.startsWith('neighborhood:'))
				.map((spec) => spec.leafIds[0]),
		);

		expect(listings.every((listing) => leafIds.has(listing.locationId))).toBe(true);
	});

	it('reports filtered-except-self bounds for the sliders, not the full corpus extent', () => {
		// The `available` zone: with a Denver radius on, the price range of REACHABLE listings should
		// be a strict subset of the corpus range, which is what dims the unreachable track.
		const engine = bootEngine({ withDenverRadius: true });
		const bundle = engine.applyFiltersAndQuery({
			fields: [{ baselineMax: 2_000_000, baselineMin: 0, fieldKey: 'priceUsd', ruleId: 'price' }],
		});
		const price = bundle.fields[0];

		expect(price?.bounds.min).not.toBeNull();
		expect(price?.bounds.max).not.toBeNull();

		const corpusMax = Math.max(...listings.map((l) => l.priceUsd));

		expect(price?.bounds.max ?? Infinity).toBeLessThan(corpusMax);
	});
});
