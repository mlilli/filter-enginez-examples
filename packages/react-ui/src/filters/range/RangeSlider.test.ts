/**
 * Tests for `<RangeSlider />` — the dual-handle Radix slider with three-layer semantics + editable
 * text inputs.
 *
 * @remarks
 * jsdom render via `createElement`. Radix maps pointer position → value through
 * `getBoundingClientRect` (which jsdom zeroes), so we do NOT drive value changes by dragging the
 * track. Coverage comes from the two paths that don't need slider geometry: the editable text
 * inputs (parse / clamp / swap / revert / commit) and Radix's keyboard stepping on a focused thumb
 * (which fires `onValueChange` + `onValueCommit` without geometry).
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { HistogramBucket } from './histogram.js';

import { RangeSlider, type RangeSliderProps } from './RangeSlider.js';
import { logSliderScale, SLIDER_POSITION_RESOLUTION } from './scale.js';

beforeAll(() => {
	// Radix's `react-use-size` observes the thumb with a ResizeObserver, which jsdom does not
	// implement. A no-op stub lets the slider mount + handle keyboard without geometry.
	globalThis.ResizeObserver = class {
		disconnect = (): void => undefined;
		observe = (): void => undefined;
		unobserve = (): void => undefined;
	};
	// Radix's Slider root pointer handlers call these pointer-capture methods, which jsdom lacks.
	HTMLElement.prototype.hasPointerCapture = () => false;
	HTMLElement.prototype.setPointerCapture = () => undefined;
	HTMLElement.prototype.releasePointerCapture = () => undefined;
});

afterEach(cleanup);

/** A full, valid prop set with the supplied overrides. */
function props(overrides: Partial<RangeSliderProps> = {}): RangeSliderProps {
	return {
		baseline: { max: 100, min: 0 },
		label: 'Price',
		onChange: vi.fn(),
		valueMax: 80,
		valueMin: 20,
		...overrides,
	};
}

/** Render with base props + overrides. */
function renderSlider(overrides: Partial<RangeSliderProps> = {}): ReturnType<typeof render> {
	return render(createElement(RangeSlider, props(overrides)));
}

/**
 * A **stable** formatter reference. The inputs re-sync their text whenever `format` changes identity,
 * so a formatter re-created on every render resets typed text; real consumers pass a stable formatter
 * (the prop object is created once), so the typing tests do too.
 */
const FORMAT = (n: number): string => String(n);

/** Render with a stable formatter — for tests that type into the editable inputs. */
function renderTyping(overrides: Partial<RangeSliderProps> = {}): ReturnType<typeof render> {
	return renderSlider({ format: FORMAT, ...overrides });
}

const lowerInput = (): HTMLInputElement => screen.getByLabelText('Price lower bound (editable)');
const upperInput = (): HTMLInputElement => screen.getByLabelText('Price upper bound (editable)');

describe('RangeSlider — display + derivations', () => {
	it('renders the summary + inputs from safeLower/safeUpper with the default formatter', () => {
		const { container } = renderSlider();

		expect(container.querySelector('.fe-range-slider__summary')?.textContent).toContain('20');
		expect(container.querySelector('.fe-range-slider__summary')?.textContent).toContain('80');
		expect(lowerInput().value).toBe('20');
		expect(upperInput().value).toBe('80');
	});

	it('applies a custom formatter to the summary + inputs', () => {
		renderSlider({ format: (n) => `$${n}` });

		expect(lowerInput().value).toBe('$20');
		expect(upperInput().value).toBe('$80');
	});

	it('coerces an Infinity upper bound to the available max', () => {
		renderSlider({ available: { max: 60, min: 0 }, valueMax: Number.POSITIVE_INFINITY });

		expect(upperInput().value).toBe('60');
	});

	it('clamps a lower value that sits below the available min', () => {
		renderSlider({ available: { max: 100, min: 30 }, valueMin: 5 });

		expect(lowerInput().value).toBe('30');
	});

	it('renders the histogram overlay only when a histogram is supplied', () => {
		const { container: without } = renderSlider();

		expect(without.querySelector('.fe-range-histogram')).toBeNull();

		cleanup();
		const histogram: readonly HistogramBucket[] = [
			{ bucketMax: 50, bucketMin: 0, count: 3, heightFraction: 1, inSelection: true },
		];
		const { container: withHist } = renderSlider({ histogram });

		expect(withHist.querySelector('.fe-range-histogram')).not.toBeNull();
	});

	it('renders with an available zone wider than the baseline (percentage clamps)', () => {
		const { container } = renderSlider({ available: { max: 200, min: -10 }});

		// The dimmed-track gradient still paints without throwing; clamps keep it in [0, 100]%.
		expect(container.querySelector('.fe-range-slider__track')?.getAttribute('style')).toContain('linear-gradient');
	});

	it('uses the ariaLabel prop for the thumb labels when provided', () => {
		renderSlider({ ariaLabel: 'Price in USD' });

		expect(screen.getByLabelText('Price in USD lower bound')).not.toBeNull();
		expect(screen.getByLabelText('Price in USD upper bound')).not.toBeNull();
	});
});

describe('RangeSlider — editable inputs', () => {
	it('commits a valid lower value on blur', () => {
		const onChange = vi.fn();

		renderTyping({ onChange });
		fireEvent.change(lowerInput(), { target: { value: '30' }});
		fireEvent.blur(lowerInput());

		expect(onChange).toHaveBeenCalledWith({ max: 80, min: 30 });
	});

	it('commits a valid upper value on Enter', () => {
		const onChange = vi.fn();

		renderTyping({ onChange });
		fireEvent.change(upperInput(), { target: { value: '60' }});
		fireEvent.keyDown(upperInput(), { key: 'Enter' });

		expect(onChange).toHaveBeenCalledWith({ max: 60, min: 20 });
	});

	it('swaps when the typed lower exceeds the current upper', () => {
		const onChange = vi.fn();

		renderTyping({ onChange });
		fireEvent.change(lowerInput(), { target: { value: '90' }});
		fireEvent.blur(lowerInput());

		expect(onChange).toHaveBeenCalledWith({ max: 90, min: 80 });
	});

	it('reverts a non-numeric entry to the committed value and fires no change', () => {
		const onChange = vi.fn();

		renderTyping({ onChange });
		fireEvent.change(lowerInput(), { target: { value: 'abc' }});
		fireEvent.blur(lowerInput());

		expect(onChange).not.toHaveBeenCalled();
		expect(lowerInput().value).toBe('20');
	});

	it('reverts on Escape without committing', () => {
		const onChange = vi.fn();

		renderTyping({ onChange });
		fireEvent.change(lowerInput(), { target: { value: '55' }});
		fireEvent.keyDown(lowerInput(), { key: 'Escape' });

		expect(onChange).not.toHaveBeenCalled();
		expect(lowerInput().value).toBe('20');
	});

	it('clamps a typed value to the available zone (not baseline) with a custom parser', () => {
		const onChange = vi.fn();

		renderTyping({ available: { max: 50, min: 10 }, onChange, parse: (raw) => parseFloat(raw.replace('$', '')) });
		fireEvent.change(lowerInput(), { target: { value: '$5' }});
		fireEvent.blur(lowerInput());

		expect(onChange).toHaveBeenCalledWith({ max: 50, min: 10 });
	});

	it('de-dupes a repeated commit of the same value', () => {
		const onChange = vi.fn();

		renderTyping({ onChange });
		fireEvent.change(lowerInput(), { target: { value: '30' }});
		fireEvent.blur(lowerInput());
		fireEvent.change(lowerInput(), { target: { value: '30' }});
		fireEvent.blur(lowerInput());

		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it('commits the lower value on Enter', () => {
		const onChange = vi.fn();

		renderTyping({ onChange });
		fireEvent.change(lowerInput(), { target: { value: '35' }});
		fireEvent.keyDown(lowerInput(), { key: 'Enter' });

		expect(onChange).toHaveBeenCalledWith({ max: 80, min: 35 });
	});

	it('commits the upper value on blur', () => {
		const onChange = vi.fn();

		renderTyping({ onChange });
		fireEvent.change(upperInput(), { target: { value: '70' }});
		fireEvent.blur(upperInput());

		expect(onChange).toHaveBeenCalledWith({ max: 70, min: 20 });
	});

	it('reverts the upper input on Escape without committing', () => {
		const onChange = vi.fn();

		renderTyping({ onChange });
		fireEvent.change(upperInput(), { target: { value: '65' }});
		fireEvent.keyDown(upperInput(), { key: 'Escape' });

		expect(onChange).not.toHaveBeenCalled();
		expect(upperInput().value).toBe('80');
	});

	it('selects the field contents on focus', () => {
		const selectSpy = vi.spyOn(HTMLInputElement.prototype, 'select');

		renderTyping();
		fireEvent.focus(lowerInput());
		fireEvent.focus(upperInput());

		expect(selectSpy).toHaveBeenCalledTimes(2);
		selectSpy.mockRestore();
	});

	it('reverts a non-numeric upper entry without committing', () => {
		const onChange = vi.fn();

		renderTyping({ onChange });
		fireEvent.change(upperInput(), { target: { value: 'xyz' }});
		fireEvent.blur(upperInput());

		expect(onChange).not.toHaveBeenCalled();
		expect(upperInput().value).toBe('80');
	});

	it('ignores keys other than Enter/Escape in both inputs', () => {
		const onChange = vi.fn();

		renderTyping({ onChange });
		fireEvent.change(lowerInput(), { target: { value: '30' }});
		fireEvent.keyDown(lowerInput(), { key: 'a' });
		fireEvent.change(upperInput(), { target: { value: '70' }});
		fireEvent.keyDown(upperInput(), { key: 'a' });

		expect(onChange).not.toHaveBeenCalled();
	});
});

describe('RangeSlider — Radix keyboard + drag-end', () => {
	it('early-returns the drag-end commit when there is no pending drag', () => {
		const onChange = vi.fn();
		const { container } = renderSlider({ onChange });
		const root = container.querySelector('.fe-range-slider__root') as HTMLElement;

		fireEvent.pointerUp(root);

		expect(onChange).not.toHaveBeenCalled();
	});

	it('commits a keyboard step through Radix, then de-dupes the drag-end', () => {
		const onChange = vi.fn();
		const { container } = renderSlider({ onChange });
		const [lowerThumb] = screen.getAllByRole('slider');

		fireEvent.keyDown(lowerThumb as HTMLElement, { key: 'ArrowRight' });

		expect(onChange).toHaveBeenCalledWith({ max: 80, min: 21 });

		// The drag-end reads the populated drag ref and re-commits the same value → de-duped.
		const root = container.querySelector('.fe-range-slider__root') as HTMLElement;

		fireEvent.pointerUp(root);
		expect(onChange).toHaveBeenCalledTimes(1);
	});
});

describe('RangeSlider — log scale', () => {
	/** A price-shaped slider: a $4 floor, a long tail, a log track softened by ten dollars. */
	const PRICE_BASELINE = { max: 3242, min: 4 } as const;
	const PRICE_SCALE = logSliderScale(PRICE_BASELINE, 'min', 10);

	/**
	 * Render a log-scaled price slider.
	 *
	 * @param overrides - Prop overrides.
	 * @returns The render result.
	 */
	function renderLog(overrides: Partial<RangeSliderProps> = {}): ReturnType<typeof render> {
		return renderSlider({
			baseline: PRICE_BASELINE,
			format: FORMAT,
			scale: PRICE_SCALE,
			valueMax: 3242,
			valueMin: 4,
			...overrides,
		});
	}

	it('runs Radix over track positions and announces the value, not the position', () => {
		renderLog({ valueMax: 100, valueMin: 27 });
		const [lowerThumb, upperThumb] = screen.getAllByRole('slider');

		expect(lowerThumb?.getAttribute('aria-valuemax')).toBe(String(SLIDER_POSITION_RESOLUTION));
		expect(lowerThumb?.getAttribute('aria-valuenow')).toBe(String(Math.round(PRICE_SCALE.toFraction(27) * SLIDER_POSITION_RESOLUTION)));
		expect(lowerThumb?.getAttribute('aria-valuetext')).toBe('27');
		expect(upperThumb?.getAttribute('aria-valuetext')).toBe('100');
	});

	it('steps a thumb by about one percent of the track per arrow key', () => {
		const onChange = vi.fn();

		renderLog({ onChange, valueMax: 3242, valueMin: 1000 });
		const [lowerThumb] = screen.getAllByRole('slider');

		fireEvent.keyDown(lowerThumb as HTMLElement, { key: 'ArrowRight' });

		const committed = (onChange.mock.calls[0]?.[0] as { min: number } | undefined)?.min ?? 0;

		// A $1 step would have been 1001; one percent of a log track from $1,000 is far more.
		expect(committed).toBeGreaterThan(1030);
		expect(PRICE_SCALE.toFraction(committed) - PRICE_SCALE.toFraction(1000)).toBeCloseTo(0.01, 2);
	});

	it('moves the upper thumb down, and never below the lower one', () => {
		const onChange = vi.fn();

		renderLog({ onChange, valueMax: 5, valueMin: 5 });
		const [, upperThumb] = screen.getAllByRole('slider');

		fireEvent.keyDown(upperThumb as HTMLElement, { key: 'ArrowLeft' });

		// Already at the lower thumb: the step is clamped there, which is no change, so nothing commits.
		expect(onChange).not.toHaveBeenCalled();
	});

	it('steps the lower thumb for an arrow key that reaches the root from elsewhere, as Radix does', () => {
		const onChange = vi.fn();
		const { container } = renderLog({ onChange, valueMax: 3242, valueMin: 1000 });

		fireEvent.keyDown(container.querySelector('.fe-range-slider__root') as HTMLElement, { key: 'ArrowRight' });

		const committed = (onChange.mock.calls[0]?.[0] as { max: number; min: number } | undefined) ?? { max: 0, min: 0 };

		expect(committed.max).toBe(3242);
		expect(PRICE_SCALE.toFraction(committed.min) - PRICE_SCALE.toFraction(1000)).toBeCloseTo(0.01, 2);
	});

	it('leaves keys that are not arrows to Radix', () => {
		const onChange = vi.fn();

		renderLog({ onChange, valueMax: 3242, valueMin: 1000 });
		const [lowerThumb] = screen.getAllByRole('slider');

		fireEvent.keyDown(lowerThumb as HTMLElement, { key: 'Home' });

		// Radix's Home: the lower thumb to the start of the track, converted back to a value.
		expect(onChange).toHaveBeenCalledWith({ max: 3242, min: 4 });
	});
});
