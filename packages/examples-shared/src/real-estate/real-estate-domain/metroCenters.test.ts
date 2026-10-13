/**
 * Tests for `deriveMetroCenters` — the corpus-derived metro dropdown options.
 *
 * @remarks
 * Small surface, but two things here are easy to break and invisible when broken: the `lon → lng`
 * rename at the boundary (a silent swap produces a map centered in the wrong hemisphere) and the
 * corpus-weighting of the mean (an unweighted average over distinct metros would drift as the corpus
 * regenerates). Both are pinned below with hand-computed expectations.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { describe, expect, it } from 'vitest';

import { deriveMetroCenters } from './metroCenters.js';

/**
 * Build a `Listing` carrying only the fields `deriveMetroCenters` reads. The cast is deliberate: the
 * full `Listing` has ~20 fields, none of which this function touches, and spelling them out would
 * make the test assert things it isn't testing.
 */
function listingAt(metroArea: string, lat: number, lon: number): Listing {
	return { coordinates: { lat, lon }, metroArea } as unknown as Listing;
}

describe('deriveMetroCenters', () => {
	it('returns an empty array for an empty corpus', () => {
		expect(deriveMetroCenters([])).toEqual([]);
	});

	it('maps the corpus `lon` field onto the `lng` spelling Leaflet and the rule use', () => {
		const [option] = deriveMetroCenters([listingAt('Austin', 30.27, -97.74)]);

		expect(option).toEqual({ center: { lat: 30.27, lng: -97.74 }, label: 'Austin' });
		// Guard the rename explicitly — `lon` leaking through would still "look right" in a shallow read.
		expect(option?.center).not.toHaveProperty('lon');
	});

	it('averages coordinates within a metro area', () => {
		const [option] = deriveMetroCenters([
			listingAt('Denver', 10, 20),
			listingAt('Denver', 30, 60),
		]);

		expect(option?.center).toEqual({ lat: 20, lng: 40 });
	});

	it('weights the mean by listing count, not by distinct coordinate', () => {
		// Three listings at lat 0 and one at lat 40 must average to 10, not to 20 — the latter is what a
		// naive average over unique positions would produce, and it would drift the map center.
		const [option] = deriveMetroCenters([
			listingAt('Phoenix', 0, 0),
			listingAt('Phoenix', 0, 0),
			listingAt('Phoenix', 0, 0),
			listingAt('Phoenix', 40, 40),
		]);

		expect(option?.center).toEqual({ lat: 10, lng: 10 });
	});

	it('emits one option per distinct metro area, sorted by label', () => {
		const options = deriveMetroCenters([
			listingAt('Seattle', 47, -122),
			listingAt('Austin', 30, -97),
			listingAt('Denver', 39, -104),
			listingAt('Austin', 30, -97),
		]);

		expect(options.map((option) => option.label)).toEqual(['Austin', 'Denver', 'Seattle']);
	});

	it('sorts with locale comparison rather than by code unit', () => {
		// A code-unit sort puts every uppercase letter before every lowercase one, so 'austin' would
		// land after 'Seattle'. `localeCompare` orders it the way a human reading the dropdown expects.
		const options = deriveMetroCenters([
			listingAt('Seattle', 47, -122),
			listingAt('austin', 30, -97),
		]);

		expect(options.map((option) => option.label)).toEqual(['austin', 'Seattle']);
	});
});
