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
 */

import type { HistogramBucket } from '@filter-enginez/examples-shared/bounds';

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
