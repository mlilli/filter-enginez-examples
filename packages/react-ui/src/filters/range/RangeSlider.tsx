/**
 * `<RangeSlider />` — canonical-styled dual-handle slider for `RangeRule`-bound numeric
 * filters, with **three-layer semantics**.
 *
 * @remarks
 * Wraps `@radix-ui/react-slider` (via the `radix-ui` umbrella package) with the brand's
 * canonical range-slider design. Geometry + colors + layout match
 * `docs/branding/design-system/preview/range-slider.html` byte-faithfully — the three-layer
 * semantics layer cleanly on top via additional absolutely-positioned dimmed track segments.
 *
 * ### Three layers, one slider
 *
 *   1. **Baseline** — the full corpus min/max (e.g., $0..$25,000 for price). The track ALWAYS
 *      spans this. It's the canvas the user reasons about; it does not move as filters change.
 *   2. **Available zone** — the filtered-except-self min/max (e.g., $10..$50 after the user
 *      selected Pinot Grigio). Handles are CONSTRAINED to drag within this zone. Track
 *      segments OUTSIDE the available zone are visually dimmed (a darker overlay rectangle)
 *      to communicate "no wines exist here given your other filters."
 *   3. **Selected range** — the user's current handle positions. Cyan-filled segment between
 *      the two handles, always within the available zone.
 *
 * ### Editable text inputs below the track
 *
 * The min/max readouts below the slider are EDITABLE controlled text inputs, committed the way every
 * app's slider commits a typed bound:
 *
 *   - Typing changes only the field. Enter or blur commits; nothing commits per keystroke.
 *   - The text goes through `parse`, then the shared `resolveTypedBound`: snapped to `step` and
 *     clamped into the available zone, exactly where a drag to the same spot would land.
 *   - Text that is not a number, or a value equal to the committed bound, puts the committed value
 *     back in the field and writes nothing.
 *   - A lower bound typed above the upper one (or the reverse) swaps, so min ≤ max always holds.
 *   - Escape puts the committed value back and commits nothing, including on the blur it causes.
 *   - Focusing a field leaves its text unselected, as in every other app.
 *
 * ### Keyboard
 *
 * Arrow keys step one step (`stepScaledValue`) and Home / End jump to the available bounds. PageUp /
 * PageDown are swallowed and Shift+Arrow steps like a plain arrow: Radix would otherwise move ten
 * steps for either, which no other app's slider does.
 *
 * **Anatomy** (top to bottom):
 *
 *   1. **Field wrapper** — gray-1 panel with gray-4 border, 14px×16px padding, radius-lg.
 *   2. **Header row** — label on the left, live "$450k — $1.2M" summary on the right in cyan.
 *   3. **Histogram overlay** (optional) — 32px-tall bar row showing the data distribution.
 *   4. **Track + dimmed-outside-available overlay + selected fill** — three-layer geometry.
 *   5. **Concentric-ring thumbs** — 16px circles with cyan border + haze halo + drop-shadow.
 *   6. **Editable min/max text inputs** — gray-2 background, gray-5 border, mono tabular-nums.
 *
 * **Scales.** An optional `scale` (`scale.ts`) lays values out on the track; `useScaledSliderControl`
 * runs Radix over it. Thumbs carry `aria-valuetext`, so a log track still announces values.
 */

import { Slider } from 'radix-ui';
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';

import type { NumericBounds } from './bounds.js';
import type { HistogramBucket } from './histogram.js';

import { RangeHistogram } from './RangeHistogram.js';
import { type SliderScale, stepScaledValue } from './scale.js';
import { useEditableBounds } from './useEditableBounds.js';
import { arrowKeyDirection, useScaledSliderControl } from './useScaledSliderControl.js';

/** The two keys Radix maps to a ten-step jump, which this slider swallows. */
const PAGE_KEYS: ReadonlySet<string> = new Set(['PageDown', 'PageUp']);

/**
 * Default readout formatter: the number's plain string form.
 *
 * @remarks
 * Module-level so the default keeps ONE identity across renders. The editable inputs re-sync their
 * text whenever `format` changes identity (a new formatter can render the same number differently),
 * so a default re-created inline on every render would reset whatever the user was typing.
 *
 * @internal
 */
const formatAsPlainNumber = (value: number): string => value.toString();

/**
 * Default text-input parser: `parseFloat`, unchanged. Module-level for the same stable-identity
 * reason as {@link formatAsPlainNumber}.
 *
 * @internal
 */
const parseAsFloat = (raw: string): number => parseFloat(raw);

/**
 * Props for `<RangeSlider />`.
 */
export interface RangeSliderProps {
	/** Section label shown in the header row (e.g., "Price"). */
	readonly label: string;
	/**
	 * Baseline bounds — the full corpus min/max. The slider track always spans this; the
	 * editable text inputs clamp to this. Derived ONCE at boot from the full source corpus
	 * via `deriveBaselineBounds(...)`.
	 */
	readonly baseline: NumericBounds;
	/**
	 * Available bounds — the filtered-except-this-rule min/max. Handles can only drag within
	 * this zone; track segments outside this zone get the dimmed visual treatment. Derived on
	 * every relevant rule change via `deriveBounds(...)` over the filtered-except-self values.
	 * When omitted, the slider degrades to baseline-only semantics (no dimmed zones).
	 */
	readonly available?: NumericBounds;
	/** Step granularity. Defaults to 1. Use 0.1 for ABV-style fractional values. */
	readonly step?: number;
	/** Current lower handle value. */
	readonly valueMin: number;
	/** Current upper handle value. `Infinity` is treated as `baseline.max` for display purposes. */
	readonly valueMax: number;
	/** Called when EITHER handle moves OR a text input commits. Receives both new values. */
	readonly onChange: (next: { readonly max: number; readonly min: number; }) => void;
	/** Formatter for the readout numbers + header summary (e.g., `(n) => '$' + n.toFixed(0)`). */
	readonly format?: (value: number) => string;
	/**
	 * Optional parser for the editable text inputs. Strips formatting (e.g., a leading `$` or
	 * trailing `%`) before `parseFloat`. Defaults to `parseFloat` directly. If parsing fails
	 * (`NaN`), the input reverts to its previous committed value.
	 */
	readonly parse?: (raw: string) => number;
	/** Optional `aria-label` for assistive tech. */
	readonly ariaLabel?: string;
	/**
	 * Optional pre-computed histogram (from `computeHistogram(...)`) to render above the track
	 * as a distribution overlay. Omit to skip the overlay. Under a non-linear `scale`, pass slices of
	 * the TRACK (`rebinHistogram`): the bars are drawn at equal widths.
	 */
	readonly histogram?: readonly HistogramBucket[];
	/** How values sit on the track; linear over `baseline` by default. Build it over that baseline. */
	readonly scale?: SliderScale;
}


/**
 * Canonical dual-handle range slider with three-layer semantics + editable text inputs.
 *
 * @example
 *   <RangeSlider
 *     label="Price"
 *     baseline={{ min: 0, max: 25000 }}
 *     available={{ min: 10, max: 50 }}
 *     step={5}
 *     valueMin={priceMin} valueMax={priceMax}
 *     onChange={({ min, max }) => updatePriceRule(min, max)}
 *     format={(n) => '$' + n.toFixed(0)}
 *     parse={(raw) => parseFloat(raw.replace(/[$,]/g, ''))}
 *     histogram={priceHistogram}
 *     ariaLabel="Price range in USD"
 *   />
 */
export const RangeSlider = (props: RangeSliderProps): React.ReactElement => {
	const {
		ariaLabel,
		available,
		baseline,
		format = formatAsPlainNumber,
		histogram,
		label,
		onChange,
		parse = parseAsFloat,
		scale,
		step = 1,
		valueMax,
		valueMin,
	} = props;

	// The track's scale and Radix's coordinates for it (value space on a linear track).
	const { domain, fromControl, isPositionBased, toControl, trackScale } = useScaledSliderControl(scale, baseline, step);
	const upperThumbRef = useRef<HTMLSpanElement | null>(null);

	// `available` defaults to the full baseline when the consumer hasn't computed a filtered-
	// except-self subset yet (e.g., during the first render before the effect runs). This
	// makes the slider degrade to two-layer-only behavior gracefully.
	const effectiveAvailable: NumericBounds = available ?? baseline;

	// Coerce Infinity (which RangeRule uses for "no upper bound") to AVAILABLE.max for the
	// slider — the slider geometry needs finite numbers, and the displayed value should reflect
	// what's actually reachable given other filters. The rule-update branch in the parent is
	// responsible for translating finite upper back to Infinity when the user drags to the
	// AVAILABLE max (so the rule stays permissive even when the user hasn't constrained price).
	const safeUpper = Number.isFinite(valueMax)
		? Math.min(valueMax, effectiveAvailable.max)
		: effectiveAvailable.max;
	const safeLower = Math.max(effectiveAvailable.min, Math.min(valueMin, safeUpper));

	// ─── Local drag state ──────────────────────────────────────────────────
	// **Why local drag state.** Radix fires `onValueChange` on every pixel of motion; firing the
	// engine per tick made the thumbs lag/snap under the ~100ms worker round-trip. Instead we
	// track the drag locally in `dragValue` (no engine event) and commit ONCE on release (see
	// `commitValues` below). `dragValue` is `null` when idle; the renderer then falls back to
	// `[safeLower, safeUpper]`.
	const [dragValue, setDragValue] = useState<null | readonly [number, number]>(null);
	// **Ref mirror of `dragValue`.** The pointer-end commit reads the latest dragged position from
	// this ref (always current) rather than a state closure, sidestepping any render-timing gap
	// between the final `onValueChange` and the pointer-up that follows it.
	const dragValueRef = useRef<null | readonly [number, number]>(null);
	const displayLower = dragValue !== null ? dragValue[0] : safeLower;
	const displayUpper = dragValue !== null ? dragValue[1] : safeUpper;

	// **De-dupe latch.** A single release can surface through multiple channels (`onPointerUp`,
	// `onLostPointerCapture`, and Radix's own `onValueCommit`), but `onChange` must fire once.
	// `lastSentRef` records the last value pushed; repeats are ignored. Cleared when the rule
	// lands (the `[safeLower, safeUpper]` effect), so a later drag to the same value still commits.
	const lastSentRef = useRef<null | readonly [number, number]>(null);

	// Reset the drag + de-dupe state whenever the EXTERNAL committed value changes (another
	// filter event updated the rule, or this rule's own commit landed). Without this, after a
	// remote update the stale drag state would override the real rule values until the user
	// touched the slider again. `dragValue` is state, so it resets during render, against the bounds
	// it was last reset for; `Object.is` is the comparison an effect's dependency array would make.
	const [dragResetFor, setDragResetFor] = useState<readonly [number, number]>([safeLower, safeUpper]);

	if (!Object.is(dragResetFor[0], safeLower) || !Object.is(dragResetFor[1], safeUpper)) {
		setDragResetFor([safeLower, safeUpper]);
		setDragValue(null);
	}
	// The refs belong to effects and handlers rather than to render, so they reset here, once the new
	// committed value has itself been committed.
	useEffect(() => {
		dragValueRef.current = null;
		lastSentRef.current = null;
	}, [safeLower, safeUpper]);

	// **The single commit path** for every channel (slider drag-end, keyboard step, text input).
	// Clamps to the available zone, no-ops when unchanged, and de-dupes via `lastSentRef`.
	//
	// **Why not Radix's pointer `onValueCommit`:** because we run Radix controlled AND override
	// the value in `onValueChange` (to clamp handles into the available zone), Radix's slide-end
	// `hasChanged` check desyncs and can skip `onValueCommit` on pointer release. Committing from
	// independent pointer-end DOM signals makes it deterministic; keyboard still uses Radix's
	// (working) commit path.
	const commitValues = useCallback(
		(rawMin: number, rawMax: number): void => {
			const constrainedMin = Math.max(effectiveAvailable.min, Math.min(rawMin, effectiveAvailable.max));
			const constrainedMax = Math.max(effectiveAvailable.min, Math.min(rawMax, effectiveAvailable.max));

			// No real change versus the committed display — drop the transient drag state so the
			// thumb settles back onto the prop-driven value. No engine event is coming.
			if (constrainedMin === safeLower && constrainedMax === safeUpper) {
				setDragValue(null);
				dragValueRef.current = null;

				return;
			}
			const last = lastSentRef.current;

			if (last !== null && last[0] === constrainedMin && last[1] === constrainedMax) {
				return;
			}
			// **Don't clear `dragValue` here.** The engine round-trip is async; until it lands,
			// `safeLower`/`safeUpper` hold the STALE value, so clearing now would bounce the thumbs
			// back for one render. The reset keyed on `[safeLower, safeUpper]` clears it once the rule lands.
			lastSentRef.current = [constrainedMin, constrainedMax];
			onChange({ max: constrainedMax, min: constrainedMin });
		},
		[effectiveAvailable, onChange, safeLower, safeUpper],
	);

	// ─── Editable bound fields ─────────────────────────────────────────────
	// Controlled-but-deferred: each field holds a draft while focused and commits on Enter or blur
	// through `commitValues`, so a parent re-rendering on every engine event mid-drag never loses a
	// keystroke. The rules a typed bound follows are in `useEditableBounds`.
	const fields = useEditableBounds({
		available: effectiveAvailable,
		commit: commitValues,
		format,
		lower: safeLower,
		parse,
		step,
		upper: safeUpper,
	});

	const handleValueChange = useCallback(
		(next: number[]): void => {
			const [controlMin, controlMax] = next;

			/* v8 ignore next 3 -- defensive: Radix always passes a two-element value array, so neither is undefined */
			if (controlMin === undefined || controlMax === undefined) {
				return;
			}
			const rawMin = fromControl(controlMin);
			const rawMax = fromControl(controlMax);
			// Constrain to the AVAILABLE zone — handles can't enter dimmed territory.
			const constrainedMin = Math.max(effectiveAvailable.min, Math.min(rawMin, effectiveAvailable.max));
			const constrainedMax = Math.max(effectiveAvailable.min, Math.min(rawMax, effectiveAvailable.max));
			const nextDrag: readonly [number, number] = [constrainedMin, constrainedMax];

			// Mirror into the ref FIRST so a pointer-up firing in the same tick reads the latest.
			dragValueRef.current = nextDrag;
			setDragValue(nextDrag);
		},
		[effectiveAvailable, fromControl],
	);

	// Keyboard commit path — Radix reliably fires `onValueCommit` for keyboard stepping (a
	// different, working internal path than the pointer drag). Route it through `commitValues`.
	const handleValueCommit = useCallback(
		(next: number[]): void => {
			const [controlMin, controlMax] = next;

			/* v8 ignore next 3 -- defensive: Radix always passes a two-element value array, so neither is undefined */
			if (controlMin === undefined || controlMax === undefined) {
				return;
			}
			commitValues(fromControl(controlMin), fromControl(controlMax));
		},
		[commitValues, fromControl],
	);

	// Arrow keys on a position-based track step ~1% of it, not one Radix position (`stepScaledValue`).
	// PageUp / PageDown and Shift+Arrow are Radix's ten-step jumps; `preventDefault` here runs before
	// Radix's own handler, which skips a prevented event. The page keys then do nothing, and a
	// Shift+Arrow takes the same single step as a plain arrow, as in every other app.
	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLSpanElement>): void => {
			if (PAGE_KEYS.has(event.key)) {
				event.preventDefault();

				return;
			}
			const direction = arrowKeyDirection(event.key);

			if (direction === undefined || (!isPositionBased && !event.shiftKey)) {
				return;
			}
			event.preventDefault();
			// The upper thumb when focused; otherwise the lower, as Radix's own handler would step.
			if (event.target !== upperThumbRef.current) {
				const nextLower = stepScaledValue(trackScale, displayLower, direction, step);

				commitValues(Math.min(nextLower, displayUpper), displayUpper);
			} else {
				const nextUpper = stepScaledValue(trackScale, displayUpper, direction, step);

				commitValues(displayLower, Math.max(nextUpper, displayLower));
			}
		},
		[commitValues, displayLower, displayUpper, isPositionBased, step, trackScale],
	);

	// Pointer drag-end commit path — fires on the reliable `lostpointercapture` / `pointerup`
	// DOM signals (Radix captures the pointer on the thumb during a slide; `lostpointercapture`
	// bubbles to the root, and our composed `onPointerUp` runs before Radix's slide-end). Reads
	// the latest dragged value from the ref. This is the channel that actually makes pointer
	// drags commit, since Radix's own pointer `onValueCommit` is unreliable here (see above).
	const handleDragEndCommit = useCallback((): void => {
		const dv = dragValueRef.current;

		if (dv === null) {
			return;
		}
		commitValues(dv[0], dv[1]);
	}, [commitValues]);

	// ─── Dimmed-outside-available track overlay geometry ───────────────────
	// Convert baseline-coordinate values to 0..100% track positions. Used to absolutely-
	// position the two dimmed-overlay rectangles (left dim from baseline.min to available.min,
	// right dim from available.max to baseline.max).
	const pctFromValue = (v: number): number => trackScale.toFraction(v) * 100;
	const availableMinPct = Math.max(0, Math.min(100, pctFromValue(effectiveAvailable.min)));
	const availableMaxPct = Math.max(0, Math.min(100, pctFromValue(effectiveAvailable.max)));

	// **Three-tier track gradient.** Building the dim + tinted + idle-track tiers as a single CSS
	// `linear-gradient` (instead of overlay <div>s) means:
	//
	//   1. The tiers are always painted on first render with the latest `available` props —
	//      no separate DOM elements that lag behind, no need for layout flush to reposition.
	//      The gradient is computed inline every render, so the moment `available` narrows (via a
	//      bundle response), the gradient stops shift and the dim/tinted areas paint — no "dim
	//      zones don't appear until I interact with the slider" lag.
	//   2. We get a distinct "unselected but available" tier (subdued cyan tint) — the area
	//      between the available-zone edge and the user's selected range. Without it that area
	//      would be indistinguishable from the baseline track, so "selectable territory" would
	//      look the same as "dimmed disabled territory."
	//
	// Tier stack on the gradient (left → right):
	//   - 0 → availableMinPct: dimmed (var(--fe-slider-track-dim)) — "no data here; cannot select"
	//   - availableMinPct → availableMaxPct: subdued cyan tint (var(--fe-slider-track-available)) —
	//     "selectable territory; not in your current selection"
	//   - availableMaxPct → 100: dimmed — same as the left dim band
	//
	// The bright cyan `Slider.Range` overlays on top from selectedMin → selectedMax (always
	// within the available zone since handles are constrained there). So the selected area
	// reads as bright cyan; flanking unselected-but-available reads as subdued cyan; outside
	// the available zone reads as dim. Three tiers, three colors, unambiguous.
	//
	// The two tier COLORS are tokens rather than literals: every vertical was carrying its own copy
	// of the same rgba() pair, and the values are contrast-constrained. Note the unavailable band is
	// LIGHTER than the track, which reads backwards until you measure it — darkening it made the
	// band identical to the panel behind (ΔE 0.4), so the track appeared to simply END rather than
	// continue in a disabled state. `ui-styles` owns the numbers and the reasoning; don't inline
	// them back, and don't "fix" the light band without reading that block first.
	const trackBackground = `linear-gradient(to right, `
		+ `var(--fe-slider-track-dim) 0% ${availableMinPct}%, `
		+ `var(--fe-slider-track-available) ${availableMinPct}% ${availableMaxPct}%, `
		+ `var(--fe-slider-track-dim) ${availableMaxPct}% 100%`
		+ `)`;

	return (
		<div className="fe-range-slider">
			{/* Header: label + live summary */}
			<div className="fe-range-slider__header">
				<span className="fe-range-slider__label">{label}</span>
				<span className="fe-range-slider__summary">
					{format(safeLower)} — {format(safeUpper)}
				</span>
			</div>

			{/* Histogram overlay: distribution bars above the track (presentational). */}
			{histogram !== undefined && (
				<RangeHistogram
					histogram={histogram}
					available={effectiveAvailable}
					displayLower={displayLower}
					displayUpper={displayUpper}
				/>
			)}

			{/* The actual Radix Slider: track, range fill, thumbs */}
			<Slider.Root
				className="fe-range-slider__root"
				value={[toControl(displayLower), toControl(displayUpper)]}
				min={domain.min}
				max={domain.max}
				step={domain.step}
				onValueChange={handleValueChange}
				onValueCommit={handleValueCommit}
				onKeyDown={handleKeyDown}
				// Pointer-drag commit: `onPointerUp` is composed by Radix (ours runs before its
				// slide-end); `onLostPointerCapture` bubbles from the captured thumb. Either fires
				// `commitValues` from the drag ref; `lastSentRef` de-dupes the overlap.
				onPointerUp={handleDragEndCommit}
				onLostPointerCapture={handleDragEndCommit}
				aria-label={ariaLabel ?? label}
				// Zero: the thumbs may meet, so a range of exactly one value (min = max) is reachable by
				// drag and keyboard, as in every other app.
				minStepsBetweenThumbs={0}
			>
				{/* Track: the three-tier gradient is dynamic (computed from the available-zone
				    percentages each render), so it stays inline; static track geometry is in the
				    class. The cyan `Slider.Range` overlays the selection. */}
				<Slider.Track className="fe-range-slider__track" style={{ background: trackBackground }}>
					<Slider.Range className="fe-range-slider__range" />
				</Slider.Track>
				{/* Lower handle */}
				<Slider.Thumb
					className="fe-range-slider__thumb"
					aria-label={ariaLabel ? `${ariaLabel} lower bound` : `${label} lower bound`}
					aria-valuetext={format(displayLower)}
				/>
				{/* Upper handle */}
				<Slider.Thumb
					ref={upperThumbRef}
					className="fe-range-slider__thumb"
					aria-label={ariaLabel ? `${ariaLabel} upper bound` : `${label} upper bound`}
					aria-valuetext={format(displayUpper)}
				/>
			</Slider.Root>

			{/* Editable numeric inputs: direct keyboard entry; clamp on out-of-range; swap on max < min. */}
			<div className="fe-range-slider__inputs">
				<input
					type="text"
					inputMode="decimal"
					className="fe-range-slider__input fe-range-slider__input--min"
					{...fields.lower}
					aria-label={`${label} lower bound (editable)`}
				/>
				<input
					type="text"
					inputMode="decimal"
					className="fe-range-slider__input fe-range-slider__input--max"
					{...fields.upper}
					aria-label={`${label} upper bound (editable)`}
				/>
			</div>
		</div>
	);
};
