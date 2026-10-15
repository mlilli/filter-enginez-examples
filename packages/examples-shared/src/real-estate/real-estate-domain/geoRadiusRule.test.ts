/**
 * Tests for the distance rule every real-estate app commits, and for reading its circle back out of it.
 *
 * @remarks
 * Three claims, over the generated corpus:
 *
 * - **The rule.** It is a `GeoProximityRule` over the `coords` string field, and it passes exactly the
 *   listings whose `coordinates` point lies within the radius, by the plainest possible reference: a
 *   haversine distance computed here from `coordinates.lat` / `coordinates.lon`.
 * - **The R-tree.** Over the engine every app boots (`buildRealEstateEngine`, default acceleration),
 *   the rule's matches come from the spatial index, and successive commits share one index, keyed on
 *   the `coords` field.
 * - **The read-back.** `deriveGeoRadius` returns the committed circle for the committed rule and
 *   nothing for anything else, so a panel's checkbox, center and radius follow the engine.
 *
 * @packageDocumentation
 */

import {
	createFilterEngine,
	type FilterRule,
	GeoProximityRule,
	initializeBitmapAcceleration,
	inSet,
	SpatialIndex,
} from '@filter-enginez/core';
import { type Listing, listings } from '@filter-enginez/mock-data/real-estate';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildRealEstateEngine } from '../buildRealEstateEngine.js';
import { GEO_RADIUS_RULE_ID } from './geoRadiusLinks.js';
import { buildListingGeoRadiusRule, deriveGeoRadius, type GeoRadius, writeGeoRadius } from './geoRadiusRule.js';

/** A 15-mile circle around the corpus' first listing, so it is certain to hold at least that one. */
const NEAR_FIRST_LISTING: GeoRadius = {
	center: { lat: listings[0]?.coordinates.lat ?? 0, lng: listings[0]?.coordinates.lon ?? 0 },
	radiusKm: 24.14,
};

/** Earth's mean radius in kilometers, the figure haversine distances are usually quoted against. */
const EARTH_RADIUS_KM = 6371;

/**
 * The great-circle distance between a listing's `coordinates` and a center, computed independently of
 * the engine.
 *
 * @param listing - The listing.
 * @param radius - The circle whose center to measure from.
 * @returns The distance in kilometers.
 */
function distanceKm(listing: Listing, radius: GeoRadius): number {
	const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
	const deltaLat = toRadians(listing.coordinates.lat - radius.center.lat);
	const deltaLng = toRadians(listing.coordinates.lon - radius.center.lng);
	const a = Math.sin(deltaLat / 2) ** 2
		+ Math.cos(toRadians(radius.center.lat)) * Math.cos(toRadians(listing.coordinates.lat)) * Math.sin(deltaLng / 2) ** 2;

	return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

beforeAll(async () => {
	await initializeBitmapAcceleration();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('buildListingGeoRadiusRule', () => {
	it('builds a GeoProximityRule over the coords field with the circle as its config', () => {
		const rule = buildListingGeoRadiusRule(NEAR_FIRST_LISTING);

		expect(rule).toBeInstanceOf(GeoProximityRule);
		expect(rule.field).toBe('coords');
		expect(rule.config).toEqual({ center: NEAR_FIRST_LISTING.center, radiusKm: NEAR_FIRST_LISTING.radiusKm });
		expect(rule.serialize().field).toBe('coords');
	});

	it('passes exactly the listings within the radius of the center', () => {
		const engine = createFilterEngine<Listing>({ sourceData: listings });
		// Every listing in range, by a haversine computed here, with a hair of slack on the boundary
		// for the engine's own Earth radius and rounding.
		const expected = listings.flatMap((listing, index) => (distanceKm(listing, NEAR_FIRST_LISTING) <= NEAR_FIRST_LISTING.radiusKm ? [index] : []));

		engine.addRule(GEO_RADIUS_RULE_ID, buildListingGeoRadiusRule(NEAR_FIRST_LISTING));

		expect([...engine.getResultIndices()]).toEqual(expected);
		// Non-vacuous: the circle narrows the corpus without emptying it.
		expect(expected.length).toBeGreaterThan(0);
		expect(expected.length).toBeLessThan(listings.length);
	});
});

describe('the R-tree, over the engine every app boots', () => {
	it('answers the committed rule from the spatial index, and every commit shares one index', () => {
		const queryRadius = vi.spyOn(SpatialIndex.prototype, 'queryRadius');
		const engine = buildRealEstateEngine(listings);
		const wider: GeoRadius = { ...NEAR_FIRST_LISTING, radiusKm: 2 * NEAR_FIRST_LISTING.radiusKm };

		writeGeoRadius(engine, NEAR_FIRST_LISTING);
		const throughTree = [...engine.computeResults()];

		writeGeoRadius(engine, wider);
		engine.computeResults();

		expect(queryRadius).toHaveBeenCalledWith(NEAR_FIRST_LISTING.center, NEAR_FIRST_LISTING.radiusKm);
		expect(queryRadius).toHaveBeenCalledWith(wider.center, wider.radiusKm);
		// One index for both commits: the engine keys its spatial indexes on the rule's field.
		const indexes = new Set(queryRadius.mock.contexts);

		expect(indexes.size).toBe(1);

		// And the tree's answer is the scan's.
		const scan = createFilterEngine<Listing>({ acceleration: { spatialIndex: 'off' }, sourceData: listings });

		writeGeoRadius(scan, NEAR_FIRST_LISTING);
		expect([...scan.computeResults()]).toEqual(throughTree);
	});
});

describe('writeGeoRadius', () => {
	it('adds the rule for a circle and removes it for none', () => {
		const engine = createFilterEngine<Listing>({ sourceData: listings });

		writeGeoRadius(engine, NEAR_FIRST_LISTING);
		expect(engine.getRules().get(GEO_RADIUS_RULE_ID)).toBeInstanceOf(GeoProximityRule);
		expect(engine.getRules().get(GEO_RADIUS_RULE_ID)?.field).toBe('coords');

		writeGeoRadius(engine, undefined);
		expect(engine.getRules().has(GEO_RADIUS_RULE_ID)).toBe(false);
		expect(engine.getResultCount()).toBe(listings.length);
	});
});

describe('deriveGeoRadius', () => {
	it('reads the committed circle back, with the rule’s own center object', () => {
		const rule = buildListingGeoRadiusRule(NEAR_FIRST_LISTING);
		const derived = deriveGeoRadius(rule);

		expect(derived).toEqual(NEAR_FIRST_LISTING);
		// The same object, so a panel comparing centers by identity sees no change after its own commit.
		expect(derived?.center).toBe(rule.config.center);
	});

	it('reads no circle when there is no rule', () => {
		expect(deriveGeoRadius(undefined)).toBeUndefined();
	});

	it('reads no circle from a rule of another shape under the id', () => {
		expect(deriveGeoRadius(inSet<string>('status', ['active']))).toBeUndefined();
	});

	it.each([
		['a null config', null],
		['a center that is not an object', { center: 'Denver', radiusKm: 10 }],
		['a null center', { center: null, radiusKm: 10 }],
		['a center without a numeric lat', { center: { lat: '39.7', lng: -104.9 }, radiusKm: 10 }],
		['a center without a numeric lng', { center: { lat: 39.7, lon: -104.9 }, radiusKm: 10 }],
		['a radius that is not a number', { center: { lat: 39.7, lng: -104.9 }, radiusKm: '10' }],
	])('reads no circle from a config with %s', (_label, config) => {
		// A rule as a malformed link would revive it: the shape is checked, not trusted.
		expect(deriveGeoRadius({ config } as unknown as FilterRule)).toBeUndefined();
	});
});
