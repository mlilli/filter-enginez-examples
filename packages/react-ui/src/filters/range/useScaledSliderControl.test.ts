/**
 * Tests for the arrow-key mapping `<RangeSlider />` uses on a scaled track.
 *
 * @remarks
 * The hook itself is exercised through `RangeSlider.test.ts`, in both coordinate systems; this pins
 * the key table, all four arrows included, since the slider tests drive only left and right.
 */

import { describe, expect, it } from 'vitest';

import { arrowKeyDirection } from './useScaledSliderControl.js';

describe('arrowKeyDirection', () => {
	it.each([
		['ArrowRight', 1],
		['ArrowUp', 1],
		['ArrowLeft', -1],
		['ArrowDown', -1],
	] as const)('maps %s to %s', (key, direction) => {
		expect(arrowKeyDirection(key)).toBe(direction);
	});

	it.each(['Home', 'End', 'PageUp', 'a'])('leaves %s alone', (key) => {
		expect(arrowKeyDirection(key)).toBeUndefined();
	});
});
