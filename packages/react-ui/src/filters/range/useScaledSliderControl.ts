/**
 * `useScaledSliderControl` — how `<RangeSlider />` runs Radix over a scaled track.
 *
 * @remarks
 * Radix's slider is value-based: it lays `min..max` out linearly and steps by `step`. That is exactly
 * right for a linear track, so a linear scale passes values straight through and the slider behaves as
 * it always has. Any other scale runs Radix over `0..SLIDER_POSITION_RESOLUTION` track positions
 * instead, and converts at the boundary: a value goes in as its position, a position comes out as a
 * value snapped to the slider's `step`.
 *
 * Kept apart from the component so the conversion rules read in one place, and so the component stays
 * about the slider's three layers rather than about coordinate systems.
 *
 * @packageDocumentation
 */

import { useCallback, useMemo } from 'react';

import type { NumericBounds } from './bounds.js';

import { linearSliderScale, SLIDER_POSITION_RESOLUTION, type SliderScale, snapToStep } from './scale.js';

/** Radix's `min` / `max` / `step` for one slider, in whichever coordinates the scale calls for. */
export interface ScaledControlDomain {
	/** Radix's `max`. */
	readonly max: number;
	/** Radix's `min`. */
	readonly min: number;
	/** Radix's `step`. */
	readonly step: number;
}

/** What {@link useScaledSliderControl} hands back to the slider. */
export interface ScaledSliderControl {
	/** Radix's domain. */
	readonly domain: ScaledControlDomain;
	/** Convert a Radix value to a slider value (identity on a linear track). */
	readonly fromControl: (control: number) => number;
	/** `true` when Radix runs over track positions rather than values. */
	readonly isPositionBased: boolean;
	/** Convert a slider value to a Radix value (identity on a linear track). */
	readonly toControl: (value: number) => number;
	/** The scale the track is drawn with: the caller's, or linear over the baseline. */
	readonly trackScale: SliderScale;
}

/**
 * Which arrow keys step a thumb, and in which direction.
 *
 * @param key - A `KeyboardEvent.key`.
 * @returns `1` for up/right, `-1` for down/left, `undefined` for any other key.
 */
export function arrowKeyDirection(key: string): -1 | 1 | undefined {
	if (key === 'ArrowRight' || key === 'ArrowUp') {
		return 1;
	}
	if (key === 'ArrowLeft' || key === 'ArrowDown') {
		return -1;
	}

	return undefined;
}

/**
 * Resolve a slider's scale and the Radix coordinates it implies.
 *
 * @param scale - The caller's scale, if any.
 * @param baseline - The track's extent; a missing scale is linear over it.
 * @param step - The slider's value step.
 * @returns The scale, the conversions and Radix's domain.
 */
export function useScaledSliderControl(scale: SliderScale | undefined, baseline: NumericBounds, step: number): ScaledSliderControl {
	const trackScale = useMemo(() => scale ?? linearSliderScale(baseline), [scale, baseline]);
	const isPositionBased = trackScale.kind !== 'linear';
	const toControl = useCallback(
		(value: number): number => (isPositionBased ? Math.round(trackScale.toFraction(value) * SLIDER_POSITION_RESOLUTION) : value),
		[isPositionBased, trackScale],
	);
	const fromControl = useCallback(
		(control: number): number => (isPositionBased ? snapToStep(trackScale.fromFraction(control / SLIDER_POSITION_RESOLUTION), step) : control),
		[isPositionBased, step, trackScale],
	);
	const domain = isPositionBased
		? { max: SLIDER_POSITION_RESOLUTION, min: 0, step: 1 }
		: { max: baseline.max, min: baseline.min, step };

	return { domain, fromControl, isPositionBased, toControl, trackScale };
}
