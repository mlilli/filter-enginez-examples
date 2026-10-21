<script setup lang="ts">
/**
 * `<WineRangeSection>` — one `RangeRule` slider with predictive bounds and a histogram.
 *
 * @remarks
 * Price, points and ABV are the same facet three times over, differing only in drag step. Everything
 * else is keyed by `ruleId` from the declarations all six apps share in `wine-domain`: the label and
 * the thumbs' accessible names (`WINE_SLIDER_COPY`), the readout format and typed-text parser
 * (`WINE_SLIDER_TEXT`), the track scale (`wineSliderScale` — log for price, linear for points and
 * ABV), the bars (`wineSliderHistogram`, already sliced for that scale) and the committed rule
 * (`wineRangeRule`). So `$25` sits at the same point of the price track here as on every other app's
 * wine page, reads the same, and commits the same rule.
 *
 * **The handle span is a `ref` + one-way `watch`, not a `computed`** — the pattern
 * `<WineChipSection>` establishes and documents at length. The slider makes the reason especially
 * visible: on the worker tier the engine's value lags a full round trip, so a read-only derivation
 * would snap the handle backwards mid-drag.
 *
 * An absent rule renders as the full baseline track, which is exactly what no constraint means. That
 * is spelled `null` rather than `min === 0`, which would collide with a genuine selection whose lower
 * bound is zero.
 *
 * Price is open-ended at the top (`WINE_OPEN_ENDED_SLIDERS`): its upper thumb at the top of the track
 * commits `max: Infinity`, "this price and up", and an infinite `max` reads back as the track top.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { type RangeRule } from '@filter-enginez/core';
import {
	commitRule,
	FALLBACK_BOUNDS,
	fieldBounds,
	WINE_SLIDER_COPY,
	WINE_SLIDER_TEXT,
	wineRangeRule,
	type WineRangeSliderId,
	wineSliderHistogram,
	wineSliderScale,
} from '@filter-enginez/examples-shared/wine-domain';
import { useEngineRefs } from '@filter-enginez/vue-signals';
import { computed, ref, watch } from 'vue';

import RangeSlider from '../../controls/RangeSlider.vue';
import { injectWineBundle } from '../wineBundle.js';

const props = defineProps<{
	engine: SignalsEngine<Wine>;
	leaveExpressionMode: () => void;
	/** Rule id — the key into the shared copy, baselines, field and the bundle's field metadata. */
	ruleId: WineRangeSliderId;
	/** Drag granularity. NOT `SLIDER_STEPS` — see the panel's `DRAG_STEPS`. */
	step: number;
}>();

// `rule(ruleId)` rather than the whole `activeRules` map, so a chip toggle elsewhere in the panel does
// not wake this slider. Must be called in `setup()` — that is where its teardown registers.
const ruleRef = useEngineRefs(props.engine).rule(props.ruleId);

/** What the engine currently holds for this facet, or `null` when it carries no rule. */
const committed = computed<RangeRule['config'] | null>(
	() => (ruleRef.value as RangeRule | undefined)?.config ?? null,
);

/** The painted handle span — written on drag, re-adopted on settle. */
const span = ref<RangeRule['config'] | null>(committed.value);

watch(committed, (next) => {
	span.value = next;
});

const bundleContext = injectWineBundle();
const bundle = computed(() => bundleContext?.current.value ?? null);

/**
 * The full-corpus track extent.
 *
 * @remarks
 * Falls back to the pre-boot placeholder only when no provider is above, which happens in isolation
 * tests and nowhere else — `<WineView>` publishes the context before it renders the panel.
 */
const baseline = computed(() => bundleContext?.baselines[props.ruleId] ?? FALLBACK_BOUNDS[props.ruleId]);

/** The lower handle — the committed bound, or the baseline edge when this facet carries no rule. */
const valueMin = computed(() => span.value?.min ?? baseline.value.min);

/** @see valueMin — and the docblock, for the infinite-maximum case. */
const valueMax = computed(() => {
	const current = span.value;

	return current !== null && Number.isFinite(current.max) ? current.max : baseline.value.max;
});

/**
 * The filtered-except-self bounds — the stretches of track a current result actually occupies.
 *
 * @remarks
 * `undefined` means "fall back to the baseline", covering three cases a slider cannot tell apart: no
 * bundle yet, the field was not queried, and no result occupies the field at all. In all three the
 * whole track reads as available, which is the honest "we don't know yet" — dimming it would claim
 * there is nothing there.
 */
const available = computed(() => fieldBounds(bundle.value, props.ruleId) ?? undefined);

/** How this field's values lay out on the track, over the same baseline the slider spans. */
const scale = computed(() => wineSliderScale(props.ruleId, baseline.value));

/**
 * This field's distribution — where the data sits inside the available zone.
 *
 * @remarks
 * `wineSliderHistogram` returns the bars already sliced for the field's scale. The bars are equal-width
 * slices of the track, so a log track needs log-spaced value buckets under it; the engine's own
 * equal-width buckets would pile every everyday bottle into the first bar.
 */
const histogram = computed(() =>
	wineSliderHistogram(bundle.value, props.ruleId, baseline.value, valueMin.value, valueMax.value),
);

/** The shared readout formatter and typed-text parser for this field (`$1,250`, `13.5%`, `92`). */
const sliderText = computed(() => WINE_SLIDER_TEXT[props.ruleId]);

/** The shared label and thumb-name stem (`Price (USD)`, `Filter by price`). */
const sliderCopy = computed(() => WINE_SLIDER_COPY[props.ruleId]);

/**
 * Commit a dragged span, painting locally first.
 *
 * @param next - The new bounds.
 */
function handleChange(next: { readonly max: number; readonly min: number }): void {
	props.leaveExpressionMode();
	// Locally first: on the worker tier the engine's own value lags a full round trip, so waiting for
	// the recompute would snap the handle backwards mid-drag.
	// `wineRangeRule` always builds a `RangeRule`; the span takes its config, so an open top paints
	// as the track top exactly as the committed rule will read back.
	const rule = wineRangeRule(props.ruleId, next, baseline.value) as RangeRule;

	span.value = rule.config;
	commitRule(props.engine, props.ruleId, rule);
}
</script>

<template>
	<section>
		<RangeSlider
			:available="available"
			:baseline="baseline"
			:format="sliderText.format"
			:histogram="histogram"
			:label="sliderCopy.label"
			:parse="sliderText.parse"
			:scale="scale"
			:slider-label="sliderCopy.sliderLabel"
			:step="step"
			:value-max="valueMax"
			:value-min="valueMin"
			@change="handleChange"
		/>
	</section>
</template>
