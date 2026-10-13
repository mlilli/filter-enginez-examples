/**
 * Tests for the radius map's two viewport decisions.
 *
 * @remarks
 * These are the only parts of the map that decide anything; the controller around them is Leaflet
 * glue. Both are the sort of rule that is invisible when correct and infuriating when wrong — a map
 * that yanks itself mid-drag, or a circle that overflows the viewport — and neither is caught by a
 * typecheck.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { boundingSquareSideMeters, shouldRecenter } from './radiusMapGeometry.js';

/** A viewport spanning the equator and prime meridian, 10 degrees each way. */
const BOUNDS = { east: 10, north: 10, south: -10, west: -10 };

describe('shouldRecenter', () => {
	it('leaves the viewport alone for a point well inside it', () => {
		// The common case during a marker drag: the map must NOT chase the marker, or the ground moves
		// under the pointer mid-gesture.
		expect(shouldRecenter(BOUNDS, { lat: 1, lng: 1 })).toBe(false);
	});

	it('recenters for a point beyond each edge', () => {
		expect(shouldRecenter(BOUNDS, { lat: 11, lng: 0 })).toBe(true);
		expect(shouldRecenter(BOUNDS, { lat: -11, lng: 0 })).toBe(true);
		expect(shouldRecenter(BOUNDS, { lat: 0, lng: 11 })).toBe(true);
		expect(shouldRecenter(BOUNDS, { lat: 0, lng: -11 })).toBe(true);
	});

	it('treats a point exactly on an edge as visible', () => {
		// Inclusive, matching Leaflet's own `LatLngBounds.contains`. A point on the boundary is on
		// screen, so jumping to it would be a visible twitch for no gain.
		expect(shouldRecenter(BOUNDS, { lat: 10, lng: 10 })).toBe(false);
		expect(shouldRecenter(BOUNDS, { lat: -10, lng: -10 })).toBe(false);
	});

	it('recenters when only one axis is outside', () => {
		// A near-miss: in range on latitude, out on longitude. An `&&` where the implementation needs
		// `||` would return false here and leave the marker off-screen.
		expect(shouldRecenter(BOUNDS, { lat: 0, lng: 50 })).toBe(true);
		expect(shouldRecenter(BOUNDS, { lat: 50, lng: 0 })).toBe(true);
	});
});

describe('boundingSquareSideMeters', () => {
	it('returns the circle diameter', () => {
		// The classic error is a factor of two: pass the radius and the circle overflows the viewport;
		// pass four times it and the circle shrinks to a dot.
		expect(boundingSquareSideMeters(1000)).toBe(2000);
	});

	it('handles a zero radius without a special case', () => {
		expect(boundingSquareSideMeters(0)).toBe(0);
	});
});
