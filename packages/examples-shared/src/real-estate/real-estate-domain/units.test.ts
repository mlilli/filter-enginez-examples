/**
 * Tests for the distance unit conversions behind the geo-proximity slider.
 *
 * @remarks
 * Tiny, but the direction is easy to invert and impossible to notice from the code: the slider reads
 * miles and `GeoProximityRule` takes kilometres, so a flipped conversion turns a 10-mile radius into
 * a 6.2-mile one. Both produce a plausible-looking set of nearby listings — just the wrong set, with
 * no error anywhere.
 */

import { describe, expect, it } from 'vitest';

import { kmToMiles, milesToKm } from './units.js';

describe('milesToKm', () => {
	it('converts using the international mile', () => {
		expect(milesToKm(1)).toBeCloseTo(1.609344, 6);
		expect(milesToKm(10)).toBeCloseTo(16.09344, 5);
	});

	it('grows the number — km are SHORTER than miles', () => {
		// The invertible half. If this shrank instead, every radius would silently tighten.
		expect(milesToKm(5)).toBeGreaterThan(5);
	});

	it('maps zero to zero', () => {
		expect(milesToKm(0)).toBe(0);
	});
});

describe('kmToMiles', () => {
	it('is the exact inverse of milesToKm', () => {
		// Round-tripping is the strongest assertion available here, and it catches a constant that was
		// changed in one function but not the other.
		for (const miles of [0.5, 1, 25, 500]) {
			expect(kmToMiles(milesToKm(miles))).toBeCloseTo(miles, 10);
		}
	});

	it('shrinks the number', () => {
		expect(kmToMiles(5)).toBeLessThan(5);
	});

	it('maps zero to zero', () => {
		expect(kmToMiles(0)).toBe(0);
	});
});
