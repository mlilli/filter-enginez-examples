/**
 * Tiny min/max-derivation helpers for the demo apps' numeric filters.
 *
 * @remarks
 * **This module is deliberately React-free and is published as its own `./bounds` subpath.**
 * It imports nothing — not React, not the engine, not a browser global — so the Vue, Svelte,
 * vanilla and Angular verticals can consume it via `@filter-enginez/react-ui/bounds` without
 * dragging React into their bundles. Importing it through the package ROOT would pull the
 * whole component barrel; the subpath exists precisely to avoid that. Keep it import-free: the
 * moment anything is added here, five bundles silently re-taint.
 *
 * Being import-free is what lets every vertical, and every dataset, share the one
 * {@link deriveBaselineBounds} instead of keeping a local near-duplicate that would diverge into a
 * different algorithm — see the note on {@link deriveBaselineBounds}.
 *
 * A standing design rule: NOTHING about the
 * filter UX should be hardcoded against the data — bounds, vocabularies, distributions, all
 * derived. This module is the single source of truth for "what is the legal range a slider
 * handle can occupy" (the baseline) and "what is the meaningful range given everything else
 * the user is currently filtering on" (the available zone).
 *
 * **Two bounds, two purposes.**
 *
 *   - **`baseline`** — derived ONCE from the full source corpus at boot. Defines the absolute
 *     min/max of the slider track and the clamp-to range for the editable text inputs above
 *     the slider. Static for the engine's lifetime (or until `setSourceData` triggers a re-
 *     derivation).
 *   - **`available`** — derived from the "filtered-except-this-rule" subset on EVERY rule
 *     change. Defines the range the handles can actually drag to and the dimmed-vs-active
 *     visual zones on the slider track. Shrinks as the user constrains other rules, expands
 *     as they relax them.
 *
 * `baseline.min === available.min` and `baseline.max === available.max` is the unconstrained
 * starting state — every slider opens here and walks inward as the user filters.
 *
 * @packageDocumentation
 */

/**
 * A min/max pair. Identical shape to `RangeRule`'s config but kept structurally separate so
 * the bounds helpers stay UI-only (no engine dep).
 */
export interface NumericBounds {
	readonly max: number;
	readonly min: number;
}

/**
 * Compute `{min, max}` over a numeric value series. Empty / all-non-finite input returns
 * `fallback` so the slider geometry never gets `NaN` or `Infinity`.
 *
 * @param values - The numeric series to scan (e.g., every wine's `priceUsd` field).
 * @param fallback - Returned when `values` is empty or every value is non-finite. Typical
 *   choice: the baseline bounds (so an empty available set collapses to the baseline rather
 *   than vanishing the slider).
 * @returns The tight `{min, max}` enclosing `values`, or `fallback`.
 */
export function deriveBounds(
	values: readonly number[],
	fallback: NumericBounds,
): NumericBounds {
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	let didSeeAny = false;

	for (const v of values) {
		if (!Number.isFinite(v)) {
			continue;
		}
		didSeeAny = true;
		if (v < min) {
			min = v;
		}
		if (v > max) {
			max = v;
		}
	}
	if (!didSeeAny) {
		return fallback;
	}

	return { max, min };
}

/**
 * Round `value` away from zero-of-the-interval onto the `roundTo` grid, without float dust.
 *
 * @remarks
 * The naive `Math.floor(v / r) * r` is exact for integer grids but wrong on fractional ones —
 * measurably, not theoretically: on a `0.1` grid it misplaces 67 of the 2001 values from
 * `0.00` to `20.00`, starting with `Math.floor(0.3 / 0.1) * 0.1 === 0.2`. Real estate's
 * `lotSizeAcres` slider snaps to `0.1`, so this is a live path.
 *
 * The fix is to divide in integer space. Dividing BY a fractional grid is the lossy step
 * (`0.3 / 0.1` is `2.9999999999999996`); multiplying by a power of ten is exact for every
 * magnitude these sliders see (`0.3 * 10` is precisely `3`). So scale both operands up by the
 * grid's decimal places, snap against an integer step, and scale the integer result back
 * down. No epsilon or precision-trimming is needed, and adding one would be untestable.
 *
 * @param value - The raw extent to snap.
 * @param roundTo - Grid granularity; assumed `> 0`.
 * @param direction - `'down'` for the lower bound, `'up'` for the upper.
 * @returns `value` snapped outward onto the grid.
 */
function snapOutward(value: number, roundTo: number, direction: 'down' | 'up'): number {
	const text = String(roundTo);
	const dot = text.indexOf('.');
	// Exponential notation (1e-7) defeats the decimal count; such a grid is finer than any
	// slider needs, so fall back to unscaled arithmetic rather than mis-parsing it.
	const decimals = dot === -1 || text.includes('e') ? 0 : text.length - dot - 1;
	const scale = 10 ** decimals;
	const scaledStep = Math.round(roundTo * scale);
	const scaledValue = value * scale;
	const snapped =
		direction === 'down'
			? Math.floor(scaledValue / scaledStep) * scaledStep
			: Math.ceil(scaledValue / scaledStep) * scaledStep;

	return snapped / scale;
}

/**
 * Derive the **baseline** track extents for a numeric field — the min/max the slider track
 * always spans, computed once from the full corpus at boot.
 *
 * @remarks
 * One transformation of the tight extent: **snap outward** onto the `roundTo` grid — `min`
 * floors, `max` ceils. That is the whole rewrite.
 *
 * Padding by ±step instead would turn a books corpus whose newest title is 2025 into a
 * `publicationYear` track ending at **2026** — a year the corpus has no book in. Snapping serves
 * padding's purpose (room
 * at the end-caps, so the handle doesn't look cropped, plus a non-degenerate track when every
 * value is identical) while keeping the numbers ROUND. Roundness matters because the extents
 * are user-visible in the editable inputs above the slider: `20 – 710` beats `10 – 718`.
 *
 * ### `fallback` is NOT a clamp, and deliberately so
 *
 * Clamping the result into `fallback` would be harmless on books, whose corpus happens to sit
 * inside its fallback — the clamp would never fire. Measured across the other datasets, it
 * truncates three of the sliders badly:
 *
 * | slider                 | corpus reaches | fallback | clamped result       |
 * | ---------------------- | -------------- | -------- | -------------------- |
 * | wine `price`           | 800            | 400      | half the range gone  |
 * | wine `vintage`         | back to 1945   | 2008     | 63 years unreachable |
 * | real estate `priceUsd` | 3,130,091      | 2,000,000| $1.1M gone           |
 *
 * Those `fallback` values are pre-boot placeholders — plausible numbers so the track isn't a
 * degenerate point during the frame before `sourceData` arrives — not declared limits. Since
 * no caller wants a clamp and three are corrupted by one, `fallback` means exactly one thing:
 * **the result when no finite value exists.** A caller that genuinely needs a ceiling should
 * pass the derived bounds through {@link clampToBounds} and say why at the call site.
 *
 * Use this for `baseline` bounds only. `available` bounds (recomputed per rule change) want
 * the tight {@link deriveBounds}, where the dimmed zone communicates the data edge precisely.
 *
 * @param values - The raw field values across the corpus. Accepts `unknown[]` so callers can
 *   pass record fields straight through; non-numeric and non-finite entries are skipped.
 * @param fallback - Returned by reference when `values` holds no finite number.
 * @param roundTo - Snap granularity, conventionally the slider's `step`. `<= 0` disables
 *   snapping and yields the honest tight extent. Defaults to `1`.
 * @returns The baseline bounds for the slider track.
 */
export function deriveBaselineBounds(
	values: readonly unknown[],
	fallback: NumericBounds,
	roundTo = 1,
): NumericBounds {
	let low = Number.POSITIVE_INFINITY;
	let high = Number.NEGATIVE_INFINITY;

	for (const value of values) {
		if (typeof value === 'number' && Number.isFinite(value)) {
			if (value < low) {
				low = value;
			}
			if (value > high) {
				high = value;
			}
		}
	}

	if (low === Number.POSITIVE_INFINITY || high === Number.NEGATIVE_INFINITY) {
		return fallback;
	}

	return {
		max: roundTo > 0 ? snapOutward(high, roundTo, 'up') : high,
		min: roundTo > 0 ? snapOutward(low, roundTo, 'down') : low,
	};
}

/**
 * Clamp a candidate value into `[bounds.min, bounds.max]`. Used by the editable text inputs
 * above the slider to enforce "if the user types $100,000 when the corpus max is $25,000,
 * revert to $25,000" semantics.
 *
 * @param candidate - The user-entered value.
 * @param bounds - The legal range (typically `baseline`).
 * @returns `candidate` if it falls in `[bounds.min, bounds.max]`, otherwise the closer
 *   boundary.
 */
export function clampToBounds(candidate: number, bounds: NumericBounds): number {
	if (!Number.isFinite(candidate)) {
		return bounds.min;
	}
	if (candidate < bounds.min) {
		return bounds.min;
	}
	if (candidate > bounds.max) {
		return bounds.max;
	}

	return candidate;
}
