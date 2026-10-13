/**
 * Tests for `<RangeSlider>`'s distribution overlay.
 *
 * @remarks
 * **Scoped deliberately to the overlay.** The tier and height arithmetic is shared by all six
 * verticals and is tested once, at its source, in `react-ui`'s `histogram.test.ts` — asserting the
 * epsilon boundaries six more times would recreate exactly the duplication sharing it avoids.
 * What is unique to THIS file is the wiring: that the buckets reach the DOM, that the bars re-tier
 * when the handles or the available zone move, and that no overlay renders when there are no buckets.
 *
 * That last one is not cosmetic. `.fe-range-histogram` is an authored 32px flex row plus 6px of
 * margin, so a container rendered empty leaves a visible band above the track for the frame before
 * the first bundle resolves — and every slider in the app has that frame.
 */

import type { HistogramBucket } from '@filter-enginez/examples-shared/bounds';

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

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
