/**
 * `controls/rangeSlider` — the dual-handle numeric range slider, hand-rolled over the shared
 * `fe-range-slider*` classes.
 *
 * @remarks
 * The framework-less port of `react-ui`'s Radix-backed slider (and its Vue / Svelte ports). Radix isn't
 * available without React, so pointer dragging, keyboard stepping, and the editable min/max fields are
 * implemented directly — which is exactly the kind of thing this vertical exists to show is tractable.
 *
 * ### Three layers, one slider
 *   1. **Baseline** — the full-corpus min/max; the track always spans this.
 *   2. **Available zone** — the filtered-except-self min/max; handles are constrained to drag within
 *      it, and track segments outside it are dimmed ("no books exist here given your other filters").
 *   3. **Selected range** — the user's current handle positions, a cyan-filled segment.
 *
 * ### The distribution overlay, and why it is the fiddliest of the six ports
 *
 * `histogram` is part of the render STATE rather than a construction option, because the buckets
 * arrive with every bundle. The five framework ports hand a list to a template and let the framework
 * diff it; here the bars are created once and then repainted in place, with a rebuild only when the
 * bucket COUNT changes — which in practice happens exactly once, on the first bundle after boot.
 *
 * The tier and height arithmetic is shared (`histogramBarClassName` / `histogramBarHeightPercent`
 * from `examples-shared/bounds`) and the colors belong to `ui-styles`, so what is genuinely local here
 * is only the DOM reconciliation.
 *
 * The bounds contract comes from `examples-shared/bounds`, not `/books-domain`: this control also
 * renders real estate and wine, and a dataset address on a neutral control misleads the next reader.
 *
 * ### Scales
 *
 * The optional `scale` in the render state (a `SliderScale` from `examples-shared/bounds`) decides
 * where a value sits on the track. Every value-to-position conversion goes through
 * `scale.toFraction`, every pointer position comes back through `scale.fromFraction` and is snapped to
 * `step`, and the arrow keys move a thumb by `stepScaledValue`. With no scale the slider builds
 * `linearSliderScale(baseline)`, under which all three reduce to the plain proportional arithmetic and
 * a one-`step` arrow press — so books and real estate, which pass none, get the slider they always had.
 *
 * A heavy-tailed field passes a log scale instead (wine price and vintage): the dense end of the data
 * gets most of the track, and an arrow press moves about one percent of the track rather than one
 * `step`, which would take thousands of presses to cross the tail. Each thumb's `aria-valuetext` is the
 * formatted value, so assistive technology announces `$25` or `NV` rather than a bare number.
 *
 * @packageDocumentation
 */

import {
	histogramBarClassName,
	histogramBarHeightPercent,
	type HistogramBucket,
	linearSliderScale,
	nearestThumb,
	type NumericBounds,
	resolveTypedBound,
	type SliderScale,
	snapClampToBounds,
	stepScaledValue,
} from '@filter-enginez/examples-shared/bounds';
import { el, setHidden } from '@filter-enginez/examples-shared/dom';

import type { Control } from './controls.js';

/** State the slider renders from. */
export interface RangeSliderState {
	/** Full-corpus extents — the track always spans these. */
	readonly baseline: NumericBounds;
	/** Filtered-except-self extents; handles clamp to this and outside segments dim. */
	readonly available?: NumericBounds;
	/**
	 * Optional distribution bars above the track.
	 *
	 * @remarks
	 * Part of the state, not the options: the buckets come from the engine's predictive-disable bundle
	 * and change on every commit. Omitting them hides the overlay entirely, which is what a panel should
	 * render before its first bundle resolves.
	 *
	 * The bars are drawn at equal widths, so each bucket must be an equal slice of the TRACK. Under a
	 * linear scale that is an equal slice of the value range; under any other the caller passes buckets
	 * already sliced for its scale (wine's `wineSliderHistogram`).
	 */
	readonly histogram?: readonly HistogramBucket[];
	/**
	 * How values sit on the track. Defaults to `linearSliderScale(baseline)`.
	 *
	 * @remarks
	 * Part of the state rather than the options because a scale is built over a baseline, and the
	 * baseline arrives here. Build it over the SAME baseline passed alongside it, or the thumbs and the
	 * bars land under different values.
	 */
	readonly scale?: SliderScale;
	/** Current lower handle value. */
	readonly valueMin: number;
	/** Current upper handle value. `Infinity` displays as the available max. */
	readonly valueMax: number;
}

/** Construction-time options for a slider. */
export interface RangeSliderOptions {
	/** Section label shown in the header row. */
	readonly label: string;
	/** Commit callback — fires on drag end, keyboard step, or a committed text edit. */
	readonly onChange: (next: NumericBounds) => void;
	/** Step granularity. Defaults to 1. */
	readonly step?: number;
	/** Value → display string. Defaults to `String`. */
	readonly format?: (value: number) => string;
	/** Raw input string → number. Defaults to `parseFloat`. */
	readonly parse?: (raw: string) => number;
	/** Accessible name for the handles (defaults to `label`). */
	readonly ariaLabel?: string;
}

/**
 * Build a dual-handle range slider.
 *
 * @param options - Label, commit callback, and formatting/step behavior.
 * @returns The mounted slider; `update(state)` re-applies bounds + handle positions.
 */
export function createRangeSlider(options: RangeSliderOptions): Control<RangeSliderState> {
	const {
		ariaLabel,
		format = (value: number): string => String(value),
		label,
		onChange,
		parse = (raw: string): number => Number.parseFloat(raw),
		step = 1,
	} = options;

	// ── Current state, held locally so pointer/keyboard math can read it synchronously ──
	let baseline: NumericBounds = { max: 1, min: 0 };
	let scale: SliderScale = linearSliderScale(baseline);
	let available: NumericBounds = baseline;
	let safeLower = 0;
	let safeUpper = 1;
	let histogram: readonly HistogramBucket[] = [];
	/** Transient drag position; `null` when idle (display falls back to the committed values). */
	let dragValue: null | readonly [number, number] = null;
	let activeHandle: 'lower' | 'upper' | null = null;

	const summary = el('span', { className: 'fe-range-slider__summary' });
	// aria-hidden: the bars restate a count the results header already announces, and eighty of them
	// would be eighty announcements.
	const histogramContainer = el('div', {
		attrs: { 'aria-hidden': 'true' },
		className: 'fe-range-histogram',
	});
	const range = el('div', { className: 'fe-range-slider__range' });
	const track = el('div', { children: [range], className: 'fe-range-slider__track' });
	const lowerThumb = createThumb(`${ariaLabel ?? label} lower bound`);
	const upperThumb = createThumb(`${ariaLabel ?? label} upper bound`);
	const lowerInput = createBoundInput(`${label} lower bound (editable)`, 'fe-range-slider__input--min');
	const upperInput = createBoundInput(`${label} upper bound (editable)`, 'fe-range-slider__input--max');

	/** Display values — the drag position while dragging, else the committed values. */
	function displayLower(): number {
		return dragValue?.[0] ?? safeLower;
	}
	function displayUpper(): number {
		return dragValue?.[1] ?? safeUpper;
	}

	/**
	 * Convert a baseline-coordinate value to a 0..100% track position.
	 *
	 * @remarks
	 * Through the scale, so the dim bands, the selected segment, the thumbs and the bars all place a
	 * value at the same spot. The scale also clamps to the track and maps a degenerate baseline to `0`.
	 */
	function pct(value: number): number {
		return scale.toFraction(value) * 100;
	}

	/**
	 * Repaint the distribution bars.
	 *
	 * @remarks
	 * Bars are reused across paints; the DOM is rebuilt only when the bucket count changes, which after
	 * boot it does not. `setHidden` — an inline `display` — is correct here and `toggleAttribute('hidden')`
	 * is not: `.fe-range-histogram` carries an authored `display: flex`, which beats the UA's
	 * `[hidden] { display: none }` and would leave an empty 38px band above the track. (The opposite
	 * convention applies to `.fe-filter-collapse`, which `ui-styles` authors as `:not([hidden])` on
	 * purpose.)
	 */
	function paintHistogram(): void {
		setHidden(histogramContainer, histogram.length === 0);
		if (histogram.length === 0) {
			return;
		}
		while (histogramContainer.childElementCount > histogram.length) {
			histogramContainer.lastElementChild?.remove();
		}
		while (histogramContainer.childElementCount < histogram.length) {
			histogramContainer.append(el('div'));
		}
		for (const [index, bucket] of histogram.entries()) {
			const bar = histogramContainer.children[index] as HTMLElement | undefined;

			/* v8 ignore next -- the two loops above guarantee the child exists; this is the compiler's
			   noUncheckedIndexedAccess fallback, not a reachable state. */
			if (bar === undefined) {
				continue;
			}
			bar.className = histogramBarClassName(bucket, available, displayLower(), displayUpper());
			bar.style.height = `${histogramBarHeightPercent(bucket)}%`;
		}
	}

	/** Repaint the track gradient, selection segment, thumbs, and text fields from current state. */
	function paint(): void {
		const availableMinPct = pct(available.min);
		const availableMaxPct = pct(available.max);

		// Three-tier gradient (dim → subdued-cyan available → dim) — identical tiers to the React slider.
		track.style.background =
			`linear-gradient(to right, `
			+ `var(--fe-slider-track-dim) 0% ${availableMinPct}%, `
			+ `var(--fe-slider-track-available) ${availableMinPct}% ${availableMaxPct}%, `
			+ `var(--fe-slider-track-dim) ${availableMaxPct}% 100%)`;

		const lowerPct = pct(displayLower());
		const upperPct = pct(displayUpper());

		range.style.left = `${lowerPct}%`;
		range.style.width = `${Math.max(0, upperPct - lowerPct)}%`;

		positionThumb(lowerThumb, lowerPct, displayLower());
		positionThumb(upperThumb, upperPct, displayUpper());
		// After the thumbs, since the bars tier off the same display values — a drag repaints both.
		paintHistogram();

		summary.textContent = `${format(safeLower)} — ${format(safeUpper)}`;
		// Don't clobber a field the user is editing.
		if (document.activeElement !== lowerInput) {
			lowerInput.value = format(safeLower);
		}
		if (document.activeElement !== upperInput) {
			upperInput.value = format(safeUpper);
		}
	}

	/**
	 * Place a thumb and update its ARIA value.
	 *
	 * @remarks
	 * `aria-valuenow` stays numeric, as the slider role requires; `aria-valuetext` carries the formatted
	 * value, which is what a screen reader announces — `$25` and `NV` rather than `25` and `2025`.
	 */
	function positionThumb(thumb: HTMLElement, percent: number, value: number): void {
		// `--fe-thumb-pct` (unitless) rather than `left`, so the shared `--positioned` class can inset
		// the thumb to keep it inside the track — see ui-styles. A raw `left: %` overflowed at the ends.
		thumb.style.setProperty('--fe-thumb-pct', String(percent));
		thumb.setAttribute('aria-valuemin', String(baseline.min));
		thumb.setAttribute('aria-valuemax', String(baseline.max));
		thumb.setAttribute('aria-valuenow', String(value));
		thumb.setAttribute('aria-valuetext', format(value));
	}

	/** Commit a candidate `[min, max]`, clamped + ordered. No-ops when unchanged. */
	function commit(rawMin: number, rawMax: number): void {
		const nextMin = snapClampToBounds(Math.min(rawMin, rawMax), step, available);
		const nextMax = snapClampToBounds(Math.max(rawMin, rawMax), step, available);

		const isUnchanged = nextMin === safeLower && nextMax === safeUpper;

		// Painted at once, before the caller hears of it: on a worker-backed engine the next `update`
		// is a round trip away, and until then a second Arrow press must step from THIS value, not
		// from the one the engine last confirmed. The caller's `update` re-syncs either way.
		safeLower = nextMin;
		safeUpper = nextMax;
		dragValue = null;
		paint();
		if (!isUnchanged) {
			onChange({ max: nextMax, min: nextMin });
		}
	}

	/**
	 * Map a pointer clientX to a snapped, clamped value on the track.
	 *
	 * @remarks
	 * The pointer gives a track position; the scale turns it into a value. Snapping happens in VALUE
	 * space, after the conversion — on a log track a position-space grid would round $4 and $5 to the
	 * same place near the anchor and skip hundreds of dollars per pixel in the tail.
	 */
	function valueFromPointer(clientX: number): number {
		const rect = track.getBoundingClientRect();
		const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;

		return snapClampToBounds(scale.fromFraction(Math.max(0, Math.min(1, ratio))), step, available);
	}

	function handlePointerMove(event: PointerEvent): void {
		if (activeHandle === null) {
			return;
		}
		const value = valueFromPointer(event.clientX);

		dragValue =
			activeHandle === 'lower'
				? [Math.min(value, displayUpper()), displayUpper()]
				: [displayLower(), Math.max(value, displayLower())];
		paint();
	}

	function handlePointerUp(): void {
		if (activeHandle === null) {
			return;
		}
		activeHandle = null;
		window.removeEventListener('pointermove', handlePointerMove);
		window.removeEventListener('pointerup', handlePointerUp);
		if (dragValue !== null) {
			commit(dragValue[0], dragValue[1]);
		}
	}

	function startDrag(handle: 'lower' | 'upper', event: PointerEvent): void {
		event.preventDefault();
		activeHandle = handle;
		dragValue = [displayLower(), displayUpper()];
		window.addEventListener('pointermove', handlePointerMove);
		window.addEventListener('pointerup', handlePointerUp);
	}

	/**
	 * Keyboard stepping — arrows nudge by one scaled step, Home/End jump to the available bounds.
	 *
	 * @remarks
	 * `stepScaledValue` is one `step` on a linear track and about one percent of the track (never less
	 * than one `step`) on a log track, so a keyboard user crosses either in a bounded number of presses.
	 *
	 * Those four keys are the whole keyboard contract, the same in every app: PageUp and PageDown are
	 * not handled (they keep their default, scrolling the page), and a held Shift does not accelerate
	 * an arrow, which still moves one scaled step.
	 */
	function handleKeydown(handle: 'lower' | 'upper', event: KeyboardEvent): void {
		const direction = keyboardDirection(event.key);

		if (direction === 0 && event.key !== 'Home' && event.key !== 'End') {
			return;
		}
		event.preventDefault();
		const current = handle === 'lower' ? displayLower() : displayUpper();
		let next = direction === 0 ? current : stepScaledValue(scale, current, direction, step);

		if (event.key === 'Home') {
			next = available.min;
		} else if (event.key === 'End') {
			next = available.max;
		}
		if (handle === 'lower') {
			commit(Math.min(next, displayUpper()), displayUpper());
		} else {
			commit(displayLower(), Math.max(next, displayLower()));
		}
	}

	/**
	 * Commit an edited text field through the shared `resolveTypedBound`.
	 *
	 * @remarks
	 * Text that is not a number, or a value that snaps to the bound already committed, writes nothing
	 * and puts the committed value back in the field, formatted: leaving `abc` or `40.2` in a field that
	 * filters on `40` would show a bound that is not the one filtering. Anything else commits, the pair
	 * re-ordered so min ≤ max, and the field shows the bound it committed.
	 *
	 * @param which - The field that was edited.
	 * @param input - That field.
	 */
	function commitText(which: 'lower' | 'upper', input: HTMLInputElement): void {
		const committedBound = which === 'lower' ? safeLower : safeUpper;
		const resolved = resolveTypedBound(parse(input.value), step, available);

		if (resolved === null || resolved === committedBound) {
			input.value = format(committedBound);

			return;
		}
		const other = which === 'lower' ? safeUpper : safeLower;

		commit(which === 'lower' ? resolved : other, which === 'lower' ? other : resolved);
		// `paint` leaves a focused field alone, and after Enter this one still has focus.
		input.value = format(which === 'lower' ? safeLower : safeUpper);
	}

	/**
	 * Wire a bound input's blur/Enter commit and Escape revert.
	 *
	 * @remarks
	 * Enter commits and then blurs the field; Escape puts the committed value back and blurs it. The
	 * blur either one causes must commit nothing: after Enter the text is already committed, and after
	 * Escape it is exactly what the user discarded. `blur()` dispatches synchronously, so the flag that
	 * says so is up only for the length of that call, and a field that was never focused (so never
	 * blurs) cannot leave it raised for the next real blur.
	 *
	 * @param input - The field.
	 * @param which - Which bound it edits.
	 */
	function wireInput(input: HTMLInputElement, which: 'lower' | 'upper'): void {
		let isBlurFromKeydown = false;

		/** Leave the field without the blur committing it. */
		function leaveField(): void {
			isBlurFromKeydown = true;
			input.blur();
			isBlurFromKeydown = false;
		}

		input.addEventListener('blur', () => {
			if (!isBlurFromKeydown) {
				commitText(which, input);
			}
		});
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				commitText(which, input);
				leaveField();
			} else if (event.key === 'Escape') {
				input.value = format(which === 'lower' ? safeLower : safeUpper);
				leaveField();
			}
		});
	}

	// Jump the nearest thumb to a click on the TRACK, then keep dragging from there.
	//
	// React's slider is Radix-backed, and Radix moves the closest thumb on a track press for free; the
	// hand-rolled sliders have to do it themselves. Binding `pointerdown` only to the thumbs would leave
	// the whole track inert — ~96% of a 400px control doing nothing, which reads as "the slider is
	// broken" rather than a missing affordance. `startDrag` plus one synthetic move makes press-and-drag a single gesture; a `click`
	// handler would jump the thumb but leave the user unable to drag on without re-pressing.
	//
	// The thumbs are SIBLINGS of the track, not children, so a press on a thumb never reaches here.
	track.setAttribute('role', 'presentation');
	track.addEventListener('pointerdown', (event) => {
		// The shared `nearestThumb`: a press beyond either thumb moves that one, and between them the
		// thumb nearer ON SCREEN moves (track fractions, so a log track picks the one the user pointed
		// at even when the other is nearer in value). A tie moves the lower thumb.
		startDrag(
			nearestThumb(valueFromPointer(event.clientX), displayLower(), displayUpper(), (value) => scale.toFraction(value)),
			event,
		);
		handlePointerMove(event);
	});
	lowerThumb.addEventListener('pointerdown', (event) => {
		startDrag('lower', event);
	});
	upperThumb.addEventListener('pointerdown', (event) => {
		startDrag('upper', event);
	});
	lowerThumb.addEventListener('keydown', (event) => {
		handleKeydown('lower', event);
	});
	upperThumb.addEventListener('keydown', (event) => {
		handleKeydown('upper', event);
	});
	wireInput(lowerInput, 'lower');
	wireInput(upperInput, 'upper');

	const element = el('div', {
		children: [
			el('div', {
				children: [el('span', { className: 'fe-range-slider__label', text: label }), summary],
				className: 'fe-range-slider__header',
			}),
			histogramContainer,
			el('div', {
				children: [track, lowerThumb, upperThumb],
				className: 'fe-range-slider__root',
			}),
			el('div', {
				children: [lowerInput, upperInput],
				className: 'fe-range-slider__inputs',
			}),
		],
		className: 'fe-range-slider',
	});

	return {
		element,
		update: (state) => {
			baseline = state.baseline;
			scale = state.scale ?? linearSliderScale(state.baseline);
			available = state.available ?? state.baseline;
			histogram = state.histogram ?? [];
			safeUpper = Number.isFinite(state.valueMax) ? Math.min(state.valueMax, available.max) : available.max;
			safeLower = Math.max(available.min, Math.min(state.valueMin, safeUpper));
			// A committed update supersedes any in-flight drag position.
			dragValue = null;
			paint();
		},
	};
}

/**
 * A positioned slider thumb. `fe-range-slider__thumb--positioned` supplies the absolute placement the
 * shared ring class intentionally leaves to the slider implementation.
 *
 * @internal
 */
function createThumb(ariaLabel: string): HTMLElement {
	return el('span', {
		attrs: { 'aria-label': ariaLabel, role: 'slider', tabindex: 0 },
		className: 'fe-range-slider__thumb fe-range-slider__thumb--positioned',
	});
}

/**
 * One editable bound field.
 *
 * @internal
 */
function createBoundInput(ariaLabel: string, modifier: string): HTMLInputElement {
	return el('input', {
		attrs: { 'aria-label': ariaLabel, inputmode: 'decimal', type: 'text' },
		className: `fe-range-slider__input ${modifier}`,
	});
}

/**
 * Arrow-key → step direction (-1 / +1); 0 for keys that don't step.
 *
 * @internal
 */
function keyboardDirection(key: string): -1 | 0 | 1 {
	if (key === 'ArrowLeft' || key === 'ArrowDown') {
		return -1;
	}
	if (key === 'ArrowRight' || key === 'ArrowUp') {
		return 1;
	}

	return 0;
}
