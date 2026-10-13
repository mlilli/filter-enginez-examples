<script setup lang="ts">
/**
 * `<WineRangeSection>` — one `RangeRule` slider with predictive bounds and a histogram.
 *
 * @remarks
 * Price, points and ABV are the same facet three times over, differing only in field, label, format
 * and drag step.
 *
 * **The handle span is a `ref` + one-way `watch`, not a `computed`** — the pattern
 * `<WineChipSection>` establishes and documents at length. The slider makes the reason especially
 * visible: on the worker tier the engine's value lags a full round trip, so a read-only derivation
 * would snap the handle backwards mid-drag.
 *
 * An absent rule renders as the full baseline track, which is exactly what no constraint means. That
 * is spelled `null` rather than `min === 0`, which would collide with a genuine selection whose lower
 * bound is zero. An infinite `max` — which only reaches this route through a `?f` link from React's
 * open-ended price slider — reads back as the baseline maximum rather than as an infinite handle.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { range, type RangeRule } from '@filter-enginez/core';
import {
	commitRule,
	FALLBACK_BOUNDS,
	fieldBounds,
	fieldHistogram,
} from '@filter-enginez/examples-shared/wine-domain';
import { useEngineRefs } from '@filter-enginez/vue-signals';
import { computed, ref, watch } from 'vue';

import RangeSlider from '../../controls/RangeSlider.vue';
import { injectWineBundle } from '../wineBundle.js';

const props = defineProps<{
	engine: SignalsEngine<Wine>;
	/** The `Wine` property the `RangeRule` constrains — `priceUsd` for the `price` rule. */
	field: string;
	/** Value → display string. Omitted for points, which reads as a bare number. */
	format?: (value: number) => string;
	label: string;
	leaveExpressionMode: () => void;
	/** Rule id — also the key into the shared baselines and the bundle's field metadata. */
	ruleId: 'abv' | 'points' | 'price';
	/** Accessible name for the slider group. Not `ariaLabel` — see `<ResultGrid>`'s `listLabel`. */
	sliderLabel: string;
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

/** This field's distribution — where the data sits inside the available zone. */
const histogram = computed(() => fieldHistogram(bundle.value, props.ruleId, valueMin.value, valueMax.value));

/**
 * Commit a dragged span, painting locally first.
 *
 * @param next - The new bounds.
 */
function handleChange(next: { readonly max: number; readonly min: number }): void {
	props.leaveExpressionMode();
	// Locally first: on the worker tier the engine's own value lags a full round trip, so waiting for
	// the recompute would snap the handle backwards mid-drag.
	span.value = next;
	commitRule(props.engine, props.ruleId, range(props.field, next));
}
</script>

<template>
	<section>
		<RangeSlider
			:available="available"
			:baseline="baseline"
			:format="format"
			:histogram="histogram"
			:label="label"
			:slider-label="sliderLabel"
			:step="step"
			:value-max="valueMax"
			:value-min="valueMin"
			@change="handleChange"
		/>
	</section>
</template>
