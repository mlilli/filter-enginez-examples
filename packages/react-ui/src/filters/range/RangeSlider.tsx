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
 * ### Editable text inputs above the slider
 *
 * The min/max readouts below the slider are EDITABLE controlled text inputs. User flow:
 *
 *   - Type a value, press Enter (or blur the input) → commit.
 *   - On commit: parse as number, clamp to `baseline` bounds, then push to `onChange`.
 *   - Out-of-baseline values (e.g., $100,000 when baseline max is $25,000) revert to the
 *     baseline edge — the input visually resets to the clamped value on blur.
 *   - Max < min after edit → swap so the ordering stays coherent.
 *
 * **Why clamp to baseline, not available.** Available shrinks as the user narrows other
 * filters; clamping to it would prevent the user from typing a value that lies in the
 * dimmed zone (perfectly legal — the engine just returns nothing for it, which is its own
 * useful affordance, not a bug). Baseline is the "what does the data even contain" floor
 * + ceiling.
 *
 * **Anatomy** (top to bottom):
 *
 *   1. **Field wrapper** — gray-1 panel with gray-4 border, 14px×16px padding, radius-lg.
 *   2. **Header row** — label on the left, live "$450k — $1.2M" summary on the right in cyan.
 *   3. **Histogram overlay** (optional) — 32px-tall bar row showing the data distribution.
 *   4. **Track + dimmed-outside-available overlay + selected fill** — three-layer geometry.
 *   5. **Concentric-ring thumbs** — 16px circles with cyan border + haze halo + drop-shadow.
 *   6. **Editable min/max text inputs** — gray-2 background, gray-5 border, mono tabular-nums.
 */

import { Slider } from 'radix-ui';
import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react';

import type { HistogramBucket } from './histogram.js';

import { clampToBounds, type NumericBounds } from './bounds.js';
import { RangeHistogram } from './RangeHistogram.js';

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
 * Local text for one editable bound: seeded from the committed value, re-synced whenever that value
 * or the formatter changes from outside, and free to hold a draft in between.
 *
 * @remarks
 * The re-sync happens during render, against the value and formatter it last synced from, rather than
 * in an effect — so the input never paints the stale text first. `Object.is` is the comparison an
 * effect's dependency array would make, so a `NaN` bound reads as unchanged rather than re-syncing on
 * every render.
 *
 * @param committed - The bound's committed (prop-derived) value.
 * @param format - The readout formatter; a new identity re-renders the text through it.
 * @returns The input's text, and its setter for keystrokes and commits.
 * @internal
 */
function useCommittedText(
	committed: number,
	format: (value: number) => string,
): [string, Dispatch<SetStateAction<string>>] {
	const [text, setText] = useState(() => format(committed));
	const [syncedFrom, setSyncedFrom] = useState({ committed, format });

	if (!Object.is(syncedFrom.committed, committed) || syncedFrom.format !== format) {
		setSyncedFrom({ committed, format });
		setText(format(committed));
	}

	return [text, setText];
}

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
	 * as a distribution overlay. Omit to skip the overlay (cleaner for tiny ranges).
	 */
	readonly histogram?: readonly HistogramBucket[];
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
		step = 1,
		valueMax,
		valueMin,
	} = props;

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

	// ─── Editable text-input local state ───────────────────────────────────
	// Inputs are controlled-while-focused (the local string state) and reconciled-on-blur
	// against the committed numeric values. This "controlled-but-deferred" pattern avoids losing
	// user keystrokes when the parent re-renders on every engine event during a slider drag. Each
	// input re-syncs when ITS committed value changes from outside (e.g., the user dragged the slider
	// handle, or the parent reset the rule), so a remote change to one bound never discards a draft
	// typed into the other.
	const [lowerText, setLowerText] = useCommittedText(safeLower, format);
	const [upperText, setUpperText] = useCommittedText(safeUpper, format);

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

	const commitLower = useCallback((raw: string): void => {
		const parsed = parse(raw);
		// Clamp to AVAILABLE (not baseline) so users can't type a value outside the currently-
		// reachable range — entering $5,000 when no wines exist above $80 (given current filters)
		// shouldn't push the slider into a dead zone.
		const clamped = Number.isFinite(parsed) ? clampToBounds(parsed, effectiveAvailable) : safeLower;
		// If the user typed a min above the current max, swap so ordering stays coherent — matches
		// dragging the lower handle past the upper handle.
		const nextMin = Math.min(clamped, safeUpper);
		const nextMax = Math.max(clamped, safeUpper);

		// Reflect the clamped value back in the input immediately, then commit through the shared path.
		setLowerText(format(nextMin));
		commitValues(nextMin, nextMax);
	}, [commitValues, effectiveAvailable, format, parse, safeLower, safeUpper, setLowerText]);

	const commitUpper = useCallback((raw: string): void => {
		const parsed = parse(raw);
		const clamped = Number.isFinite(parsed) ? clampToBounds(parsed, effectiveAvailable) : safeUpper;
		const nextMin = Math.min(safeLower, clamped);
		const nextMax = Math.max(safeLower, clamped);

		setUpperText(format(nextMax));
		commitValues(nextMin, nextMax);
	}, [commitValues, effectiveAvailable, format, parse, safeLower, safeUpper, setUpperText]);

	const handleValueChange = useCallback(
		(next: number[]): void => {
			const [rawMin, rawMax] = next;

			/* v8 ignore next 3 -- defensive: Radix always passes a two-element value array, so neither is undefined */
			if (rawMin === undefined || rawMax === undefined) {
				return;
			}
			// Constrain to the AVAILABLE zone — handles can't enter dimmed territory.
			const constrainedMin = Math.max(effectiveAvailable.min, Math.min(rawMin, effectiveAvailable.max));
			const constrainedMax = Math.max(effectiveAvailable.min, Math.min(rawMax, effectiveAvailable.max));
			const nextDrag: readonly [number, number] = [constrainedMin, constrainedMax];

			// Mirror into the ref FIRST so a pointer-up firing in the same tick reads the latest.
			dragValueRef.current = nextDrag;
			setDragValue(nextDrag);
		},
		[effectiveAvailable],
	);

	// Keyboard commit path — Radix reliably fires `onValueCommit` for keyboard stepping (a
	// different, working internal path than the pointer drag). Route it through `commitValues`.
	const handleValueCommit = useCallback(
		(next: number[]): void => {
			const [rawMin, rawMax] = next;

			/* v8 ignore next 3 -- defensive: Radix always passes a two-element value array, so neither is undefined */
			if (rawMin === undefined || rawMax === undefined) {
				return;
			}
			commitValues(rawMin, rawMax);
		},
		[commitValues],
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
	const baselineSpan = baseline.max - baseline.min;
	const pctFromValue = (v: number): number => {
		/* v8 ignore next 3 -- defensive: a degenerate min === max baseline can't reach the Radix slider (Radix requires min < max) */
		if (baselineSpan <= 0) {
			return 0;
		}

		return ((v - baseline.min) / baselineSpan) * 100;
	};
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
					format={format}
				/>
			)}

			{/* The actual Radix Slider: track, range fill, thumbs */}
			<Slider.Root
				className="fe-range-slider__root"
				value={[displayLower, displayUpper]}
				min={baseline.min}
				max={baseline.max}
				step={step}
				onValueChange={handleValueChange}
				onValueCommit={handleValueCommit}
				// Pointer-drag commit: `onPointerUp` is composed by Radix (ours runs before its
				// slide-end); `onLostPointerCapture` bubbles from the captured thumb. Either fires
				// `commitValues` from the drag ref; `lastSentRef` de-dupes the overlap.
				onPointerUp={handleDragEndCommit}
				onLostPointerCapture={handleDragEndCommit}
				aria-label={ariaLabel ?? label}
				minStepsBetweenThumbs={1}
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
				/>
				{/* Upper handle */}
				<Slider.Thumb
					className="fe-range-slider__thumb"
					aria-label={ariaLabel ? `${ariaLabel} upper bound` : `${label} upper bound`}
				/>
			</Slider.Root>

			{/* Editable numeric inputs: direct keyboard entry; clamp on out-of-range; swap on max < min. */}
			<div className="fe-range-slider__inputs">
				<input
					type="text"
					inputMode="decimal"
					className="fe-range-slider__input fe-range-slider__input--min"
					value={lowerText}
					onChange={(event) => setLowerText(event.target.value)}
					onBlur={(event) => commitLower(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							commitLower(event.currentTarget.value);
							event.currentTarget.blur();
						} else if (event.key === 'Escape') {
							// Revert to the committed value without firing onChange.
							setLowerText(format(safeLower));
							event.currentTarget.blur();
						}
					}}
					onFocus={(event) => event.currentTarget.select()}
					aria-label={`${label} lower bound (editable)`}
				/>
				<input
					type="text"
					inputMode="decimal"
					className="fe-range-slider__input fe-range-slider__input--max"
					value={upperText}
					onChange={(event) => setUpperText(event.target.value)}
					onBlur={(event) => commitUpper(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							commitUpper(event.currentTarget.value);
							event.currentTarget.blur();
						} else if (event.key === 'Escape') {
							setUpperText(format(safeUpper));
							event.currentTarget.blur();
						}
					}}
					onFocus={(event) => event.currentTarget.select()}
					aria-label={`${label} upper bound (editable)`}
				/>
			</div>
		</div>
	);
};
