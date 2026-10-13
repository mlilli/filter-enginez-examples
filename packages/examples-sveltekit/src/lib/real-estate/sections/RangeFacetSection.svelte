<script lang="ts">
	/**
	 * `<RangeFacetSection>` — one `RangeRule` slider, deriving its handle position and owning its commit.
	 *
	 * @remarks
	 * Real estate has six of these, and written out in the panel they were six near-identical
	 * twenty-line blocks: a committed range, an `available` lookup, and a slider whose only real
	 * variation is a label and a formatter. That is the shape that pushes a component past the
	 * file-size cap, and — more to the point — the shape where the fifth copy quietly disagrees with the
	 * other four.
	 *
	 * ### It reads the bundle context directly
	 *
	 * The baseline and the filtered-except-self bounds both come from `getRealEstateBundle()` rather
	 * than from props. The panel has no opinion about either: the baseline is the corpus's own extent
	 * (published once at boot) and the available zone changes on every engine settle. Threading them
	 * down would mean the panel re-deriving twelve values per bundle so it could hand them straight to
	 * six children.
	 *
	 * ### The handle position is DERIVED from the engine's rule
	 *
	 * The panel's contract, for the reason its docblock gives: the committed `RangeRule` at this
	 * section's `ruleId` IS the handle position, so "clear all", a removed results-header chip and a `?f`
	 * URL restore all move the handles with no reset callback and no second copy of the truth. An absent
	 * rule reads as the full baseline track, which is exactly what no constraint means.
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
	import { createEngineStores } from '@filter-enginez/svelte-signals';
	import RangeSlider from '$lib/controls/RangeSlider.svelte';

	import { getRealEstateBundle } from '../realEstateBundle.js';
	import { commitRule } from '../realEstateCommit.js';

	interface Props {
		/**
		 * Accessible name for the slider group.
		 *
		 * @remarks
		 * Named `sliderLabel` rather than `ariaLabel` for two reasons. The convention: every control
		 * across the six verticals now names its label prop after WHAT IT LABELS rather than after the
		 * HTML attribute it eventually lands in. And the practical one: it is the key the shared
		 * `RANGE_FACETS` table uses, which is what lets that table be spread straight onto this
		 * component instead of six call sites restating it.
		 *
		 * `$lib/controls/RangeSlider.svelte` still calls its own prop `ariaLabel`; that control is
		 * shared with books and wine, so renaming it is a separate sweep.
		 */
		readonly sliderLabel: string;
		/** The real-estate engine. */
		readonly engine: SignalsEngine<Listing>;
		/** The `Listing` field the rule constrains, e.g. `priceUsd`. */
		readonly field: string;
		/** Value → display string. */
		readonly format: (value: number) => string;
		/** Slider label. */
		readonly label: string;
		/** Display string → value, for the editable readouts. Defaults to `parseFloat`. */
		readonly parse?: (raw: string) => number;
		/** Rule id — also the key into the shared baselines, steps and bundle fields. */
		readonly ruleId: RealEstateSliderFieldId;
	}

	const { engine, field, format, label, parse, ruleId, sliderLabel }: Props = $props();

	const bundleContext = getRealEstateBundle();
	const bundle = $derived(bundleContext?.current() ?? null);

	/**
	 * The full-corpus track extent.
	 *
	 * @remarks
	 * Falls back to a degenerate 0–1 range only when no provider is above, which happens in isolation
	 * tests and nowhere else — the view publishes the context before it renders the panel.
	 */
	const baseline = $derived(bundleContext?.baselines[ruleId] ?? { max: 1, min: 0 });

	/**
	 * This facet's own rule store, subscribed once at init.
	 *
	 * @remarks
	 * `rule(ruleId)` rather than the whole `activeRules` map: the engine memoizes a signal per rule id,
	 * so six sliders subscribe to six narrow signals and a price commit does not wake the other five.
	 * Both the engine and `ruleId` are props that never change for a mounted section, so capturing them
	 * once is intended.
	 */
	// svelte-ignore state_referenced_locally
	const ruleStore = createEngineStores(engine).rule(ruleId);

	/** The committed constraint, or `undefined` when this facet carries no rule. */
	const committedRule = $derived($ruleStore as RangeRule | undefined);

	/**
	 * The filtered-except-self bounds — the stretches of track a current result actually occupies.
	 *
	 * @remarks
	 * `undefined` means "fall back to the baseline", covering three cases a slider cannot tell apart:
	 * no bundle yet, the field was not queried, and no result occupies the field at all. In all three
	 * the whole track reads as available, which is the honest "we don't know yet" — dimming it would
	 * claim there is nothing there.
	 */
	const available = $derived(fieldBounds(bundle, ruleId) ?? undefined);

	/** The committed upper bound, or the baseline maximum when the facet carries no rule. */
	const valueMax = $derived(committedRule?.config.max ?? baseline.max);

	/** @see valueMax */
	const valueMin = $derived(committedRule?.config.min ?? baseline.min);

	/**
	 * This facet's distribution — where the data sits inside the available zone.
	 *
	 * @remarks
	 * `undefined` before the first bundle, which the slider renders as no overlay rather than as an
	 * empty band. Three of the six real-estate facets are heavily skewed (price, square feet, lot size),
	 * so these bars carry information the dimmed zone alone cannot.
	 */
	const histogram = $derived(fieldHistogram(bundle, ruleId, valueMin, valueMax));
</script>

<section>
	<RangeSlider
		ariaLabel={sliderLabel}
		{available}
		{baseline}
		{format}
		{histogram}
		{label}
		{parse}
		step={SLIDER_STEPS[ruleId]}
		{valueMax}
		{valueMin}
		onChange={(next) => {
			// Write the rule. The handles follow from it.
			commitRule(engine, ruleId, range(field, next));
		}}
	/>
</section>
