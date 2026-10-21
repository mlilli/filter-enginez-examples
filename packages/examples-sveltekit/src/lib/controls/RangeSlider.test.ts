/**
 * Tests for `<RangeSlider>`'s track scale.
 *
 * @remarks
 * The slider is shared by books, real estate and wine. Books and real estate pass no `scale` and must
 * get the plain proportional track they always had; wine's price and vintage pass a log scale so the
 * everyday bottles are not squeezed into the first sliver of the control. Three places convert between
 * a value and a track position — where a thumb is drawn, where a pointer lands, and how far an arrow
 * key moves — and each is pinned here for both scales, because a slider that draws through the scale
 * but reads the pointer linearly would place a thumb somewhere other than where the user pressed.
 *
 * The expected numbers come from the scale itself (`toFraction`, `fromFraction`, `stepScaledValue`),
 * not from restated arithmetic, so these tests pin that the component ROUTES through the scale; the
 * scale's own math has its suite in `react-ui`.
 *
 * The editable bounds are pinned too: they commit on blur or Enter only, once; junk text or an
 * unchanged value puts the committed value back and writes nothing; and Escape reverts without
 * committing, including on the blur it causes, which reads the field's stale DOM text.
 */


import {
	createSliderScale,
	type NumericBounds,
	type SliderScale,
	snapToStep,
	stepScaledValue,
} from '@filter-enginez/examples-shared/bounds';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { type ComponentProps, tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import RangeSlider from './RangeSlider.svelte';

/** The component's own prop shape, so a renamed or retyped prop fails here rather than at runtime. */
type SliderProps = ComponentProps<typeof RangeSlider>;

/** What `onChange` receives. */
type SliderChange = Parameters<SliderProps['onChange']>[0];

// Not automatic in this app's vitest setup — without it each render stacks another slider in the same
// document and the thumb queries find every previous case's too.
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

/** A wine-price-shaped baseline: a few dollars at the floor, thousands in the tail. */
const PRICE_BASELINE: NumericBounds = { max: 3242, min: 4 };

/** The log scale wine's price slider uses: anchored at the cheap end, softened over ten $1 steps. */
const PRICE_SCALE: SliderScale = createSliderScale({ anchor: 'min', kind: 'log' }, PRICE_BASELINE, 1);

/** The width the track reports to the pointer math. */
const TRACK_WIDTH_PX = 400;

/**
 * Render a slider and collect what it commits.
 *
 * @param overrides - Props that differ from a full-baseline, unscaled slider.
 * @returns The render container and every value passed to `onChange`.
 */
function renderSlider(overrides: Partial<SliderProps> = {}): { changes: SliderChange[]; container: HTMLElement } {
	const changes: SliderChange[] = [];
	const { container } = render(RangeSlider, {
		baseline: PRICE_BASELINE,
		label: 'Price',
		onChange: (next) => {
			changes.push(next);
		},
		valueMax: PRICE_BASELINE.max,
		valueMin: PRICE_BASELINE.min,
		...overrides,
	});

	return { changes, container };
}

/**
 * The two thumbs, lower first.
 *
 * @param container - The render container.
 * @returns The thumb elements.
 */
function thumbs(container: HTMLElement): readonly [HTMLElement, HTMLElement] {
	const found = [...container.querySelectorAll<HTMLElement>('[role="slider"]')];

	expect(found).toHaveLength(2);

	const [lower, upper] = found;

	return [lower, upper] as [HTMLElement, HTMLElement];
}

/**
 * Where a thumb is drawn, as the percentage the stylesheet positions it by.
 *
 * @param thumb - A thumb element.
 * @returns Its `--fe-thumb-pct`.
 */
function thumbPercent(thumb: HTMLElement): number {
	return Number(thumb.style.getPropertyValue('--fe-thumb-pct'));
}

/**
 * Give the track a real width. jsdom lays nothing out, so every rect is zero-sized and the pointer
 * math would read every press as the left edge.
 *
 * @param container - The render container.
 * @returns The track element.
 */
function sizeTrack(container: HTMLElement): HTMLElement {
	const track = container.querySelector<HTMLElement>('.fe-range-slider__track');

	expect(track).not.toBeNull();
	vi.spyOn(track as HTMLElement, 'getBoundingClientRect').mockReturnValue(
		new DOMRect(0, 0, TRACK_WIDTH_PX, 8),
	);

	return track as HTMLElement;
}

/**
 * Press the track at a share of its width and release, the way a click does.
 *
 * @param track - The sized track.
 * @param fraction - Where along the track to press, `0..1`.
 */
async function clickTrackAt(track: HTMLElement, fraction: number): Promise<void> {
	await fireEvent.pointerDown(track, { clientX: fraction * TRACK_WIDTH_PX });
	await fireEvent.pointerUp(window);
}

describe('RangeSlider with no scale', () => {
	it('draws thumbs proportionally, exactly as a linear track always has', () => {
		const { container } = renderSlider({ baseline: { max: 100, min: 0 }, valueMax: 75, valueMin: 25 });
		const [lower, upper] = thumbs(container);

		expect(thumbPercent(lower)).toBe(25);
		expect(thumbPercent(upper)).toBe(75);
	});

	it('moves a thumb by exactly one step per arrow press', async () => {
		const { changes, container } = renderSlider({ baseline: { max: 100, min: 0 }, step: 5, valueMax: 75, valueMin: 25 });
		const [, upper] = thumbs(container);

		await fireEvent.keyDown(upper, { key: 'ArrowLeft' });

		expect(changes).toEqual([{ max: 70, min: 25 }]);
	});

	it('reads a pointer press linearly', async () => {
		const { changes, container } = renderSlider({ baseline: { max: 100, min: 0 }, valueMax: 100, valueMin: 0 });

		await clickTrackAt(sizeTrack(container), 0.9);

		expect(changes).toEqual([{ max: 90, min: 0 }]);
	});
});

describe('RangeSlider with a log scale', () => {
	it('draws a thumb where the scale places its value, not where a linear track would', () => {
		const { container } = renderSlider({ scale: PRICE_SCALE, valueMax: 300, valueMin: 25 });
		const [lower, upper] = thumbs(container);

		expect(thumbPercent(lower)).toBeCloseTo(PRICE_SCALE.toFraction(25) * 100, 10);
		expect(thumbPercent(upper)).toBeCloseTo(PRICE_SCALE.toFraction(300) * 100, 10);
		// The point of the scale: on a linear track $25 sits under 1% of the way along; here it gets a
		// usable share of the control.
		expect(thumbPercent(lower)).toBeGreaterThan(15);
	});

	it('draws the selected range between the scaled thumb positions', () => {
		const { container } = renderSlider({ scale: PRICE_SCALE, valueMax: 300, valueMin: 25 });
		const range = container.querySelector<HTMLElement>('.fe-range-slider__range');
		const left = PRICE_SCALE.toFraction(25) * 100;
		const right = PRICE_SCALE.toFraction(300) * 100;

		expect(Number.parseFloat(range?.style.left ?? '')).toBeCloseTo(left, 10);
		expect(Number.parseFloat(range?.style.width ?? '')).toBeCloseTo(right - left, 10);
	});

	it('reads a pointer press back through the scale, snapped to the step', async () => {
		const { changes, container } = renderSlider({ scale: PRICE_SCALE, step: 1 });

		await clickTrackAt(sizeTrack(container), 0.5);

		const expected = snapToStep(PRICE_SCALE.fromFraction(0.5), 1);

		expect(changes).toEqual([{ max: PRICE_BASELINE.max, min: expected }]);
		// Half-way along a log track is far below the linear midpoint (about $1,600).
		expect(expected).toBeLessThan(400);
	});

	it('moves a thumb about one percent of the track per arrow press in the tail', async () => {
		const { changes, container } = renderSlider({ scale: PRICE_SCALE, step: 1 });
		const [, upper] = thumbs(container);

		await fireEvent.keyDown(upper, { key: 'ArrowLeft' });

		const expected = stepScaledValue(PRICE_SCALE, PRICE_BASELINE.max, -1, 1);

		expect(changes).toEqual([{ max: expected, min: PRICE_BASELINE.min }]);
		// One percent of the track at the expensive end is well over a hundred dollars; a $1 step would
		// take thousands of presses to cross the tail.
		expect(PRICE_BASELINE.max - expected).toBeGreaterThan(100);
		expect(PRICE_SCALE.toFraction(PRICE_BASELINE.max) - PRICE_SCALE.toFraction(expected)).toBeCloseTo(0.01, 2);
	});

	it('never moves a thumb less than one step, even where one percent of the track is under a dollar', async () => {
		const { changes, container } = renderSlider({ scale: PRICE_SCALE, step: 1 });
		const [lower] = thumbs(container);

		await fireEvent.keyDown(lower, { key: 'ArrowRight' });

		expect(changes).toEqual([{ max: PRICE_BASELINE.max, min: PRICE_BASELINE.min + 1 }]);
	});

	it('announces each thumb by its formatted value', () => {
		const { container } = renderSlider({
			format: (price: number) => `$${price.toFixed(0)}`,
			scale: PRICE_SCALE,
			valueMax: 300,
			valueMin: 25,
		});
		const [lower, upper] = thumbs(container);

		expect(lower.getAttribute('aria-valuetext')).toBe('$25');
		expect(upper.getAttribute('aria-valuetext')).toBe('$300');
		expect(lower.getAttribute('aria-valuenow')).toBe('25');
	});
});

describe('RangeSlider track press on a log scale', () => {
	it('moves the thumb nearer ON SCREEN, which is not the one nearer in value', async () => {
		// Thumbs at $10 and $1,000. A press just past the midpoint between them ON THE TRACK lands near
		// $100: ninety dollars from the lower thumb and nine hundred from the upper, so a raw-value
		// comparison would move the lower thumb, though the upper one is closer under the pointer.
		const { changes, container } = renderSlider({ scale: PRICE_SCALE, step: 1, valueMax: 1000, valueMin: 10 });
		const lowerFraction = PRICE_SCALE.toFraction(10);
		const upperFraction = PRICE_SCALE.toFraction(1000);
		const pressFraction = (lowerFraction + upperFraction) / 2 + 0.02;
		const pressed = snapToStep(PRICE_SCALE.fromFraction(pressFraction), 1);

		expect(pressed - 10).toBeLessThan(1000 - pressed);

		await clickTrackAt(sizeTrack(container), pressFraction);

		expect(changes).toEqual([{ max: pressed, min: 10 }]);
	});
});

describe('RangeSlider editable bounds', () => {
	/** A linear 0–100 slider showing `25 — 75`, formatted with a unit so a reset is visible. */
	const LINEAR = {
		baseline: { max: 100, min: 0 },
		format: (value: number) => `${String(value)} u`,
		parse: (raw: string) => Number.parseFloat(raw),
		valueMax: 75,
		valueMin: 25,
	} satisfies Partial<SliderProps>;

	/**
	 * The two editable fields, lower first.
	 *
	 * @param container - The render container.
	 * @returns The fields.
	 */
	function fields(container: HTMLElement): readonly [HTMLInputElement, HTMLInputElement] {
		const lower = container.querySelector<HTMLInputElement>('.fe-range-slider__input--min');
		const upper = container.querySelector<HTMLInputElement>('.fe-range-slider__input--max');

		expect(lower).not.toBeNull();
		expect(upper).not.toBeNull();

		return [lower as HTMLInputElement, upper as HTMLInputElement];
	}

	it('commits a typed bound once on Enter, not again on the blur Enter causes', async () => {
		const { changes, container } = renderSlider(LINEAR);
		const [lower] = fields(container);

		lower.focus();
		await fireEvent.input(lower, { target: { value: '40' }});
		await fireEvent.keyDown(lower, { key: 'Enter' });

		expect(changes).toEqual([{ max: 75, min: 40 }]);
		expect(document.activeElement).not.toBe(lower);
	});

	it('swaps a lower bound typed above the upper one', async () => {
		const { changes, container } = renderSlider(LINEAR);
		const [lower] = fields(container);

		await fireEvent.input(lower, { target: { value: '90' }});
		await fireEvent.blur(lower);

		expect(changes).toEqual([{ max: 90, min: 75 }]);
	});

	it('puts the committed value back and writes nothing for junk text', async () => {
		const { changes, container } = renderSlider(LINEAR);
		const [lower] = fields(container);

		await fireEvent.input(lower, { target: { value: 'abc' }});
		await fireEvent.blur(lower);
		await tick();

		expect(changes).toEqual([]);
		expect(lower.value).toBe('25 u');
	});

	it('puts the formatted value back and writes nothing for the committed value retyped', async () => {
		const { changes, container } = renderSlider(LINEAR);
		const [, upper] = fields(container);

		await fireEvent.input(upper, { target: { value: '75' }});
		await fireEvent.blur(upper);
		await tick();

		expect(changes).toEqual([]);
		expect(upper.value).toBe('75 u');
	});

	it('reverts on Escape and commits nothing, even on the blur Escape causes', async () => {
		// The blur reads the field's DOM text, which still holds the discarded draft until the reverted
		// value renders; committing there would write exactly what the user threw away.
		const { changes, container } = renderSlider(LINEAR);
		const [lower] = fields(container);

		lower.focus();
		await fireEvent.input(lower, { target: { value: '40' }});
		await fireEvent.keyDown(lower, { key: 'Escape' });
		await tick();

		expect(changes).toEqual([]);
		expect(lower.value).toBe('25 u');
		expect(document.activeElement).not.toBe(lower);
	});

	it('moves a thumb with the arrow keys only, never PageUp or PageDown', async () => {
		const { changes, container } = renderSlider({ ...LINEAR, step: 5 });
		const [lowerThumb] = thumbs(container);

		await fireEvent.keyDown(lowerThumb, { key: 'PageUp' });
		await fireEvent.keyDown(lowerThumb, { key: 'PageDown' });

		expect(changes).toEqual([]);

		await fireEvent.keyDown(lowerThumb, { key: 'ArrowRight', shiftKey: true });

		expect(changes).toEqual([{ max: 75, min: 30 }]);
	});
});
