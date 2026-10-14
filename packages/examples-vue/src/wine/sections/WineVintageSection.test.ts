/**
 * Tests for `<WineVintageSection>` — what the section hands its slider.
 *
 * @remarks
 * The section's state contract is the same `ref` + one-way `watch` that `<WineRangeSection>`'s suite
 * guards. What is particular to vintage is the track and the text: the track is log-scaled toward the
 * youngest vintage, and the non-vintage year reads as `NV`, never as a 2025 harvest. Both come from the
 * shared wine declarations, so these tests pin that the section uses them rather than a local copy.
 */

import type { SliderScale } from '@filter-enginez/examples-shared/bounds';
import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import {
	FALLBACK_BOUNDS,
	NON_VINTAGE_YEAR,
	WINE_SLIDER_TEXT,
	wineSliderScale,
} from '@filter-enginez/examples-shared/wine-domain';
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';

import RangeSlider from '../../controls/RangeSlider.vue';
import WineVintageSection from './WineVintageSection.vue';

// No vintage rule is committed in any test here; the section reads the full baseline track.
vi.mock('@filter-enginez/vue-signals', () => ({
	useEngineRefs: () => ({ rule: () => shallowRef(undefined) }),
}));

/** A structural stand-in for the engine facade; nothing here commits. */
function fakeEngine(): SignalsEngine<Wine> {
	return { core: { addRule: vi.fn(), removeRule: vi.fn() }} as unknown as SignalsEngine<Wine>;
}

/**
 * Mount the section with no bundle provider, so its baseline is the shared placeholder.
 *
 * @returns The slider the section rendered.
 */
function mountSlider() {
	return mount(WineVintageSection, {
		props: { engine: fakeEngine(), leaveExpressionMode: (): void => undefined, step: 1 },
	}).findComponent(RangeSlider);
}

describe('<WineVintageSection>', () => {
	it('lays the years on the shared log scale, anchored at the youngest vintage', () => {
		// Typed lint cannot see through a `.vue` component's prop types; the cast names the contract.
		const scale = mountSlider().props('scale') as SliderScale | undefined;
		const expected = wineSliderScale('vintage', FALLBACK_BOUNDS.vintage);

		expect(scale?.kind).toBe('log');
		expect(scale?.toFraction(2015)).toBeCloseTo(expected.toFraction(2015), 9);
		// Anchored at the maximum: the last decade takes far more than its linear share of the track.
		expect(scale?.toFraction(2015)).toBeLessThan(0.75);
	});

	it('shows the non-vintage year as NV and reads a typed NV back', () => {
		const slider = mountSlider();

		expect(slider.props('format')).toBe(WINE_SLIDER_TEXT.vintage.format);
		expect(slider.props('parse')).toBe(WINE_SLIDER_TEXT.vintage.parse);
		// The baseline runs up to the non-vintage year, so the untouched upper bound is NV.
		expect(FALLBACK_BOUNDS.vintage.max).toBe(NON_VINTAGE_YEAR);
		expect(slider.find('.fe-range-slider__summary').text()).toBe('1911 — NV');
		expect(slider.findAll('[role="slider"]')[1]?.attributes('aria-valuetext')).toBe('NV');
	});
});
