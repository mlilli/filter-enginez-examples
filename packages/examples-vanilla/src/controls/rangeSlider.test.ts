/**
 * Tests for `createRangeSlider`'s distribution overlay.
 *
 * @remarks
 * **Scoped deliberately to the overlay.** The tier and height arithmetic is shared by all six
 * verticals and is tested once at its source, in `react-ui`'s `histogram.test.ts`. What is unique to
 * the framework-less port is the part no framework is doing for it: **DOM reconciliation.** The five
 * other ports hand a list to a template; here the bars are created once and repainted in place, so
 * the failures available to this file — a bar left over from a longer previous list, a stale class on
 * a reused bar, an empty container still occupying its 38px band — are ones the others cannot have.
 *
 * jsdom does not load `ui-styles`, so `setHidden`'s inline `display` is asserted directly. That is
 * also the honest thing to assert: the reason this control must use `setHidden` rather than
 * `toggleAttribute('hidden')` is that an authored `display: flex` beats the UA's `[hidden]` rule, and
 * an inline `display: none` is the only thing that wins.
 *
 * ### The scale cases
 *
 * The second half pins the `scale` state: that a slider given none behaves as it always did (one
 * `step` per arrow press, proportional placement), and that a log scale moves every value-to-track
 * conversion — thumb placement, pointer mapping, the arrow-key step — through the scale. The pointer
 * case stubs the track's `getBoundingClientRect`, because jsdom lays nothing out and reports a 0×0
 * box, which would map every press to the minimum.
 *
 * ### The cross-app contract
 *
 * The last three blocks pin what every app's slider does the same way: a typed bound commits through
 * the shared `resolveTypedBound` on blur or Enter (junk and an unchanged value write nothing and put
 * the committed value back), Escape commits nothing, not even through the blur it causes; a track
 * press moves the shared `nearestThumb`, nearer ON SCREEN; and the keyboard is arrows plus Home/End,
 * with no PageUp/PageDown and no Shift acceleration.
 */

import {
	createSliderScale,
	type HistogramBucket,
	type NumericBounds,
	type SliderScale,
	snapToStep,
} from '@filter-enginez/examples-shared/bounds';
import { describe, expect, it } from 'vitest';

import { createRangeSlider, type RangeSliderState } from './rangeSlider.js';

/** Three buckets over a 0-100 baseline: `[0,20)` empty, `[40,60)` tallest, `[80,100)` sparse. */
const BUCKETS: readonly HistogramBucket[] = [
	{ bucketMax: 20, bucketMin: 0, count: 0, heightFraction: 0, inSelection: false },
	{ bucketMax: 60, bucketMin: 40, count: 8, heightFraction: 1, inSelection: false },
	{ bucketMax: 100, bucketMin: 80, count: 2, heightFraction: 0.25, inSelection: false },
];

/** The default render state — full track, nothing selected out. */
const BASE_STATE: RangeSliderState = {
	baseline: { max: 100, min: 0 },
	valueMax: 100,
	valueMin: 0,
};

/**
 * Build a slider and apply one state.
 *
 * @param state - Overrides merged over {@link BASE_STATE}.
 * @returns The control plus readers over its overlay.
 */
function renderSlider(state: Partial<RangeSliderState> = {}) {
	const control = createRangeSlider({ label: 'Pages', onChange: () => undefined });

	control.update({ ...BASE_STATE, ...state });

	const container = control.element.querySelector('.fe-range-histogram') as HTMLElement;

	return {
		bars: (): HTMLElement[] => Array.from<HTMLElement>(container.querySelectorAll('.fe-range-histogram__bar')),
		container,
		update: (next: Partial<RangeSliderState>): void => {
			control.update({ ...BASE_STATE, ...state, ...next });
		},
	};
}

describe('createRangeSlider distribution overlay', () => {
	it('hides the container with an inline display when there are no buckets', () => {
		// `toggleAttribute('hidden')` would NOT work here — `.fe-range-histogram` authors `display: flex`,
		// which outranks the UA's `[hidden]` rule, and the band would stay visible but empty.
		const { bars, container } = renderSlider();

		expect(container.style.display).toBe('none');
		expect(bars()).toHaveLength(0);
	});

	it('hides it for an empty bucket list too', () => {
		expect(renderSlider({ histogram: []}).container.style.display).toBe('none');
	});

	it('reveals the container and renders one aria-hidden bar per bucket', () => {
		const { bars, container } = renderSlider({ histogram: BUCKETS });

		expect(container.style.display).toBe('');
		expect(container.getAttribute('aria-hidden')).toBe('true');
		expect(bars()).toHaveLength(3);
	});

	it('heights each bar, flooring an empty bucket below the populated minimum', () => {
		const { bars } = renderSlider({ histogram: BUCKETS });

		expect(bars()[0]?.style.height).toBe('4%');
		expect(bars()[1]?.style.height).toBe('100%');
		expect(bars()[2]?.style.height).toBe('25%');
	});

	it('re-tiers the reused bars when the selection moves', () => {
		const { bars, update } = renderSlider({ histogram: BUCKETS, valueMax: 50, valueMin: 0 });

		expect(bars()[0]?.className).toContain('--selected');
		expect(bars()[2]?.className).toContain('--available');

		// Both handles: raising only the lower past the upper collapses the selection to a point.
		update({ valueMax: 100, valueMin: 70 });

		// The reconciliation risk this catches: the bar elements are the SAME nodes, so a repaint that
		// forgot to overwrite `className` would leave the old tier on them and pass every count assertion.
		expect(bars()[0]?.className).toContain('--available');
		expect(bars()[2]?.className).toContain('--selected');
	});

	it('dims the bars outside the available zone', () => {
		const { bars } = renderSlider({ available: { max: 65, min: 30 }, histogram: BUCKETS });

		expect(bars()[0]?.className).toContain('--outside');
		expect(bars()[1]?.className).not.toContain('--outside');
	});

	it('drops surplus bars when a later bundle carries fewer buckets', () => {
		// Only reachable in this vertical: the bars are not keyed by a framework, so a shrinking list
		// leaves orphans unless the reconciliation removes them. A stale bar reads as real data.
		const { bars, update } = renderSlider({ histogram: BUCKETS });

		expect(bars()).toHaveLength(3);

		update({ histogram: BUCKETS.slice(0, 2) });

		expect(bars()).toHaveLength(2);
	});

	it('adds bars when a later bundle carries more', () => {
		const { bars, update } = renderSlider({ histogram: BUCKETS.slice(0, 1) });

		expect(bars()).toHaveLength(1);

		update({ histogram: BUCKETS });

		expect(bars()).toHaveLength(3);
		// And the grown list is fully painted, not just sized.
		expect(bars()[2]?.style.height).toBe('25%');
	});

	it('re-hides the container when the buckets go away', () => {
		const { container, update } = renderSlider({ histogram: BUCKETS });

		expect(container.style.display).toBe('');

		update({ histogram: undefined });

		expect(container.style.display).toBe('none');
	});
});

/** A price-shaped baseline: a $4 floor and a long tail to $3,242. */
const PRICE_BASELINE: NumericBounds = { max: 3242, min: 4 };

/** A log scale anchored at that floor, softened by ten $1 steps — the shape wine price uses. */
const PRICE_SCALE: SliderScale = createSliderScale({ anchor: 'min', kind: 'log' }, PRICE_BASELINE, 1);

/**
 * Build a slider that records every commit, and apply one state.
 *
 * @param state - The render state.
 * @param step - The slider's step.
 * @returns The slider's root, its commits so far, and readers over its thumbs.
 */
function renderScaledSlider(state: RangeSliderState, step: number) {
	const commits: NumericBounds[] = [];
	const control = createRangeSlider({
		format: (value) => `$${String(value)}`,
		label: 'Price',
		onChange: (next) => {
			commits.push(next);
		},
		step,
	});

	control.update(state);
	document.body.replaceChildren(control.element);

	/**
	 * One thumb, by the accessible name the slider builds.
	 *
	 * @param bound - Which thumb.
	 * @returns The `role="slider"` element.
	 */
	const thumb = (bound: 'lower' | 'upper'): HTMLElement =>
		control.element.querySelector<HTMLElement>(`[aria-label="Price ${bound} bound"]`) as HTMLElement;

	return {
		commits,
		element: control.element,
		/**
		 * Press a key on one thumb.
		 *
		 * @param bound - Which thumb.
		 * @param key - The key.
		 */
		press: (bound: 'lower' | 'upper', key: string): void => {
			thumb(bound).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key }));
		},
		thumb,
		/**
		 * A thumb's track position, in percent, as the slider placed it.
		 *
		 * @param bound - Which thumb.
		 * @returns The position.
		 */
		thumbPercent: (bound: 'lower' | 'upper'): number => Number(thumb(bound).style.getPropertyValue('--fe-thumb-pct')),
	};
}

describe('createRangeSlider with no scale', () => {
	it('places values proportionally and steps one `step` per arrow press, as it always has', () => {
		const slider = renderScaledSlider({ baseline: { max: 100, min: 0 }, valueMax: 75, valueMin: 0 }, 5);

		expect(slider.thumbPercent('upper')).toBe(75);

		slider.press('lower', 'ArrowRight');
		slider.press('upper', 'ArrowLeft');

		// The second commit keeps the first one's lower bound: the slider paints what it committed at
		// once, before any `update` confirms it.
		expect(slider.commits).toEqual([{ max: 75, min: 5 }, { max: 70, min: 5 }]);
	});

	it('steps repeated arrow presses from the PAINTED value while the engine has not answered', () => {
		// The worker-tier case: no `update` arrives between the presses, so a slider that stepped from
		// its last confirmed value would commit 70 twice.
		const slider = renderScaledSlider({ baseline: { max: 100, min: 0 }, valueMax: 75, valueMin: 0 }, 5);

		slider.press('upper', 'ArrowLeft');
		slider.press('upper', 'ArrowLeft');

		expect(slider.commits).toEqual([{ max: 70, min: 0 }, { max: 65, min: 0 }]);
		expect(slider.thumb('upper').getAttribute('aria-valuenow')).toBe('65');
	});
});

describe('createRangeSlider with a log scale', () => {
	it('places a thumb where the scale puts its value, not where a linear track would', () => {
		// $30 is under 1% of the way along a linear $4–$3,242 track; on the log track the everyday range
		// gets a usable share of the control. The assertion is against the scale itself, so it pins the
		// wiring rather than one curve's numbers.
		const slider = renderScaledSlider(
			{ baseline: PRICE_BASELINE, scale: PRICE_SCALE, valueMax: 3242, valueMin: 30 },
			1,
		);

		expect(slider.thumbPercent('lower')).toBeCloseTo(PRICE_SCALE.toFraction(30) * 100, 6);
		expect(slider.thumbPercent('lower')).toBeGreaterThan(20);
		expect(slider.thumbPercent('upper')).toBe(100);
	});

	it('announces the formatted value on each thumb', () => {
		const slider = renderScaledSlider(
			{ baseline: PRICE_BASELINE, scale: PRICE_SCALE, valueMax: 3242, valueMin: 30 },
			1,
		);

		expect(slider.thumb('lower').getAttribute('aria-valuenow')).toBe('30');
		expect(slider.thumb('lower').getAttribute('aria-valuetext')).toBe('$30');
	});

	it('maps a pointer position through the scale and snaps the VALUE to the step', () => {
		const slider = renderScaledSlider(
			{ baseline: PRICE_BASELINE, scale: PRICE_SCALE, valueMax: 3242, valueMin: 4 },
			1,
		);
		const track = slider.element.querySelector<HTMLElement>('.fe-range-slider__track') as HTMLElement;

		// A 200px track at the viewport's left edge; a press at 150px is three quarters along it.
		track.getBoundingClientRect = (): DOMRect => ({
			bottom: 4,
			height: 4,
			left: 0,
			right: 200,
			toJSON: () => ({}),
			top: 0,
			width: 200,
			x: 0,
			y: 0,
		});
		track.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 150 }));
		window.dispatchEvent(new MouseEvent('pointerup'));

		const expected = snapToStep(PRICE_SCALE.fromFraction(0.75), 1);

		// Three quarters of a linear track would be about $2,400; on the log track it is a few hundred.
		expect(expected).toBeLessThan(1000);
		expect(slider.commits).toEqual([{ max: expected, min: 4 }]);
		expect(Number.isInteger(expected)).toBe(true);
	});

	it('moves about one percent of the track per arrow press in the tail', () => {
		const slider = renderScaledSlider(
			{ baseline: PRICE_BASELINE, scale: PRICE_SCALE, valueMax: 3242, valueMin: 4 },
			1,
		);

		slider.press('upper', 'ArrowLeft');

		const moved = slider.commits[0]?.max ?? Number.NaN;
		const fractionMoved = 1 - PRICE_SCALE.toFraction(moved);

		// A $1 step would take three thousand presses to cross this track; one percent takes a hundred.
		expect(3242 - moved).toBeGreaterThan(50);
		expect(fractionMoved).toBeGreaterThan(0.009);
		expect(fractionMoved).toBeLessThan(0.011);
	});

	it('never moves less than one step, even where one percent of the track is under a dollar', () => {
		// Near the anchor the scale is stretched: one percent of this narrow track is a few cents, which
		// snaps back to where the thumb started. The press must still move it.
		const narrow: NumericBounds = { max: 40, min: 20 };
		const slider = renderScaledSlider(
			{
				baseline: narrow,
				scale: createSliderScale({ anchor: 'min', kind: 'log' }, narrow, 1),
				valueMax: 40,
				valueMin: 20,
			},
			1,
		);

		slider.press('lower', 'ArrowRight');

		expect(slider.commits).toEqual([{ max: 40, min: 21 }]);
	});
});

/**
 * Build a slider over a 0–100 baseline with editable fields, recording every commit.
 *
 * @param options - The step, an optional format, and the initial state's overrides.
 * @returns The commits, the two fields, and helpers to type into them.
 */
function renderEditableSlider(options: {
	readonly format?: (value: number) => string;
	readonly state?: Partial<RangeSliderState>;
	readonly step?: number;
} = {}) {
	const commits: NumericBounds[] = [];
	const control = createRangeSlider({
		format: options.format,
		label: 'Pages',
		onChange: (next) => {
			commits.push(next);
		},
		step: options.step ?? 1,
	});

	control.update({ baseline: { max: 100, min: 0 }, valueMax: 80, valueMin: 20, ...options.state });
	document.body.replaceChildren(control.element);

	/**
	 * One editable field, by its accessible name.
	 *
	 * @param bound - Which field.
	 * @returns The input.
	 */
	const field = (bound: 'lower' | 'upper'): HTMLInputElement =>
		control.element.querySelector<HTMLInputElement>(`[aria-label="Pages ${bound} bound (editable)"]`) as HTMLInputElement;

	/**
	 * Focus a field and replace its text, as typing would.
	 *
	 * @param bound - Which field.
	 * @param text - The text.
	 * @returns The field.
	 */
	const type = (bound: 'lower' | 'upper', text: string): HTMLInputElement => {
		const input = field(bound);

		input.focus();
		input.value = text;

		return input;
	};

	/**
	 * Press a key in a field.
	 *
	 * @param bound - Which field.
	 * @param key - The key.
	 */
	const pressInField = (bound: 'lower' | 'upper', key: string): void => {
		field(bound).dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
	};

	return { commits, control, field, pressInField, type };
}

describe('createRangeSlider typed bounds', () => {
	it('snaps a typed value to the step on blur and shows the committed bound', () => {
		const slider = renderEditableSlider({ step: 5 });

		slider.type('lower', '22').blur();

		// 22 snaps to 20, the committed lower bound: nothing to write.
		expect(slider.commits).toEqual([]);
		expect(slider.field('lower').value).toBe('20');

		slider.type('lower', '23').blur();

		// 23 snaps to 25, a real change.
		expect(slider.commits).toEqual([{ max: 80, min: 25 }]);
		expect(slider.field('lower').value).toBe('25');
	});

	it('clamps a typed value into the available zone', () => {
		const slider = renderEditableSlider({ state: { available: { max: 90, min: 10 }}});

		slider.type('upper', '500').blur();

		expect(slider.commits).toEqual([{ max: 90, min: 20 }]);
		expect(slider.field('upper').value).toBe('90');
	});

	it('writes nothing for junk and puts the committed value back, formatted', () => {
		const slider = renderEditableSlider({ format: (value) => `${String(value)} pp` });

		slider.type('lower', 'abc').blur();

		expect(slider.commits).toEqual([]);
		expect(slider.field('lower').value).toBe('20 pp');
	});

	it('writes nothing for a value that snaps to the bound already committed, and tidies the field', () => {
		const slider = renderEditableSlider();

		slider.type('upper', '80.2').blur();

		expect(slider.commits).toEqual([]);
		expect(slider.field('upper').value).toBe('80');
	});

	it('re-orders a lower bound typed above the upper one, keeping min ≤ max', () => {
		const slider = renderEditableSlider();

		slider.type('lower', '95').blur();

		expect(slider.commits).toEqual([{ max: 95, min: 80 }]);
	});

	it('commits once on Enter, not again on the blur that follows', () => {
		const slider = renderEditableSlider();

		slider.type('upper', '60');
		slider.pressInField('upper', 'Enter');

		expect(slider.commits).toEqual([{ max: 60, min: 20 }]);
		expect(document.activeElement).not.toBe(slider.field('upper'));
		expect(slider.field('upper').value).toBe('60');
	});

	it('shows the committed bound after Enter even while the field still has focus', () => {
		// The case `paint` cannot cover: it leaves a focused field alone, and Enter commits before the
		// blur. A field that kept `60.4` would show a bound that is not the one filtering.
		const slider = renderEditableSlider();
		const input = slider.type('upper', '60.4');

		input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' }));

		expect(slider.commits).toEqual([{ max: 60, min: 20 }]);
		expect(input.value).toBe('60');
	});

	it('reverts on Escape and commits nothing, not even through the blur Escape causes', () => {
		// A format that does not parse back to the committed value: 40.5 shows as `41`. A blur that
		// committed the field's text after Escape would write 41 — a bound the user never asked for.
		const slider = renderEditableSlider({
			format: (value) => value.toFixed(0),
			state: { valueMax: 80, valueMin: 40.5 },
			step: 0.5,
		});

		slider.type('lower', '10');
		slider.pressInField('lower', 'Escape');

		expect(slider.commits).toEqual([]);
		expect(slider.field('lower').value).toBe('41');
		expect(document.activeElement).not.toBe(slider.field('lower'));
	});

	it('still commits on a later ordinary blur after an Escape', () => {
		// The flag that silences the Escape blur must come down again, or every later edit is lost.
		const slider = renderEditableSlider();

		slider.type('lower', '30');
		slider.pressInField('lower', 'Escape');
		slider.type('lower', '30').blur();

		expect(slider.commits).toEqual([{ max: 80, min: 30 }]);
	});

	it('ignores other keys in a field', () => {
		const slider = renderEditableSlider();

		slider.type('lower', '30');
		slider.pressInField('lower', 'a');

		expect(slider.commits).toEqual([]);
		expect(slider.field('lower').value).toBe('30');
	});
});

describe('createRangeSlider track press', () => {
	/**
	 * Press the track at a fraction of its width and release.
	 *
	 * @param element - The slider root.
	 * @param fraction - Where along the track, 0–1.
	 */
	function pressTrackAt(element: HTMLElement, fraction: number): void {
		const track = element.querySelector<HTMLElement>('.fe-range-slider__track') as HTMLElement;

		track.getBoundingClientRect = (): DOMRect => ({
			bottom: 4,
			height: 4,
			left: 0,
			right: 1000,
			toJSON: () => ({}),
			top: 0,
			width: 1000,
			x: 0,
			y: 0,
		});
		track.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: fraction * 1000 }));
		window.dispatchEvent(new MouseEvent('pointerup'));
	}

	it('moves the thumb nearer ON SCREEN on a log track, even when the other is nearer in value', () => {
		const slider = renderScaledSlider(
			{ baseline: PRICE_BASELINE, scale: PRICE_SCALE, valueMax: 1000, valueMin: 10 },
			1,
		);
		const midway = (PRICE_SCALE.toFraction(10) + PRICE_SCALE.toFraction(1000)) / 2;
		const pressed = midway + 0.02;
		const value = snapToStep(PRICE_SCALE.fromFraction(pressed), 1);

		// Non-vacuous: the pressed value is nearer the LOWER thumb in dollars, yet nearer the upper one
		// on the track, which is the distance the user sees.
		expect(value - 10).toBeLessThan(1000 - value);

		pressTrackAt(slider.element, pressed);

		expect(slider.commits).toEqual([{ max: value, min: 10 }]);
	});

	it('moves the lower thumb for a press nearer it on screen', () => {
		const slider = renderScaledSlider(
			{ baseline: PRICE_BASELINE, scale: PRICE_SCALE, valueMax: 1000, valueMin: 10 },
			1,
		);
		const midway = (PRICE_SCALE.toFraction(10) + PRICE_SCALE.toFraction(1000)) / 2;
		const pressed = midway - 0.02;

		pressTrackAt(slider.element, pressed);

		expect(slider.commits).toEqual([{ max: 1000, min: snapToStep(PRICE_SCALE.fromFraction(pressed), 1) }]);
	});

	it('extends rather than inverts: a press below both thumbs moves the lower one', () => {
		const slider = renderScaledSlider({ baseline: { max: 100, min: 0 }, valueMax: 50, valueMin: 50 }, 1);

		pressTrackAt(slider.element, 0.2);

		expect(slider.commits).toEqual([{ max: 50, min: 20 }]);
	});
});

describe('createRangeSlider keyboard', () => {
	/**
	 * Press a key on a thumb and report whether the slider claimed it.
	 *
	 * @param thumb - The thumb.
	 * @param key - The key.
	 * @param shiftKey - Whether Shift is held.
	 * @returns Whether the event's default was prevented.
	 */
	function pressKey(thumb: HTMLElement, key: string, shiftKey = false): boolean {
		const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, shiftKey });

		thumb.dispatchEvent(event);

		return event.defaultPrevented;
	}

	it('leaves PageUp and PageDown alone: no step, no commit, the default kept', () => {
		const slider = renderScaledSlider({ baseline: { max: 100, min: 0 }, valueMax: 80, valueMin: 20 }, 5);

		expect(pressKey(slider.thumb('lower'), 'PageUp')).toBe(false);
		expect(pressKey(slider.thumb('upper'), 'PageDown')).toBe(false);
		expect(slider.commits).toEqual([]);
	});

	it('steps one step with Shift held, never an accelerated one', () => {
		const slider = renderScaledSlider({ baseline: { max: 100, min: 0 }, valueMax: 80, valueMin: 20 }, 5);

		expect(pressKey(slider.thumb('lower'), 'ArrowRight', true)).toBe(true);
		pressKey(slider.thumb('upper'), 'ArrowDown', true);

		expect(slider.commits).toEqual([{ max: 80, min: 25 }, { max: 75, min: 25 }]);
	});

	it('steps with ArrowUp and ArrowLeft too', () => {
		const slider = renderScaledSlider({ baseline: { max: 100, min: 0 }, valueMax: 80, valueMin: 20 }, 5);

		pressKey(slider.thumb('upper'), 'ArrowUp');
		pressKey(slider.thumb('lower'), 'ArrowLeft');

		expect(slider.commits).toEqual([{ max: 85, min: 20 }, { max: 85, min: 15 }]);
	});

	it('jumps to the AVAILABLE bounds with Home and End', () => {
		const slider = renderScaledSlider(
			{ available: { max: 90, min: 10 }, baseline: { max: 100, min: 0 }, valueMax: 80, valueMin: 20 },
			5,
		);

		pressKey(slider.thumb('lower'), 'Home');
		pressKey(slider.thumb('upper'), 'End');

		expect(slider.commits).toEqual([{ max: 80, min: 10 }, { max: 90, min: 10 }]);
	});

	it('lets the thumbs meet but never cross', () => {
		const slider = renderScaledSlider({ baseline: { max: 100, min: 0 }, valueMax: 80, valueMin: 20 }, 5);

		pressKey(slider.thumb('lower'), 'End');
		pressKey(slider.thumb('upper'), 'Home');

		// The lower thumb stops at the upper (min = max), then the upper cannot pass below it.
		expect(slider.commits).toEqual([{ max: 80, min: 80 }]);
	});
});
