<script lang="ts">
	/**
	 * `<WineRangeSection>` — one continuous `RangeRule` slider: price, points or ABV.
	 *
	 * @remarks
	 * The Svelte counterpart to React's `<RangeFilterSection />`, and extracted for the same reason real
	 * estate has `<RangeFacetSection>`: written out in the panel these were three near-identical
	 * twenty-line blocks whose only real variation is a label, a field key and a step.
	 *
	 * **Vintage is deliberately NOT covered here.** It is an `InSetRule` of discrete years wearing a
	 * slider, so its rule construction and its inverse are a different pair of conversions entirely —
	 * see `<WineVintageSection>`, and React's identical split.
	 *
	 * ### The handle span is a WRITABLE `$derived` off this facet's rule
	 *
	 * Seeded from the committed rule, reassignable on drag, and recomputed — discarding the local
	 * value — whenever the rule changes from outside. So a `?f` restore, a clear-all and a removed
	 * results-header chip all move the handles, while a drag still paints immediately. See
	 * `<WineChipSection>` for the full argument, including why a read-only derivation snaps the handle
	 * backwards on a worker-backed route and why a `$state` plus an adopt `$effect` reintroduces the
	 * same snap by another path.
	 *
	 * ### It reads the bundle context directly
	 *
	 * The baseline, the filtered-except-self bounds and the distribution all come from
	 * `getWineBundle()`. The panel has no opinion about any of them: the baseline is the corpus's own
	 * extent (published once at boot) and the other two change on every engine settle.
	 *
	 * ### `null` means no rule, and an infinite max means no upper bound
	 *
	 * An absent rule renders as the full baseline track, which is exactly what no constraint means.
	 * A sentinel like `min === 0` would collide with a genuine selection whose lower bound is zero;
	 * `null` cannot. The rule itself is `wineRangeRule`'s, shared with every app: the price slider is
	 * open-ended, so its top thumb at the top of the track commits `max: Infinity` ("$60 and up"), and
	 * an infinite `max` reads back as the track top rather than as an infinite handle position.
	 *
	 * ### Copy
	 *
	 * The label and the thumbs' accessible-name stem are `WINE_SLIDER_COPY[ruleId]`, so the thumbs are
	 * named `Filter by price lower bound` and so on, as in every app.
	 */

	import type { RangeRule } from '@filter-enginez/core';
	import type { Wine } from '@filter-enginez/mock-data/wine';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import {
		FALLBACK_BOUNDS,
		fieldBounds,
		WINE_SLIDER_COPY,
		WINE_SLIDER_TEXT,
		wineRangeRule,
		type WineRangeSliderId,
		wineSliderHistogram,
		wineSliderScale,
	} from '@filter-enginez/examples-shared/wine-domain';
	import { createEngineStores } from '@filter-enginez/svelte-signals';
	import RangeSlider from '$lib/controls/RangeSlider.svelte';

	import { getWineBundle } from '../wineBundle.js';
	import { commitRule } from '../wineCommit.js';

	const {
		engine,
		leaveExpressionMode,
		ruleId,
		step,
	}: {
		engine: SignalsEngine<Wine>;
		leaveExpressionMode: () => void;
		/**
		 * Rule id — also the key into the shared copy, the baselines, the bundle's field metadata and
		 * `WINE_RANGE_FIELDS`, which names the `Wine` field the rule constrains.
		 */
		ruleId: WineRangeSliderId;
		/** Drag granularity. NOT `SLIDER_STEPS` — see the panel's `DRAG_STEPS`. */
		step: number;
	} = $props();

	/**
	 * This facet's own rule store, subscribed once at init.
	 *
	 * @remarks
	 * `rule(ruleId)` rather than the whole `activeRules` map, so a chip toggle elsewhere in the panel
	 * does not wake this slider. Both the engine and `ruleId` are props that never change for a mounted
	 * section, so capturing them once is intended.
	 */
	// svelte-ignore state_referenced_locally
	const ruleStore = createEngineStores(engine).rule(ruleId);

	/** The handle span — a WRITABLE `$derived`; `null` when this facet carries no rule. */
	let value = $derived(($ruleStore as RangeRule | undefined)?.config ?? null);

	const bundleContext = getWineBundle();
	const bundle = $derived(bundleContext?.current() ?? null);

	/**
	 * The full-corpus track extent.
	 *
	 * @remarks
	 * Falls back to the pre-boot placeholder only when no provider is above, which happens in isolation
	 * tests and nowhere else — `<WineView>` publishes the context before it renders the panel.
	 */
	const baseline = $derived(bundleContext?.baselines[ruleId] ?? FALLBACK_BOUNDS[ruleId]);

	/** The lower handle — the committed bound, or the baseline edge when this facet carries no rule. */
	const valueMin = $derived(value?.min ?? baseline.min);

	/** @see valueMin — and the docblock, for the infinite-maximum case. */
	const valueMax = $derived(value !== null && Number.isFinite(value.max) ? value.max : baseline.max);

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

	/**
	 * How this field's values lay out on the track — log for price, linear for points and ABV.
	 *
	 * @remarks
	 * Read from the declaration all six apps share (`wineSliderScale`), so a price of $25 sits at the
	 * same point of the track here as on every other app's wine page.
	 */
	const scale = $derived(wineSliderScale(ruleId, baseline));

	/**
	 * This field's distribution — where the data sits inside the available zone.
	 *
	 * @remarks
	 * `wineSliderHistogram` returns the bars already sliced for the field's scale. The bars are
	 * equal-width slices of the track, so a log track needs log-spaced value buckets under it; the
	 * engine's own equal-width buckets would pile every everyday bottle into the first bar.
	 */
	const histogram = $derived(wineSliderHistogram(bundle, ruleId, baseline, valueMin, valueMax));

	/**
	 * How the readouts show this field's values and read typed ones back (`$1,250`, `13.5%`), from
	 * the table every app's wine panel shares — so a field showing `$1,250` also accepts `$1,250`.
	 */
	const sliderText = $derived(WINE_SLIDER_TEXT[ruleId]);

	/** The label and the thumbs' accessible-name stem. */
	const copy = $derived(WINE_SLIDER_COPY[ruleId]);
</script>

<section>
	<RangeSlider
		ariaLabel={copy.sliderLabel}
		{available}
		{baseline}
		format={sliderText.format}
		{histogram}
		label={copy.label}
		parse={sliderText.parse}
		{scale}
		{step}
		{valueMax}
		{valueMin}
		onChange={(next) => {
			leaveExpressionMode();
			// Write the handle position locally first: on the worker tier the engine's own value lags a
			// full round trip, so waiting for the recompute would snap the handle backwards mid-drag.
			value = next;
			commitRule(engine, ruleId, wineRangeRule(ruleId, next, baseline));
		}}
	/>
</section>
