/**
 * Tests for `<fe-geo-radius-section>` — the distance filter.
 *
 * @remarks
 * Over a REAL engine, for the reason the panel spec gives: the value is that a control produces a
 * specific rule on a real engine. Two things are pinned:
 *
 * - **The rule is the shared one.** Enabling the filter commits a `GeoProximityRule` over the listing's
 *   `coords` field, the rule every app commits and the one a `?f=` link carries intact.
 * - **The checkbox, center and radius are derived from the committed rule.** A rule that arrives from
 *   anywhere else (a `?f=` link, "Clear all", the devtools), including a link written over a function
 *   field and read through the shared link serializer, turns the section on with its circle, and its
 *   removal turns it off.
 *
 * The Leaflet map is swapped for a stub with the same inputs: it would otherwise mount Leaflet under
 * jsdom, and nothing here is about the map.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { Component, input, output } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideEngineBusy, provideFilterEngine } from '@filter-enginez/angular-rxjs';
import { createLinkSerializer } from '@filter-enginez/examples-shared/link-serializer';
import { buildRealEstateEngine } from '@filter-enginez/examples-shared/real-estate-core';
import {
	GEO_RADIUS_RULE_ID,
	type MapCoords,
	milesToKm,
	writeGeoRadius,
} from '@filter-enginez/examples-shared/real-estate-domain';
import {
	createEngineBusyStream,
	createRxJsEngine,
	type EngineBusyStream,
	type RxJsEngine,
} from '@filter-enginez/reactive-rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GeoRadiusSectionComponent } from './geo-radius-section.component.js';
import { LeafletRadiusMapComponent } from './leaflet-radius-map.component.js';
import { deriveRealEstateFacets, REAL_ESTATE_FACETS } from './real-estate-facets.js';

/** Central Denver. */
const DENVER: MapCoords = { lat: 39.7392, lng: -104.9903 };

/** Central Miami, far outside any Denver circle. */
const MIAMI: MapCoords = { lat: 25.7617, lng: -80.1918 };

/** A five-mile circle around {@link DENVER}. */
const DENVER_FIVE_MILES = { center: DENVER, radiusKm: milesToKm(5) };

/**
 * A listing at a point, with every other field fixed.
 *
 * @param id - The listing's id.
 * @param point - Where it is.
 * @returns The listing.
 */
function listingAt(id: string, point: MapCoords): Listing {
	return {
		addressLine1: '1 Fixture Way',
		bathrooms: 2,
		bedrooms: 3,
		city: 'Fixture',
		coordinates: { lat: point.lat, lon: point.lng },
		coords: { lat: point.lat, lng: point.lng },
		description: 'a fixture listing',
		features: [],
		id,
		lastUpdated: '2026-01-01T00:00:00.000Z',
		listedDate: '2026-01-01T00:00:00.000Z',
		locationId: 'CO/Greater Denver/Capitol Hill',
		lotSizeAcres: 0.2,
		metroArea: 'Greater Denver',
		mlsId: `MLS-${id}`,
		neighborhood: 'Capitol Hill',
		openHouseDates: [],
		photos: [],
		priceUsd: 500_000,
		propertyType: 'condo',
		schoolDistrict: 'Denver ISD',
		squareFeet: 1000,
		state: 'CO',
		status: 'active',
		tier: 'default',
		title: `Fixture ${id}`,
		yearBuilt: 2000,
		zip: '80203',
	};
}

/** Two listings in Denver and one in Miami. */
const FIXTURE_LISTINGS: readonly Listing[] = [
	listingAt('denver-a', DENVER),
	listingAt('denver-b', { lat: DENVER.lat + 0.01, lng: DENVER.lng }),
	listingAt('miami', MIAMI),
];

/** The map's inputs and output, with no Leaflet behind them. */
@Component({
	selector: 'fe-leaflet-radius-map',
	template: '',
})
class StubRadiusMapComponent {
	public readonly center = input.required<MapCoords>();
	public readonly centerChange = output<MapCoords>();
	public readonly isPanelVisible = input.required<boolean>();
	public readonly radiusKm = input.required<number>();
}

describe('GeoRadiusSectionComponent', () => {
	let busy: EngineBusyStream;
	let engine: RxJsEngine<Listing>;
	let fixture: ComponentFixture<GeoRadiusSectionComponent>;

	/** The "Filter by distance" checkbox. */
	const enableToggle = (): HTMLInputElement =>
		fixture.nativeElement.querySelector('fe-checkbox-control input') as HTMLInputElement;

	/** The polite live region announcing the circle, or `null` while the filter is off. */
	const status = (): string | null =>
		(fixture.nativeElement.querySelector('.fe-geo__status') as HTMLElement | null)?.textContent ?? null;

	beforeEach(async () => {
		engine = createRxJsEngine(buildRealEstateEngine(FIXTURE_LISTINGS));
		busy = createEngineBusyStream();

		await TestBed.configureTestingModule({
			imports: [GeoRadiusSectionComponent],
			providers: [
				provideFilterEngine(engine),
				provideEngineBusy(busy),
				{ provide: REAL_ESTATE_FACETS, useValue: deriveRealEstateFacets(FIXTURE_LISTINGS) },
			],
		})
			.overrideComponent(GeoRadiusSectionComponent, {
				add: { imports: [StubRadiusMapComponent]},
				remove: { imports: [LeafletRadiusMapComponent]},
			})
			.compileComponents();

		fixture = TestBed.createComponent(GeoRadiusSectionComponent);
		fixture.componentRef.setInput('isPanelVisible', true);
		fixture.detectChanges();
	});

	afterEach(() => {
		busy.dispose();
	});

	it('commits the shared distance rule, over the coords field, when enabled', () => {
		expect(enableToggle().checked).toBe(false);

		enableToggle().click();
		fixture.detectChanges();

		const serialized = engine.core.getRules().get(GEO_RADIUS_RULE_ID)?.serialize();

		expect(serialized?.type).toBe('GeoProximityRule');
		expect(serialized?.field).toBe('coords');
		expect(enableToggle().checked).toBe(true);
	});

	it('derives the checkbox, center and radius from a rule committed anywhere else', () => {
		writeGeoRadius(engine.core, DENVER_FIVE_MILES);
		fixture.detectChanges();

		expect(enableToggle().checked).toBe(true);
		expect(status()).toContain('within 5 miles of');
		expect(engine.core.getResultCount()).toBe(2);

		writeGeoRadius(engine.core, undefined);
		fixture.detectChanges();

		expect(enableToggle().checked).toBe(false);
		expect(status()).toBeNull();
	});

	it('opens a shared link written over a function field with the circle on and the same listings', () => {
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
		fixture.detectChanges();

		expect(enableToggle().checked).toBe(true);
		expect(status()).toContain('within 5 miles of');
		// The two Denver listings, not the Miami one, and not zero.
		expect(engine.core.getResultCount()).toBe(2);
	});
});
