/**
 * Tests for `<RangeSlider>`'s distribution overlay and its track scale.
 *
 * @remarks
 * **The overlay suite is scoped deliberately to the overlay.** The tier and height arithmetic is shared by all six
 * verticals and is tested once, at its source, in `react-ui`'s `histogram.test.ts` — asserting the
 * epsilon boundaries six more times would recreate exactly the duplication sharing it avoids.
 * What is unique to THIS file is the wiring: that the buckets reach the DOM, that the bars re-tier
 * when the handles or the available zone move, and that no overlay renders when there are no buckets.
 *
 * That last one is not cosmetic. `.fe-range-histogram` is an authored 32px flex row plus 6px of
 * margin, so a container rendered empty leaves a visible band above the track for the frame before
 * the first bundle resolves — and every slider in the app has that frame.
 */

import {
	createSliderScale,
	type HistogramBucket,
	type NumericBounds,
	snapToStep,
} from '@filter-enginez/examples-shared/bounds';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import RangeSlider from './RangeSlider.vue';

/** Three buckets over a 0-100 baseline: `[0,20)` empty, `[40,60)` tallest, `[80,100)` sparse. */
const BUCKETS: readonly HistogramBucket[] = [
	{ bucketMax: 20, bucketMin: 0, count: 0, heightFraction: 0, inSelection: false },
	{ bucketMax: 60, bucketMin: 40, count: 8, heightFraction: 1, inSelection: false },
	{ bucketMax: 100, bucketMin: 80, count: 2, heightFraction: 0.25, inSelection: false },
];

/**
 * Mount one slider over a 0-100 baseline.
 *
 * @param props - Overrides merged over the defaults.
 * @returns The wrapper.
 */
function mountSlider(props: Record<string, unknown> = {}) {
	return mount(RangeSlider, {
		props: {
			baseline: { max: 100, min: 0 },
			label: 'Pages',
			valueMax: 100,
			valueMin: 0,
			...props,
		},
	});
}

describe('RangeSlider distribution overlay', () => {
	it('renders no overlay at all when no buckets are supplied', () => {
		expect(mountSlider().find('.fe-range-histogram').exists()).toBe(false);
	});

	it('renders no overlay for an empty bucket list either', () => {
		// The two absences are different upstream — no bundle yet versus a field with no buckets — and
		// must look the same here.
		expect(mountSlider({ histogram: []}).find('.fe-range-histogram').exists()).toBe(false);
	});

	it('renders one aria-hidden bar per bucket', () => {
		const wrapper = mountSlider({ histogram: BUCKETS });

		expect(wrapper.findAll('.fe-range-histogram__bar')).toHaveLength(3);
		expect(wrapper.find('.fe-range-histogram').attributes('aria-hidden')).toBe('true');
	});

	it('heights each bar, flooring an empty bucket below the populated minimum', () => {
		const bars = mountSlider({ histogram: BUCKETS }).findAll('.fe-range-histogram__bar');

		expect(bars[0]?.attributes('style')).toContain('height: 4%');
		expect(bars[1]?.attributes('style')).toContain('height: 100%');
		expect(bars[2]?.attributes('style')).toContain('height: 25%');
	});

	it('tiers the bars against the selection, and re-tiers when it moves', async () => {
		const wrapper = mountSlider({ histogram: BUCKETS, valueMax: 50, valueMin: 0 });
		const classesAt = (index: number): string =>
			wrapper.findAll('.fe-range-histogram__bar')[index]?.classes().join(' ') ?? '';

		// [0,20) and [40,60) overlap [0,50]; [80,100) does not.
		expect(classesAt(0)).toContain('fe-range-histogram__bar--selected');
		expect(classesAt(2)).toContain('fe-range-histogram__bar--available');

		// Both handles: raising only the lower past the upper collapses the selection to a point, which
		// would test the clamp rather than the bars.
		await wrapper.setProps({ valueMax: 100, valueMin: 70 });

		expect(classesAt(0)).toContain('fe-range-histogram__bar--available');
		expect(classesAt(2)).toContain('fe-range-histogram__bar--selected');
	});

	it('dims the bars outside the engine\'s available zone', async () => {
		const wrapper = mountSlider({ histogram: BUCKETS });

		await wrapper.setProps({ available: { max: 65, min: 30 }});
		const bars = wrapper.findAll('.fe-range-histogram__bar');

		// [0,20) sits wholly below availableMin — dead space, not merely unselected.
		expect(bars[0]?.classes()).toContain('fe-range-histogram__bar--outside');
		expect(bars[1]?.classes()).not.toContain('fe-range-histogram__bar--outside');
	});

	it('flags an empty bucket so the stylesheet can knock it back within its tier', () => {
		const bars = mountSlider({ histogram: BUCKETS }).findAll('.fe-range-histogram__bar');

		expect(bars[0]?.classes()).toContain('fe-range-histogram__bar--empty');
		expect(bars[1]?.classes()).not.toContain('fe-range-histogram__bar--empty');
	});
});

/** A price-like extent: a few dollars to a few thousand, the shape a log track exists for. */
const PRICE_BASELINE: NumericBounds = { max: 3242, min: 4 };

/** A vintage-like extent, dense at its maximum. */
const VINTAGE_BASELINE: NumericBounds = { max: 2025, min: 1911 };

/** Log scale anchored at the minimum, softened over a whole-dollar grid — what wine's price uses. */
const PRICE_SCALE = createSliderScale({ anchor: 'min', kind: 'log' }, PRICE_BASELINE, 1);

/** Log scale anchored at the maximum, over a one-year grid — what wine's vintage uses. */
const VINTAGE_SCALE = createSliderScale({ anchor: 'max', kind: 'log' }, VINTAGE_BASELINE, 1);

/** Width of the stubbed track, in pixels. */
const TRACK_WIDTH = 1000;

/**
 * Read a thumb's `left` percentage.
 *
 * @param wrapper - The mounted slider.
 * @param index - `0` for the lower thumb, `1` for the upper.
 * @returns The percentage, as a number.
 */
function thumbLeftPercent(wrapper: ReturnType<typeof mountSlider>, index: 0 | 1): number {
	const style = wrapper.findAll('[role="slider"]')[index]?.attributes('style') ?? '';

	return Number.parseFloat(/left:\s*([\d.]+)%/u.exec(style)?.[1] ?? 'NaN');
}

/**
 * The `change` payloads the slider has emitted.
 *
 * @param wrapper - The mounted slider.
 * @returns Every payload, oldest first.
 */
function emittedChanges(wrapper: ReturnType<typeof mountSlider>): { max: number; min: number }[] {
	return (wrapper.emitted('change') ?? []).map((args) => args[0] as { max: number; min: number });
}

/**
 * Give the track a real width, which jsdom's layout-free `getBoundingClientRect` never reports.
 */
function stubTrackGeometry(): void {
	vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
		bottom: 0,
		height: 0,
		left: 0,
		right: TRACK_WIDTH,
		toJSON: () => ({}),
		top: 0,
		width: TRACK_WIDTH,
		x: 0,
		y: 0,
	});
}

/**
 * Press and release the track at one x coordinate.
 *
 * @remarks
 * Dispatched by hand rather than through `trigger`: jsdom's `MouseEvent` exposes `clientX` as a
 * getter, so the test utilities cannot assign it after construction, and jsdom has no `PointerEvent`
 * to construct one with. A `MouseEvent` named `pointerdown` carries the one field the slider reads.
 * The release goes to `window`, where the slider listens for it during a drag.
 *
 * @param wrapper - The mounted slider.
 * @param clientX - Where on the track, in pixels from its left edge.
 */
function pressTrackAt(wrapper: ReturnType<typeof mountSlider>, clientX: number): void {
	wrapper.find('.fe-range-slider__track').element.dispatchEvent(
		new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX }),
	);
	window.dispatchEvent(new MouseEvent('pointerup'));
}

describe('RangeSlider track scale', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('places a thumb through the scale, not proportionally', () => {
		const wrapper = mountSlider({ baseline: PRICE_BASELINE, scale: PRICE_SCALE, valueMax: 3242, valueMin: 25 });
		const lowerPercent = thumbLeftPercent(wrapper, 0);

		expect(lowerPercent).toBeCloseTo(PRICE_SCALE.toFraction(25) * 100, 6);
		// On a linear track $25 would sit under 1% of the way along; on the log track it gets real room.
		expect(lowerPercent).toBeGreaterThan(10);
		expect(thumbLeftPercent(wrapper, 1)).toBe(100);
	});

	it('keeps the proportional mapping when no scale is passed', () => {
		const wrapper = mountSlider({ baseline: PRICE_BASELINE, valueMax: 3242, valueMin: 25 });

		expect(thumbLeftPercent(wrapper, 0)).toBeCloseTo(((25 - 4) / (3242 - 4)) * 100, 6);
	});

	it('reads a track press back through the scale, snapped to the step', () => {
		stubTrackGeometry();
		const wrapper = mountSlider({ baseline: PRICE_BASELINE, scale: PRICE_SCALE, valueMax: 3242, valueMin: 4 });

		pressTrackAt(wrapper, 0.3 * TRACK_WIDTH);

		const expected = snapToStep(PRICE_SCALE.fromFraction(0.3), 1);

		expect(emittedChanges(wrapper)).toEqual([{ max: 3242, min: expected }]);
		// Thirty percent of a linear track would be nearly $1,000.
		expect(expected).toBeLessThan(100);
	});

	it('reads a track press proportionally when no scale is passed', () => {
		stubTrackGeometry();
		const wrapper = mountSlider({ valueMax: 100, valueMin: 0 });

		pressTrackAt(wrapper, 0.3 * TRACK_WIDTH);

		expect(emittedChanges(wrapper)).toEqual([{ max: 100, min: 30 }]);
	});

	it('steps about one percent of a log track per arrow press', async () => {
		const wrapper = mountSlider({ baseline: PRICE_BASELINE, scale: PRICE_SCALE, valueMax: 3242, valueMin: 100 });

		await wrapper.findAll('[role="slider"]')[0]?.trigger('keydown', { key: 'ArrowRight' });
		const [change] = emittedChanges(wrapper);

		expect(change?.max).toBe(3242);
		// Several dollars at $100, where a value-space step would move one.
		expect(change?.min).toBeGreaterThan(101);
		expect(PRICE_SCALE.toFraction(change?.min ?? 0) - PRICE_SCALE.toFraction(100)).toBeCloseTo(0.01, 2);
	});

	it('never steps less than one step, even where one percent of the track rounds to nothing', async () => {
		// One percent of the vintage track at its dense end is about a quarter of a year, which snaps
		// back onto the current year; the press must still move the thumb a whole year.
		const wrapper = mountSlider({ baseline: VINTAGE_BASELINE, scale: VINTAGE_SCALE, valueMax: 2025, valueMin: 1911 });

		await wrapper.findAll('[role="slider"]')[1]?.trigger('keydown', { key: 'ArrowLeft' });

		expect(emittedChanges(wrapper)).toEqual([{ max: 2024, min: 1911 }]);
	});

	it('steps exactly one step per arrow press when no scale is passed', async () => {
		const wrapper = mountSlider({ valueMax: 100, valueMin: 10 });

		await wrapper.findAll('[role="slider"]')[0]?.trigger('keydown', { key: 'ArrowRight' });

		expect(emittedChanges(wrapper)).toEqual([{ max: 100, min: 11 }]);
	});

	it('announces each thumb by its formatted value', () => {
		const wrapper = mountSlider({
			baseline: PRICE_BASELINE,
			format: (value: number) => `$${String(value)}`,
			scale: PRICE_SCALE,
			valueMax: 3242,
			valueMin: 25,
		});
		const thumbs = wrapper.findAll('[role="slider"]');

		expect(thumbs[0]?.attributes('aria-valuetext')).toBe('$25');
		expect(thumbs[1]?.attributes('aria-valuetext')).toBe('$3242');
	});
});
