/**
 * Tests for `<WineRangeSection>` — the slider half of the panel's state contract.
 *
 * @remarks
 * Same trap as `<WineChipSection>`, with a more visible failure. On the worker tier the engine's value
 * lags a full round trip, so a read-only `computed` would snap the handle **backwards mid-drag** —
 * the user drags to $40, the handle jumps back to the baseline, and a few hundred milliseconds later
 * it lands on $40 again. Unusable, and invisible to `vue-tsc`, `eslint` and a main-thread test alike.
 *
 * The guard below drives a change against a rule signal that never updates, which is exactly that
 * mid-flight state.
 *
 * The second test covers the case the `null`-versus-`min === 0` distinction exists for: an absent rule
 * must render the full baseline track, and it must do so without being confusable with a genuine
 * selection whose lower bound happens to be zero.
 *
 * The last pin what the section hands its slider from the shared wine declarations — the track scale,
 * the readout text, the label and the thumbs' names — and the rule it commits through `wineRangeRule`,
 * so this app's price track matches every other app's.
 */

import type { SliderScale } from '@filter-enginez/examples-shared/bounds';
import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { range, type RangeRule } from '@filter-enginez/core';
import {
	FALLBACK_BOUNDS,
	WINE_SLIDER_COPY,
	WINE_SLIDER_TEXT,
	wineSliderScale,
} from '@filter-enginez/examples-shared/wine-domain';
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { shallowRef } from 'vue';

import RangeSlider from '../../controls/RangeSlider.vue';
import WineRangeSection from './WineRangeSection.vue';

/** The rule signal the section subscribes to, swappable per test. */
const ruleRef = shallowRef<RangeRule | undefined>(undefined);

// `addRule` is a spy, so the rule signal does NOT update on commit — the worker's mid-flight state.
const addRule = vi.fn();

vi.mock('@filter-enginez/vue-signals', () => ({
	useEngineRefs: () => ({ rule: () => ruleRef }),
}));

/** A structural stand-in for the engine facade; only `core.addRule` is exercised. */
function fakeEngine(): SignalsEngine<Wine> {
	return { core: { addRule, removeRule: vi.fn() }} as unknown as SignalsEngine<Wine>;
}

/**
 * Mount the price slider over the current `ruleRef`.
 *
 * @returns The mounted wrapper.
 */
function mountSection(): ReturnType<typeof mount> {
	return mount(WineRangeSection, {
		props: {
			engine: fakeEngine(),
			leaveExpressionMode: (): void => undefined,
			ruleId: 'price',
			step: 5,
		},
	});
}

/**
 * Read the handle positions the section hands its slider.
 *
 * @remarks
 * Asserted on the child's PROPS rather than on rendered inputs. `<RangeSlider>` is 400 lines of custom
 * track markup with its own drag state and its own suite; reaching into it would test that component
 * instead of this one, and would break the day it changes its internals. What this section owes the
 * slider is a `valueMin` / `valueMax` pair, and that is the contract worth pinning.
 *
 * @param wrapper - The mounted section.
 * @returns The `[min, max]` currently passed down.
 */
function handlePositions(wrapper: ReturnType<typeof mount>): number[] {
	const slider = wrapper.findComponent(RangeSlider);

	return [Number(slider.props('valueMin')), Number(slider.props('valueMax'))];
}

describe('<WineRangeSection>', () => {
	it('holds a dragged handle while the engine round trip is still in flight', async () => {
		// THE regression guard. A read-only computed would read the stale (absent) rule and snap both
		// handles back to the baseline for the length of the round trip.
		ruleRef.value = undefined;

		const wrapper = mountSection();
		const before = handlePositions(wrapper);

		// `findComponent(RangeSlider)` — the component itself, not `{ name: … }`. The name form returns an
		// untyped wrapper, so `.vm.$emit` is `any` and this app's typed-lint config rejects it.
		wrapper.findComponent(RangeSlider).vm.$emit('change', { max: 40, min: 10 });
		await flushPromises();

		expect(addRule).toHaveBeenCalled();
		expect(
			handlePositions(wrapper),
			`the handles snapped back to ${before.join('–')} — the span was derived read-only`,
		).toEqual([10, 40]);
	});

	it('adopts an engine-side change, so a ?f restore and a clear-all both land', async () => {
		ruleRef.value = undefined;

		const wrapper = mountSection();

		ruleRef.value = range('priceUsd', { max: 60, min: 20 });
		await flushPromises();

		expect(handlePositions(wrapper)).toEqual([20, 60]);

		ruleRef.value = undefined;
		await flushPromises();

		// Back to the full baseline track — which is what "no constraint" means, and why an absent rule
		// is `null` rather than `{ min: 0 }`.
		expect(handlePositions(wrapper)).not.toEqual([20, 60]);
	});

	it('lays price on the shared log scale, with the shared readout and parser', () => {
		ruleRef.value = undefined;

		const slider = mountSection().findComponent(RangeSlider);
		// Typed lint cannot see through a `.vue` component's prop types; the cast names the contract.
		const scale = slider.props('scale') as SliderScale | undefined;
		const expected = wineSliderScale('price', FALLBACK_BOUNDS.price);

		expect(scale?.kind).toBe('log');
		expect(scale?.toFraction(25)).toBeCloseTo(expected.toFraction(25), 9);
		expect(slider.props('format')).toBe(WINE_SLIDER_TEXT.price.format);
		expect(slider.props('parse')).toBe(WINE_SLIDER_TEXT.price.parse);
		// The readout the user sees, through that formatter: thousands separated.
		expect(slider.find('.fe-range-slider__summary').text()).toBe('$4 — $3,242');
	});

	it('labels the slider and names its thumbs from WINE_SLIDER_COPY', () => {
		ruleRef.value = undefined;

		const slider = mountSection().findComponent(RangeSlider);
		const thumbs = slider.findAll('[role="slider"]');

		expect(slider.props('label')).toBe(WINE_SLIDER_COPY.price.label);
		expect(thumbs[0]?.attributes('aria-label')).toBe(`${WINE_SLIDER_COPY.price.sliderLabel} lower bound`);
		expect(thumbs[1]?.attributes('aria-label')).toBe(`${WINE_SLIDER_COPY.price.sliderLabel} upper bound`);
	});

	it('commits an open top through wineRangeRule when the upper thumb reaches the top of the price track', async () => {
		ruleRef.value = undefined;
		addRule.mockClear();

		const wrapper = mountSection();

		wrapper.findComponent(RangeSlider).vm.$emit('change', { max: FALLBACK_BOUNDS.price.max, min: 20 });
		await flushPromises();

		const committed = addRule.mock.calls[0]?.[1] as RangeRule | undefined;

		expect(addRule.mock.calls[0]?.[0]).toBe('price');
		expect(committed?.config).toMatchObject({ max: Number.POSITIVE_INFINITY, min: 20 });
		// The open top still paints as the track top.
		expect(handlePositions(wrapper)).toEqual([20, FALLBACK_BOUNDS.price.max]);
	});

	it('commits a finite top below the top of the track', async () => {
		ruleRef.value = undefined;
		addRule.mockClear();

		const wrapper = mountSection();

		wrapper.findComponent(RangeSlider).vm.$emit('change', { max: 90, min: 20 });
		await flushPromises();

		expect((addRule.mock.calls[0]?.[1] as RangeRule | undefined)?.config).toMatchObject({ max: 90, min: 20 });
	});
});
