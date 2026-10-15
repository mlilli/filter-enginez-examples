/**
 * Tests for `<GeoRadiusSection>` — the distance filter.
 *
 * @remarks
 * Over a real engine. Two things are pinned:
 *
 * - **The rule is the shared one.** Enabling the filter commits a `GeoProximityRule` over the listing's
 *   `coords` field, the rule every app commits and the one a `?f=` link carries intact.
 * - **The checkbox, center and radius are derived from the committed rule.** A rule that arrives from
 *   anywhere else (a `?f=` link, "Clear all", the devtools), including a link written over a function
 *   field and read through the shared link serializer, turns the section on with its circle, and its
 *   removal turns it off.
 *
 * The Leaflet map is stubbed: it loads Leaflet on mount, which needs a real layout, and nothing here is
 * about the map.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { createFilterEngine } from '@filter-enginez/core';
import { createLinkSerializer } from '@filter-enginez/examples-shared/link-serializer';
import {
	GEO_RADIUS_RULE_ID,
	type MapCoords,
	milesToKm,
	writeGeoRadius,
} from '@filter-enginez/examples-shared/real-estate-domain';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import GeoRadiusSection from './GeoRadiusSection.vue';

/** Central Denver. */
const DENVER: MapCoords = { lat: 39.7392, lng: -104.9903 };

/** Central Miami, far outside any Denver circle. */
const MIAMI: MapCoords = { lat: 25.7617, lng: -80.1918 };

/** A five-mile circle around {@link DENVER}. */
const DENVER_FIVE_MILES = { center: DENVER, radiusKm: milesToKm(5) };

/**
 * A listing at a point. Only the coordinates are read by anything under test.
 *
 * @param id - The listing's id.
 * @param point - Where it is.
 * @returns The listing.
 */
function listingAt(id: string, point: MapCoords): Listing {
	return {
		coordinates: { lat: point.lat, lon: point.lng },
		coords: { lat: point.lat, lng: point.lng },
		id,
	} as unknown as Listing;
}

/** Two listings in Denver and one in Miami. */
const FIXTURE_LISTINGS: readonly Listing[] = [
	listingAt('denver-a', DENVER),
	listingAt('denver-b', { lat: DENVER.lat + 0.01, lng: DENVER.lng }),
	listingAt('miami', MIAMI),
];

/** Every mounted wrapper, unmounted after each test. */
const mounted: VueWrapper[] = [];

/**
 * Mount the section over a fresh engine.
 *
 * @returns The wrapper and the engine.
 */
function mountSection(): { readonly engine: SignalsEngine<Listing>; readonly wrapper: VueWrapper } {
	const engine = createSignalsEngine(createFilterEngine<Listing>({ sourceData: FIXTURE_LISTINGS }));
	const wrapper = mount(GeoRadiusSection, {
		global: { stubs: { LeafletRadiusMap: true }},
		props: { engine, metroCenters: []},
	});

	mounted.push(wrapper);

	return { engine, wrapper };
}

/**
 * The "Filter by distance" checkbox.
 *
 * @param wrapper - The mounted section.
 * @returns The checkbox element.
 */
function enableToggle(wrapper: VueWrapper): HTMLInputElement {
	return wrapper.get<HTMLInputElement>('input[type="checkbox"]').element;
}

afterEach(() => {
	for (const wrapper of mounted.splice(0)) {
		wrapper.unmount();
	}
});

describe('GeoRadiusSection', () => {
	it('commits the shared distance rule, over the coords field, when enabled', async () => {
		const { engine, wrapper } = mountSection();

		expect(enableToggle(wrapper).checked).toBe(false);

		await wrapper.get('input[type="checkbox"]').setValue(true);

		const serialized = engine.core.getRules().get(GEO_RADIUS_RULE_ID)?.serialize();

		expect(serialized?.type).toBe('GeoProximityRule');
		expect(serialized?.field).toBe('coords');
		expect(enableToggle(wrapper).checked).toBe(true);
	});

	it('derives the checkbox, center and radius from a rule committed anywhere else', async () => {
		const { engine, wrapper } = mountSection();

		writeGeoRadius(engine.core, DENVER_FIVE_MILES);
		await flushPromises();

		expect(enableToggle(wrapper).checked).toBe(true);
		expect(wrapper.text()).toContain('within 5 miles of');
		expect(engine.core.getResultCount()).toBe(2);

		writeGeoRadius(engine.core, undefined);
		await flushPromises();

		expect(enableToggle(wrapper).checked).toBe(false);
		expect(wrapper.text()).not.toContain('within 5 miles of');
	});

	it('opens a shared link written over a function field with the circle on and the same listings', async () => {
		const { engine, wrapper } = mountSection();
		const serializer = createLinkSerializer('human-readable');
		// The distance rule as a link carries it when its field was an extractor: `"<function>"`.
		const oldLink = serializer.encode({
			rules: [{
				id: GEO_RADIUS_RULE_ID,
				rule: { config: DENVER_FIVE_MILES, field: '<function>', type: 'GeoProximityRule' },
			}],
			version: 1,
		});

		engine.core.loadConfig(serializer.decode(oldLink));
		await flushPromises();

		expect(enableToggle(wrapper).checked).toBe(true);
		expect(wrapper.text()).toContain('within 5 miles of');
		// The two Denver listings, not the Miami one, and not zero.
		expect(engine.core.getResultCount()).toBe(2);
	});
});
