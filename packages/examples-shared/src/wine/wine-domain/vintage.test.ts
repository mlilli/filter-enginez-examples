/**
 * Tests for the vintage range ↔ year-set conversions.
 *
 * @remarks
 * These two functions are the whole reason a facet declared as an `InSetRule` can be driven by a range
 * slider, and they are shared by every wine panel and the rule summaries. A vertical committing a
 * `RangeRule` for the same rule id instead would use a different rule type for the same facet, against
 * the dataset's own declared config, which would make a `?f` link non-portable between wine routes.
 *
 * **The round trip is the property worth protecting.** A slider commits a span, the engine stores a
 * set, and the slider has to read its handles back out of that set. If the two functions disagree the
 * handles land somewhere the user did not put them — and only after a reload, which is the hardest
 * moment to notice.
 */

import { describe, expect, it } from 'vitest';

import { formatVintageRange, vintageBoundsFromSet, vintageYearsFromRange } from './vintage.js';

const BASELINE = { max: 2024, min: 2008 };

describe('vintageYearsFromRange', () => {
	it('materializes a span into every year it covers, inclusive', () => {
		expect(vintageYearsFromRange({ max: 2018, min: 2015 }, BASELINE)).toEqual([2015, 2016, 2017, 2018]);
	});

	it('commits an EMPTY set for a full-baseline span', () => {
		// The permissive state. An empty `InSetRule` matches everything, so "not narrowed" and "all
		// years selected" are the same rule — which is what keeps the facet out of the active-filter
		// chips. Enumerating all seventeen years would filter identically and read as a live constraint.
		expect(vintageYearsFromRange(BASELINE, BASELINE)).toEqual([]);
	});

	it('commits an empty set for a span that OVERSHOOTS the baseline', () => {
		// A handle clamped at the edge can report slightly past it; that is still "no constraint".
		expect(vintageYearsFromRange({ max: 2030, min: 2000 }, BASELINE)).toEqual([]);
	});

	it.each([
		['the lower end is raised', { max: 2024, min: 2009 }],
		['the upper end is lowered', { max: 2023, min: 2008 }],
	])('commits a real set when %s', (_label, span) => {
		// Both edges need the check. An implementation testing only one treats a one-sided narrowing as
		// no constraint at all, so the slider moves and nothing filters.
		expect(vintageYearsFromRange(span, BASELINE).length).toBeGreaterThan(0);
	});

	it('widens a fractional span outward rather than dropping the years it touches', () => {
		// Floor/ceil, not round: a sub-pixel handle position sits INSIDE a year, and rounding away from
		// it would silently exclude a year the user can see selected on the track.
		expect(vintageYearsFromRange({ max: 2017.2, min: 2014.8 }, BASELINE)).toEqual([2014, 2015, 2016, 2017, 2018]);
	});
});

describe('vintageBoundsFromSet', () => {
	it('recovers the span from a committed set', () => {
		expect(vintageBoundsFromSet([2015, 2016, 2017, 2018], BASELINE)).toEqual({ max: 2018, min: 2015 });
	});

	it('reads an empty set as the full baseline', () => {
		// The inverse of the permissive commit above: the handles go back where they started.
		expect(vintageBoundsFromSet([], BASELINE)).toEqual(BASELINE);
	});

	it('is order-independent', () => {
		// Nothing guarantees the order of a set that has been through JSON and the rule registry.
		expect(vintageBoundsFromSet([2018, 2015, 2017], BASELINE)).toEqual({ max: 2018, min: 2015 });
	});

	it('round-trips every span the slider can produce', () => {
		// The property the two functions exist to satisfy together. Asserted over the whole baseline
		// rather than one example, because an off-by-one at an edge is exactly what survives a spot check.
		for (let min = BASELINE.min; min <= BASELINE.max; min++) {
			for (let max = min; max <= BASELINE.max; max++) {
				const years = vintageYearsFromRange({ max, min }, BASELINE);
				const expected = min === BASELINE.min && max === BASELINE.max ? BASELINE : { max, min };

				expect(vintageBoundsFromSet(years, BASELINE)).toEqual(expected);
			}
		}
	});

	it('survives a set far larger than the argument-spread limit', () => {
		// `Math.min(...set)` throws `RangeError: Maximum call stack size exceeded` somewhere around
		// 100k arguments. A vintage set is one entry per year so it will never get there — but this
		// function is the generic inverse, and the loop costs nothing.
		const huge = Array.from({ length: 200_000 }, (_unused, index) => index);

		expect(vintageBoundsFromSet(huge, BASELINE)).toEqual({ max: 199_999, min: 0 });
	});
});

describe('formatVintageRange', () => {
	it('renders a span as a range', () => {
		// The chip the generic set formatter got wrong: it abbreviates at three or more, so this read
		// `2015 (+7 more)` — a list, for a control that only offers spans.
		expect(formatVintageRange([2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022])).toBe('2015 – 2022');
	});

	it('renders a single year alone, with no dash', () => {
		expect(formatVintageRange([2019])).toBe('2019');
	});

	it('renders a two-year span as a range, not as a pair', () => {
		// The boundary the generic formatter treats specially (it lists two values in full), so it is
		// the case most likely to diverge if this ever delegates back to it.
		expect(formatVintageRange([2019, 2020])).toBe('2019 – 2020');
	});
});
