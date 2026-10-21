/**
 * `thumbs` — what a range slider does with a typed bound and a click on its track, in every app.
 *
 * @remarks
 * The React slider runs on Radix; the Svelte, Vue, Angular and vanilla sliders are hand-rolled. The
 * two decisions here are easy for each of them to make on its own, and to make differently: whether a
 * typed `12.5` on a whole-number track commits as `12.5` or `13`, and which thumb a click on a
 * log-scaled track moves. Each slider asks these functions instead, so the same keystroke or click
 * lands the same thumb on the same value everywhere.
 *
 * Import-free apart from the step snap, so it is safe for every app through
 * `@filter-enginez/react-ui/bounds`.
 *
 * @packageDocumentation
 */

import type { NumericBounds } from './bounds.js';

import { snapToStep } from './scale.js';

/**
 * Snap a value to the slider's step, then clamp it into the reachable zone.
 *
 * @remarks
 * What a typed bound commits: `12.5` on a whole-number track becomes `13`, and a value past the
 * reachable zone becomes its edge, exactly as a drag to the same spot would.
 *
 * @param value - The parsed value.
 * @param step - The slider's value step.
 * @param available - The zone the thumbs can reach.
 * @returns The value a thumb can hold.
 */
export function snapClampToBounds(value: number, step: number, available: NumericBounds): number {
	return Math.max(available.min, Math.min(snapToStep(value, step), available.max));
}

/**
 * The value a typed bound commits, or `null` when the text is not a number.
 *
 * @remarks
 * `null` tells the slider to put the committed value back in the field and write nothing. A value
 * that snaps to the bound already committed is returned as is, and the slider writes nothing for it
 * either, because nothing changed.
 *
 * @param parsed - What the slider's parser made of the text; `NaN` for text that is not a number.
 * @param step - The slider's value step.
 * @param available - The zone the thumbs can reach.
 * @returns The snapped, clamped value, or `null`.
 */
export function resolveTypedBound(parsed: number, step: number, available: NumericBounds): number | null {
	return Number.isFinite(parsed) ? snapClampToBounds(parsed, step, available) : null;
}

/**
 * Which thumb a click on the track moves: the one nearer the click ON SCREEN.
 *
 * @remarks
 * A click below the lower thumb moves the lower one and a click above the upper thumb the upper one.
 * Between them the nearer thumb moves, measured in track position rather than in value: on a log
 * scale a click visually closer to the upper thumb can be closer in value to the lower one, and
 * moving the thumb the user did not point at reads as a slider that ignores the pointer. A tie moves
 * the lower thumb.
 *
 * @param value - The value under the click.
 * @param lower - The lower thumb's value.
 * @param upper - The upper thumb's value.
 * @param toFraction - The track's value → position mapping (`SliderScale.toFraction`).
 * @returns The thumb to move.
 */
export function nearestThumb(value: number, lower: number, upper: number, toFraction: (value: number) => number): 'lower' | 'upper' {
	if (value <= lower) {
		return 'lower';
	}
	if (value >= upper) {
		return 'upper';
	}
	const position = toFraction(value);

	return position - toFraction(lower) <= toFraction(upper) - position ? 'lower' : 'upper';
}
