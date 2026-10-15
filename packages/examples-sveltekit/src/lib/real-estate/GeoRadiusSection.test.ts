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
 * The Leaflet controller is stubbed at the module the map component loads it from: it needs a real
 * layout, and nothing here is about the map.
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
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import GeoRadiusSection from './GeoRadiusSection.svelte';

vi.mock('@filter-enginez/examples-shared/real-estate-map', () => ({
	createRadiusMapController: () => ({
		destroy: () => undefined,
		invalidateSize: () => undefined,
		isDestroyed: () => false,
		setCenter: () => undefined,
		setRadius: () => undefined,
	}),
}));

// Not automatic in this app's vitest setup.
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
 * @returns The engine and the rendered container.
 */
function renderSection(): { readonly container: HTMLElement; readonly engine: SignalsEngine<Listing> } {
	const engine = createSignalsEngine(createFilterEngine<Listing>({ sourceData: FIXTURE_LISTINGS }));
	const { container } = render(GeoRadiusSection, { engine, metroCenters: []});

	return { container, engine };
}

/**
 * The "Filter by distance" checkbox.
 *
 * @param container - The rendered section.
 * @returns The checkbox element.
 */
function enableToggle(container: HTMLElement): HTMLInputElement {
	const node = container.querySelector<HTMLInputElement>('input[type="checkbox"]');

	if (node === null) {
		throw new Error('expected the distance enable checkbox');
	}

	return node;
}

describe('GeoRadiusSection', () => {
	it('commits the shared distance rule, over the coords field, when enabled', async () => {
		const { container, engine } = renderSection();

		expect(enableToggle(container).checked).toBe(false);

		await fireEvent.click(enableToggle(container));

		const serialized = engine.core.getRules().get(GEO_RADIUS_RULE_ID)?.serialize();

		expect(serialized?.type).toBe('GeoProximityRule');
		expect(serialized?.field).toBe('coords');
		expect(enableToggle(container).checked).toBe(true);
	});

	it('derives the checkbox, center and radius from a rule committed anywhere else', async () => {
		const { container, engine } = renderSection();

		writeGeoRadius(engine.core, DENVER_FIVE_MILES);
		await tick();

		expect(enableToggle(container).checked).toBe(true);
		expect(container.textContent).toContain('within 5 miles of');
		expect(engine.core.getResultCount()).toBe(2);

		writeGeoRadius(engine.core, undefined);
		await tick();

		expect(enableToggle(container).checked).toBe(false);
		expect(container.textContent).not.toContain('within 5 miles of');
	});

	it('opens a shared link written over a function field with the circle on and the same listings', async () => {
		const { container, engine } = renderSection();
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
		await tick();

		expect(enableToggle(container).checked).toBe(true);
		expect(container.textContent).toContain('within 5 miles of');
		// The two Denver listings, not the Miami one, and not zero.
		expect(engine.core.getResultCount()).toBe(2);
	});
});
