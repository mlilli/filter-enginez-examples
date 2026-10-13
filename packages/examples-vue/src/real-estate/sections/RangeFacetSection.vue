<script setup lang="ts">
import type { NumericBounds } from '@filter-enginez/examples-shared/bounds';
/**
 * `<RangeFacetSection>` — one `RangeRule` slider, deriving its handle position and owning its commit.
 *
 * @remarks
 * Real estate has six of these, and written out in the panel they would be six near-identical blocks: a
 * committed range, an `available` lookup, and a slider whose only real variation is a label and a
 * formatter. That is the shape that pushes a component past the 500-line file-size cap, and — more to
 * the point — the shape where the fifth copy quietly disagrees with the other four.
 *
 * ### It reads the bundle context directly
 *
 * The baseline and the filtered-except-self bounds both come from `injectRealEstateBundle()` rather
 * than from props. The panel has no opinion about either: the baseline is the corpus's own extent
 * (published once at boot) and the available zone changes on every engine settle. Threading them down
 * would mean the panel re-deriving twelve values per bundle so it could hand them straight to six
 * children.
 *
 * ### The handle position is DERIVED from the engine's rule
 *
 * The panel's contract, for the reason its docblock gives: the committed `RangeRule` at this section's
 * `ruleId` IS the handle position, so "clear all", a removed results-header chip and a `?f` URL restore
 * all move the handles with no reset callback and no second copy of the truth. An absent rule reads as
 * the full baseline track, which is exactly what no constraint means.
 */
import type { Listing } from '@filter-enginez/mock-data/real-estate';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { range, type RangeRule } from '@filter-enginez/core';
import {
	fieldBounds,
	fieldHistogram,
	type RealEstateSliderFieldId,
	SLIDER_STEPS,
} from '@filter-enginez/examples-shared/real-estate-domain';
import { useEngineRefs } from '@filter-enginez/vue-signals';
import { computed } from 'vue';

import RangeSlider from '../../controls/RangeSlider.vue';
import { injectRealEstateBundle } from '../realEstateBundle.js';
import { commitRule } from '../realEstateCommit.js';

const props = defineProps<{
	/** Accessible name for the slider group. Not `ariaLabel` — see `<ResultGrid>`'s `listLabel`. */
	sliderLabel: string;
	/** The real-estate engine. */
	engine: SignalsEngine<Listing>;
	/** The `Listing` field the rule constrains, e.g. `priceUsd`. */
	field: string;
	/** Value → display string. */
	format: (value: number) => string;
	/** Slider label. */
	label: string;
	/** Display string → value, for the editable readouts. Defaults to `parseFloat`. */
	parse?: (raw: string) => number;
	/** Rule id — also the key into the shared baselines, steps and bundle fields. */
	ruleId: RealEstateSliderFieldId;
}>();

const bundleContext = injectRealEstateBundle();
const bundle = computed(() => bundleContext?.current.value ?? null);

/**
 * The full-corpus track extent.
 *
 * @remarks
 * Falls back to a degenerate 0–1 range only when no provider is above, which happens in isolation
 * tests and nowhere else — the view publishes the context before it renders the panel.
 */
const baseline = computed<NumericBounds>(() => bundleContext?.baselines[props.ruleId] ?? { max: 1, min: 0 });

/**
 * This facet's own rule ref, subscribed once during setup.
 *
 * @remarks
 * `rule(ruleId)` rather than the whole `activeRules` map: the engine memoizes a signal per rule id, so
 * six sliders subscribe to six narrow signals and a price commit does not wake the other five. It must
 * be called in `setup()` — that is where the subscription is torn down from — so it cannot be moved
 * inside the `computed` below, even though `ruleId` never changes for a mounted section.
 */
const ruleRef = useEngineRefs(props.engine).rule(props.ruleId);

/** The committed constraint, or `undefined` when this facet carries no rule. */
const committedRule = computed(() => ruleRef.value as RangeRule | undefined);

/**
 * The filtered-except-self bounds — the stretches of track a current result actually occupies.
 *
 * @remarks
 * `undefined` means "fall back to the baseline", covering three cases a slider cannot tell apart: no
 * bundle yet, the field was not queried, and no result occupies the field at all. In all three the
 * whole track reads as available, which is the honest "we don't know yet" — dimming it would claim
 * there is nothing there.
 */
const available = computed<NumericBounds | undefined>(() => fieldBounds(bundle.value, props.ruleId) ?? undefined);

/** The committed upper bound, or the baseline maximum when the facet carries no rule. */
const valueMax = computed(() => committedRule.value?.config.max ?? baseline.value.max);

/** @see valueMax */
const valueMin = computed(() => committedRule.value?.config.min ?? baseline.value.min);

/**
 * This facet's distribution — where the data sits inside the available zone.
 *
 * @remarks
 * `undefined` before the first bundle, which the slider renders as no overlay rather than as an empty
 * band. Three of the six real-estate facets are heavily skewed (price, square feet, lot size), so
 * these bars carry information the dimmed zone alone cannot.
 */
const histogram = computed(() => fieldHistogram(bundle.value, props.ruleId, valueMin.value, valueMax.value));

/**
 * Write the rule. The handles follow from it.
 *
 * @param next - The slider's new min/max pair.
 */
function handleChange(next: { readonly max: number; readonly min: number }): void {
	commitRule(props.engine, props.ruleId, range(props.field, next));
}
</script>

<template>
	<section>
		<RangeSlider
			:slider-label="sliderLabel"
			:available="available"
			:baseline="baseline"
			:format="format"
			:histogram="histogram"
			:label="label"
			:parse="parse"
			:step="SLIDER_STEPS[ruleId]"
			:value-max="valueMax"
			:value-min="valueMin"
			@change="handleChange"
		/>
	</section>
</template>
