<script setup lang="ts">
/**
 * `<WineVintageSection>` — an `InSetRule<number>` presented as a range slider.
 *
 * @remarks
 * **The facet's rule type and its control disagree on purpose.** A vintage is a discrete year, not a
 * continuous measure, so the engine holds an explicit SET of years — but nobody wants to tick sixteen
 * checkboxes to say "2015 to 2020". So the control is a slider and the two conversions in
 * `wine-domain/vintage.ts` bridge it: `vintageYearsFromRange` expands a dragged span into the set to
 * commit, and `vintageBoundsFromSet` recovers a span from whatever set is committed.
 *
 * That round trip is lossy in one direction and deliberately so: a set with a gap in it — reachable
 * through a hand-written JSON config, never through this control — reads back as its outer bounds.
 * The slider then shows a span wider than the rule, which is the honest rendering of "this control
 * cannot express what is committed", and the next drag replaces it.
 *
 * State is the panel's usual `ref` + one-way `watch`; see `<WineChipSection>` and `<WineRangeSection>`
 * for why a read-only `computed` snaps the handle backwards on a worker-backed route.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { inSet, type InSetRule } from '@filter-enginez/core';
import {
	commitRule,
	FALLBACK_BOUNDS,
	fieldBounds,
	fieldHistogram,
	type NumericBounds,
	vintageBoundsFromSet,
	vintageYearsFromRange,
} from '@filter-enginez/examples-shared/wine-domain';
import { useEngineRefs } from '@filter-enginez/vue-signals';
import { computed, ref, watch } from 'vue';

import RangeSlider from '../../controls/RangeSlider.vue';
import { injectWineBundle } from '../wineBundle.js';

const props = defineProps<{
	engine: SignalsEngine<Wine>;
	leaveExpressionMode: () => void;
	/** Drag granularity. NOT `SLIDER_STEPS` — see the panel's `DRAG_STEPS`. */
	step: number;
}>();

const bundleContext = injectWineBundle();
const bundle = computed(() => bundleContext?.current.value ?? null);

/** The full-corpus track extent; the placeholder only when no provider is above. */
const baseline = computed(() => bundleContext?.baselines.vintage ?? FALLBACK_BOUNDS.vintage);

const ruleRef = useEngineRefs(props.engine).rule('vintage');

/** The committed year set recovered as a span, or `null` when this facet carries no rule. */
const committed = computed<NumericBounds | null>(() => {
	const rule = ruleRef.value as InSetRule<number> | undefined;

	return rule === undefined ? null : vintageBoundsFromSet(rule.config.set, baseline.value);
});

/** The painted handle span — written on drag, re-adopted on settle. */
const span = ref<NumericBounds | null>(committed.value);

watch(committed, (next) => {
	span.value = next;
});

/** The lower handle — the committed bound, or the baseline edge when this facet carries no rule. */
const valueMin = computed(() => span.value?.min ?? baseline.value.min);

/** @see valueMin */
const valueMax = computed(() => {
	const current = span.value;

	return current !== null && Number.isFinite(current.max) ? current.max : baseline.value.max;
});

/** The filtered-except-self bounds, or `undefined` to fall back to the whole baseline track. */
const available = computed(() => fieldBounds(bundle.value, 'vintage') ?? undefined);

/** One bucket per year — the per-vintage distribution, matching the field's actual discreteness. */
const histogram = computed(() => fieldHistogram(bundle.value, 'vintage', valueMin.value, valueMax.value));

/**
 * Render a year without a thousands separator — `2015`, never `2,015`.
 *
 * @param year - The slider value.
 * @returns The label.
 */
function formatYear(year: number): string {
	return String(Math.round(year));
}

/**
 * Commit a dragged span as the set of years it covers.
 *
 * @param next - The new bounds.
 */
function handleChange(next: { readonly max: number; readonly min: number }): void {
	props.leaveExpressionMode();
	// Locally first — the engine's own value lags a worker round trip.
	span.value = { max: next.max, min: next.min };
	commitRule(
		props.engine,
		'vintage',
		inSet<number>('vintage', vintageYearsFromRange(next, baseline.value)),
	);
}
</script>

<template>
	<section>
		<RangeSlider
			:available="available"
			:baseline="baseline"
			:format="formatYear"
			:histogram="histogram"
			label="Vintage"
			slider-label="Filter by vintage year"
			:step="step"
			:value-max="valueMax"
			:value-min="valueMin"
			@change="handleChange"
		/>
	</section>
</template>
