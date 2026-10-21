/**
 * Tests for `<RangeHistogram />` — the distribution-bar overlay above a range slider.
 *
 * @remarks
 * jsdom render via `createElement` (matching the brand / react-* convention so the `.test.ts`
 * stays off the jsx-a11y lint surface). Tier classification (in-selection / within-available /
 * outside) is resolved by `histogramBarClassName` from `available` + `displayLower` /
 * `displayUpper`, NOT read from each bucket's own `inSelection` field — so the fixture's
 * `inSelection` values are deliberately irrelevant to what renders.
 *
 * **What these assert.** The tier is a `fe-range-histogram__bar--*` modifier and `ui-styles` owns
 * the values, so the render contract is "the right modifier, and the height inline". The opacity
 * PAIRS live in the stylesheet and are pinned in `tests/tooling/uiStylesHistogram.test.ts` —
 * asserting them here would need the real stylesheet loaded into jsdom, which would test the CSS
 * through two layers of indirection.
 */

import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import type { HistogramBucket } from './histogram.js';

import { RangeHistogram } from './RangeHistogram.js';

afterEach(cleanup);

/**
 * A six-bucket fixture engineered to hit every tier × count-arm combination given
 * `available = [2, 8]`, `displayLower = 3`, `displayUpper = 6`:
 *
 *   - `[0,1)`  outside available, count 0            → `--outside --empty`,   4% min-height
 *   - `[1,2)`  within available, unselected, count 0 → `--available --empty`, 4% min-height
 *   - `[3,4)`  in selection, count 5                 → `--selected`,          100% height
 *   - `[4,5)`  in selection, count 0                 → `--selected --empty`,  4% min-height
 *   - `[7,8)`  within available, unselected, count 3 → `--available`,         50% height
 *   - `[9,10)` outside available, count 2, tiny frac → `--outside`,           18% floor
 */
const HISTOGRAM: readonly HistogramBucket[] = [
	{ bucketMax: 1, bucketMin: 0, count: 0, heightFraction: 0, inSelection: false },
	{ bucketMax: 2, bucketMin: 1, count: 0, heightFraction: 0, inSelection: false },
	{ bucketMax: 4, bucketMin: 3, count: 5, heightFraction: 1, inSelection: true },
	{ bucketMax: 5, bucketMin: 4, count: 0, heightFraction: 0, inSelection: true },
	{ bucketMax: 8, bucketMin: 7, count: 3, heightFraction: 0.5, inSelection: false },
	{ bucketMax: 10, bucketMin: 9, count: 2, heightFraction: 0.05, inSelection: false },
];

/** Render the overlay with the standard fixture geometry and return the bar elements in order. */
function renderBars(): { bars: HTMLElement[]; container: HTMLElement } {
	const { container } = render(
		createElement(RangeHistogram, {
			available: { max: 8, min: 2 },
			displayLower: 3,
			displayUpper: 6,
			histogram: HISTOGRAM,
		}),
	);

	return { bars: [...container.querySelectorAll<HTMLElement>('.fe-range-histogram__bar')], container };
}

describe('RangeHistogram', () => {
	it('returns null when there are no buckets to render', () => {
		const { container } = render(
			createElement(RangeHistogram, {
				available: { max: 8, min: 2 },
				displayLower: 3,
				displayUpper: 6,
				histogram: [],
			}),
		);

		expect(container.querySelector('.fe-range-histogram')).toBeNull();
	});

	it('renders one aria-hidden bar per bucket', () => {
		const { bars, container } = renderBars();

		expect(bars).toHaveLength(6);
		expect(container.querySelector('.fe-range-histogram')?.getAttribute('aria-hidden')).toBe('true');
	});

	it('marks the in-selection tier, flagging the empty bucket within it', () => {
		const { bars } = renderBars();

		// [3,4) count 5 → selected, populated, full height.
		expect(bars[2]?.className).toBe('fe-range-histogram__bar fe-range-histogram__bar--selected');
		expect(bars[2]?.getAttribute('style')).toContain('height: 100%;');

		// [4,5) count 0 → same tier, additionally empty, 4% min-height.
		expect(bars[3]?.className).toBe(
			'fe-range-histogram__bar fe-range-histogram__bar--selected fe-range-histogram__bar--empty',
		);
		expect(bars[3]?.getAttribute('style')).toContain('height: 4%;');
	});

	it('marks the within-available-but-unselected tier', () => {
		const { bars } = renderBars();

		// [7,8) count 3 → overlaps available but sits past displayUpper, 50% height.
		expect(bars[4]?.className).toBe('fe-range-histogram__bar fe-range-histogram__bar--available');
		expect(bars[4]?.getAttribute('style')).toContain('height: 50%;');

		// [1,2) count 0 → same tier, empty. Its bucketMax exactly meets available.min, which the
		// epsilon is what admits — a strict `>` would tier this one outside.
		expect(bars[1]?.className).toBe(
			'fe-range-histogram__bar fe-range-histogram__bar--available fe-range-histogram__bar--empty',
		);
	});

	it('marks the outside-available tier, and floors a populated tiny bucket to 18%', () => {
		const { bars } = renderBars();

		// [0,1) count 0 → outside + empty, 4% min-height.
		expect(bars[0]?.className).toBe(
			'fe-range-histogram__bar fe-range-histogram__bar--outside fe-range-histogram__bar--empty',
		);
		expect(bars[0]?.getAttribute('style')).toContain('height: 4%;');

		// [9,10) count 2, heightFraction 0.05 → populated, so NOT empty, and floored to 18% rather
		// than the 5% its fraction alone would give.
		expect(bars[5]?.className).toBe('fe-range-histogram__bar fe-range-histogram__bar--outside');
		expect(bars[5]?.getAttribute('style')).toContain('height: 18%;');
	});

	it('gives the bars no hover title, as the other apps do', () => {
		const { bars } = renderBars();

		expect(bars.length).toBe(HISTOGRAM.length);
		expect(bars.filter((bar) => bar.hasAttribute('title'))).toEqual([]);
	});
});
