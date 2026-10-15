/**
 * Tests for `<GeoRadiusSection />` — the distance filter both React apps render.
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
 * The Leaflet map is replaced at its module: it needs a real layout, and nothing here is about the map.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { createFilterEngine } from '@filter-enginez/core';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLinkSerializer } from '../url/linkSerializer.js';
import { GeoRadiusSection } from './GeoRadiusSection.js';
import { GEO_RADIUS_RULE_ID } from './real-estate-domain/geoRadiusLinks.js';
import { writeGeoRadius } from './real-estate-domain/geoRadiusRule.js';
import { type MapCoords } from './real-estate-domain/metroCenters.js';
import { milesToKm } from './real-estate-domain/units.js';

vi.mock('./LeafletRadiusMap.js', () => ({
	LeafletRadiusMap: (): null => null,
}));

afterEach(cleanup);

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

/**
 * Render the section over a fresh engine.
 *
 * @returns The engine.
 */
function renderSection(): SignalsEngine<Listing> {
	const engine = createSignalsEngine(createFilterEngine<Listing>({ sourceData: FIXTURE_LISTINGS }));

	render(
		<FilterEngineProvider engine={engine}>
			<GeoRadiusSection metroCenters={[]} />
		</FilterEngineProvider>,
	);

	return engine;
}

/**
 * The "Filter by distance" checkbox.
 *
 * @returns The checkbox element.
 */
function enableToggle(): HTMLInputElement {
	return screen.getByRole<HTMLInputElement>('checkbox', { name: 'Filter by distance' });
}

describe('GeoRadiusSection', () => {
	it('commits the shared distance rule, over the coords field, when enabled', async () => {
		const engine = renderSection();

		expect(enableToggle().checked).toBe(false);

		fireEvent.click(enableToggle());

		// The engine call runs a frame after the optimistic paint (`commitFilterMutation`).
		await waitFor(() => {
			expect(engine.core.getRules().has(GEO_RADIUS_RULE_ID)).toBe(true);
		});

		const serialized = engine.core.getRules().get(GEO_RADIUS_RULE_ID)?.serialize();

		expect(serialized?.type).toBe('GeoProximityRule');
		expect(serialized?.field).toBe('coords');
		expect(enableToggle().checked).toBe(true);
	});

	it('derives the checkbox, center and radius from a rule committed anywhere else', async () => {
		const engine = renderSection();

		await act(async () => {
			writeGeoRadius(engine.core, DENVER_FIVE_MILES);
			await Promise.resolve();
		});

		expect(enableToggle().checked).toBe(true);
		expect(screen.getByText(/within 5 miles of/u)).toBeDefined();
		expect(engine.core.getResultCount()).toBe(2);

		await act(async () => {
			writeGeoRadius(engine.core, undefined);
			await Promise.resolve();
		});

		expect(enableToggle().checked).toBe(false);
		expect(screen.queryByText(/within 5 miles of/u)).toBeNull();
	});

	it('opens a shared link written over a function field with the circle on and the same listings', async () => {
		const engine = renderSection();
		const serializer = createLinkSerializer('human-readable');
		// The distance rule as a link carries it when its field was an extractor: `"<function>"`.
		const oldLink = serializer.encode({
			rules: [{
				id: GEO_RADIUS_RULE_ID,
				rule: { config: DENVER_FIVE_MILES, field: '<function>', type: 'GeoProximityRule' },
			}],
			version: 1,
		});

		await act(async () => {
			engine.core.loadConfig(serializer.decode(oldLink));
			await Promise.resolve();
		});

		expect(enableToggle().checked).toBe(true);
		expect(screen.getByText(/within 5 miles of/u)).toBeDefined();
		// The two Denver listings, not the Miami one, and not zero.
		expect(engine.core.getResultCount()).toBe(2);
	});
});
