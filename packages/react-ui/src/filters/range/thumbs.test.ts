/**
 * Tests for the shared typed-bound and track-click decisions every slider makes.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { createSliderScale } from './scale.js';
import { nearestThumb, resolveTypedBound, snapClampToBounds } from './thumbs.js';

const AVAILABLE = { max: 100, min: 0 };

describe('snapClampToBounds', () => {
	it('snaps to the step', () => {
		expect(snapClampToBounds(12.5, 1, AVAILABLE)).toBe(13);
		expect(snapClampToBounds(1.25, 0.1, AVAILABLE)).toBeCloseTo(1.3, 10);
	});

	it('clamps into the reachable zone', () => {
		expect(snapClampToBounds(500, 1, AVAILABLE)).toBe(100);
		expect(snapClampToBounds(-3, 1, AVAILABLE)).toBe(0);
	});
});

describe('resolveTypedBound', () => {
	it('returns null for text that is not a number', () => {
		expect(resolveTypedBound(Number.NaN, 1, AVAILABLE)).toBeNull();
	});

	it('returns the snapped, clamped value otherwise', () => {
		expect(resolveTypedBound(155, 10, { max: 1500, min: 0 })).toBe(160);
		expect(resolveTypedBound(3.47, 0.1, { max: 5, min: 0 })).toBeCloseTo(3.5, 10);
	});
});

describe('nearestThumb', () => {
	const linear = (value: number): number => value / 100;

	it('moves the lower thumb for a click below it, the upper for a click above it', () => {
		expect(nearestThumb(5, 10, 90, linear)).toBe('lower');
		expect(nearestThumb(95, 10, 90, linear)).toBe('upper');
	});

	it('moves the nearer thumb between them, the lower on a tie', () => {
		expect(nearestThumb(30, 10, 90, linear)).toBe('lower');
		expect(nearestThumb(70, 10, 90, linear)).toBe('upper');
		expect(nearestThumb(50, 10, 90, linear)).toBe('lower');
	});

	it('measures on screen, not in value, on a log track', () => {
		// $600 is nearer $20 than $3,000 in value, and nearer $3,000 on a log track's screen.
		const scale = createSliderScale({ anchor: 'min', kind: 'log' }, { max: 3000, min: 4 }, 1);
		const lower = 20;
		const upper = 3000;
		const click = 600;

		expect(click - lower).toBeLessThan(upper - click);
		expect(nearestThumb(click, lower, upper, (value) => scale.toFraction(value))).toBe('upper');
	});
});
