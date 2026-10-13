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
 * @packageDocumentation
 */

import {
	histogramBarClassName,
	histogramBarHeightPercent,
	type HistogramBucket,
	type NumericBounds,
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
	 * via `fieldHistogram` and change on every commit. Omitting them hides the overlay entirely, which
	 * is what a panel should render before its first bundle resolves.
	 */
	readonly histogram?: readonly HistogramBucket[];
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

	/** Convert a baseline-coordinate value to a 0..100% track position. */
	function pct(value: number): number {
		const span = baseline.max - baseline.min;

		if (span <= 0) {
			return 0;
		}

		return Math.max(0, Math.min(100, ((value - baseline.min) / span) * 100));
	}

	/** Snap a raw value to the step grid, then clamp into the available zone. */
	function snapClamp(value: number): number {
		const snapped = step > 0 ? Math.round(value / step) * step : value;

		return Math.max(available.min, Math.min(snapped, available.max));
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

	/** Place a thumb and update its ARIA value. */
	function positionThumb(thumb: HTMLElement, percent: number, value: number): void {
		// `--fe-thumb-pct` (unitless) rather than `left`, so the shared `--positioned` class can inset
		// the thumb to keep it inside the track — see ui-styles. A raw `left: %` overflowed at the ends.
		thumb.style.setProperty('--fe-thumb-pct', String(percent));
		thumb.setAttribute('aria-valuemin', String(baseline.min));
		thumb.setAttribute('aria-valuemax', String(baseline.max));
		thumb.setAttribute('aria-valuenow', String(value));
	}

	/** Commit a candidate `[min, max]`, clamped + ordered. No-ops when unchanged. */
	function commit(rawMin: number, rawMax: number): void {
		const nextMin = snapClamp(Math.min(rawMin, rawMax));
		const nextMax = snapClamp(Math.max(rawMin, rawMax));

		if (nextMin === safeLower && nextMax === safeUpper) {
			dragValue = null;
			paint();

			return;
		}
		onChange({ max: nextMax, min: nextMin });
	}

	/** Map a pointer clientX to a snapped, clamped value on the track. */
	function valueFromPointer(clientX: number): number {
		const rect = track.getBoundingClientRect();
		const ratio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0;

		return snapClamp(baseline.min + Math.max(0, Math.min(1, ratio)) * (baseline.max - baseline.min));
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
	 * Which thumb a click at `value` should move.
	 *
	 * @remarks
	 * Nearest wins, with the two outside cases resolved first so a click beyond either end always
	 * extends rather than inverts the selection. Without that, a click left of both thumbs when they sit
	 * together would be equidistant, and the tie could pick `upper` — dragging the top of the range down
	 * past the bottom, which `commit` then silently re-orders into something the user did not ask for.
	 *
	 * @param value - The value under the pointer.
	 * @returns The handle to move.
	 */
	function pickHandle(value: number): 'lower' | 'upper' {
		if (value <= displayLower()) {
			return 'lower';
		}
		if (value >= displayUpper()) {
			return 'upper';
		}

		return value - displayLower() <= displayUpper() - value ? 'lower' : 'upper';
	}

	/** Keyboard stepping — arrows nudge by `step`, Home/End jump to the available bounds. */
	function handleKeydown(handle: 'lower' | 'upper', event: KeyboardEvent): void {
		const delta = keyboardDelta(event.key);

		if (delta === 0 && event.key !== 'Home' && event.key !== 'End') {
			return;
		}
		event.preventDefault();
		const current = handle === 'lower' ? displayLower() : displayUpper();
		let next = current + delta * step;

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

	/** Commit an edited text field, clamping + swapping to keep ordering coherent. */
	function commitText(which: 'lower' | 'upper', raw: string): void {
		const parsed = parse(raw);
		const fallback = which === 'lower' ? safeLower : safeUpper;
		const clamped = Number.isFinite(parsed) ? snapClamp(parsed) : fallback;
		const other = which === 'lower' ? safeUpper : safeLower;

		commit(which === 'lower' ? clamped : other, which === 'lower' ? other : clamped);
	}

	/** Wire a bound input's blur/Enter commit + Escape revert. */
	function wireInput(input: HTMLInputElement, which: 'lower' | 'upper'): void {
		input.addEventListener('blur', () => {
			commitText(which, input.value);
		});
		input.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				commitText(which, input.value);
				input.blur();
			} else if (event.key === 'Escape') {
				input.value = format(which === 'lower' ? safeLower : safeUpper);
				input.blur();
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
		startDrag(pickHandle(valueFromPointer(event.clientX)), event);
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
function keyboardDelta(key: string): number {
	if (key === 'ArrowLeft' || key === 'ArrowDown') {
		return -1;
	}
	if (key === 'ArrowRight' || key === 'ArrowUp') {
		return 1;
	}

	return 0;
}
