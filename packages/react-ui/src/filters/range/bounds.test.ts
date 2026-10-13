/**
 * Tests for the numeric-bounds derivation helpers (`deriveBounds`, `deriveBaselineBounds`,
 * `clampToBounds`).
 *
 * @remarks
 * Pure input→output logic — no rendering — but the file still lands in the jsdom project
 * (the root `vitest.config.ts` assigns the whole `react-ui` package there); that is harmless
 * for a DOM-free suite. Straight value assertions; the only subtlety is the
 * reference-equality (`toBe`) checks on the `fallback` short-circuits, which is exactly the
 * behavior the callers rely on.
 */

import { describe, expect, it } from 'vitest';

import { clampToBounds, deriveBaselineBounds, deriveBounds, type NumericBounds } from './bounds.js';

/** A distinct fallback object so the `=== fallback` short-circuits are assertable by reference. */
const FALLBACK: NumericBounds = { max: 100, min: 0 };

describe('deriveBounds', () => {
	it('returns the exact fallback reference for an empty series', () => {
		expect(deriveBounds([], FALLBACK)).toBe(FALLBACK);
	});

	it('returns the exact fallback reference when every value is non-finite', () => {
		expect(deriveBounds([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY], FALLBACK)).toBe(
			FALLBACK,
		);
	});

	it('encloses a normal series with the tight min/max', () => {
		expect(deriveBounds([3, 1, 4, 1, 5, 9, 2, 6], FALLBACK)).toEqual({ max: 9, min: 1 });
	});

	it('collapses a single finite value to min === max', () => {
		expect(deriveBounds([7], FALLBACK)).toEqual({ max: 7, min: 7 });
	});

	it('skips interleaved non-finite values and still walks both extremes', () => {
		expect(deriveBounds([Number.NaN, 5, Number.POSITIVE_INFINITY, 2], FALLBACK)).toEqual({ max: 5, min: 2 });
	});
});

describe('deriveBaselineBounds', () => {
	it('returns the fallback reference when no finite value exists', () => {
		expect(deriveBaselineBounds([], FALLBACK, 5)).toBe(FALLBACK);
	});

	it('ignores non-numeric entries, so raw record fields can be passed straight through', () => {
		expect(deriveBaselineBounds([null, 'nope', undefined, 4, Number.NaN, 6], FALLBACK, 1)).toEqual({
			max: 6,
			min: 4,
		});
	});

	it('is a no-op on an integer grid of 1 (the default)', () => {
		expect(deriveBaselineBounds([1, 5], FALLBACK)).toEqual({ max: 5, min: 1 });
	});

	it('snaps both edges outward onto the grid', () => {
		expect(deriveBaselineBounds([1, 5], FALLBACK, 2)).toEqual({ max: 6, min: 0 });
	});

	it('widens a single-point range into a usable track', () => {
		// A padding implementation would short-circuit here and return {3,3} — a slider whose
		// min equals its max, which cannot be dragged.
		expect(deriveBaselineBounds([3, 3], FALLBACK, 5)).toEqual({ max: 5, min: 0 });
	});

	it('does not widen data that already sits on the grid', () => {
		// THE case snapping exists for. Padding would push both edges out by a full step
		// unconditionally, so a books `publicationYear` corpus topping out at 2025 would render a
		// track ending at 2026. Integer years on a grid of 1 must be left exactly alone.
		expect(deriveBaselineBounds([1990, 2025], { max: 2025, min: 1900 }, 1)).toEqual({
			max: 2025,
			min: 1990,
		});
	});

	it('does NOT clamp to the fallback, so a placeholder fallback cannot truncate the corpus', () => {
		// Deliberate, and measured: wine's price fallback is 400 against a corpus reaching
		// 800, and real estate's is $2M against listings reaching $3.13M. Treating `fallback`
		// as a ceiling would make those ranges physically unreachable on the slider. It means
		// only "what to show when there is no data".
		expect(deriveBaselineBounds([75_000, 3_130_091], { max: 2_000_000, min: 0 }, 10_000)).toEqual({
			max: 3_140_000,
			min: 70_000,
		});
	});

	it('snaps a fractional grid without float artifacts', () => {
		// Real estate's `lotSizeAcres` slider snaps to 0.1, so this is a live path. 0.3 is
		// chosen deliberately: it is ALREADY on the grid, and the naive `Math.floor(v / r) * r`
		// pushes it DOWN a whole step to 0.2 because `0.3 / 0.1` is 2.9999999999999996. Any
		// regression to divide-by-grid arithmetic fails right here.
		expect(deriveBaselineBounds([0.3, 0.7], { max: 5, min: 0 }, 0.1)).toEqual({
			max: 0.7,
			min: 0.3,
		});
	});

	it('snaps a fractional grid outward when the values are off-grid', () => {
		expect(deriveBaselineBounds([2.75, 4.31], { max: 5, min: 0 }, 0.1)).toEqual({
			max: 4.4,
			min: 2.7,
		});
	});

	it('returns the honest tight extent when roundTo is zero', () => {
		// Wine passes 0 for every slider (`SLIDER_STEPS` in `examples-shared`), so the track shows
		// the real data min/max with no breathing room. That path must stay exact — no snapping,
		// no clamping.
		expect(deriveBaselineBounds([1.5, 120], FALLBACK, 0)).toEqual({ max: 120, min: 1.5 });
	});
});

describe('clampToBounds', () => {
	const bounds: NumericBounds = { max: 10, min: 0 };

	it('returns min for a non-finite candidate', () => {
		expect(clampToBounds(Number.NaN, bounds)).toBe(0);
	});

	it('clamps a below-range candidate up to min', () => {
		expect(clampToBounds(-5, bounds)).toBe(0);
	});

	it('clamps an above-range candidate down to max', () => {
		expect(clampToBounds(15, bounds)).toBe(10);
	});

	it('passes an in-range candidate through unchanged', () => {
		expect(clampToBounds(5, bounds)).toBe(5);
	});
});
