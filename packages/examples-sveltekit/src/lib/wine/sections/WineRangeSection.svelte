<script lang="ts">
	/**
	 * `<WineRangeSection>` — one continuous `RangeRule` slider: price, points or ABV.
	 *
	 * @remarks
	 * The Svelte counterpart to React's `<RangeFilterSection />`, and extracted for the same reason real
	 * estate has `<RangeFacetSection>`: written out in the panel these were three near-identical
	 * twenty-line blocks whose only real variation is a label, a field key and a formatter.
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
	 * `null` cannot. An infinite `max` — which only reaches this route through a `?f` link from
	 * React's open-ended price slider — reads back as the baseline maximum rather than as an infinite
	 * handle position.
	 */

	import type { Wine } from '@filter-enginez/mock-data/wine';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { range, type RangeRule } from '@filter-enginez/core';
	import { FALLBACK_BOUNDS, fieldBounds, fieldHistogram } from '@filter-enginez/examples-shared/wine-domain';
	import { createEngineStores } from '@filter-enginez/svelte-signals';
	import RangeSlider from '$lib/controls/RangeSlider.svelte';

	import { getWineBundle } from '../wineBundle.js';
	import { commitRule } from '../wineCommit.js';

	const {
		engine,
		field,
		format,
		label,
		leaveExpressionMode,
		ruleId,
		step,
	}: {
		engine: SignalsEngine<Wine>;
		/** The `Wine` property the `RangeRule` constrains — `priceUsd` for the `price` rule. */
		field: string;
		/** Value → display string. Omitted for points, which reads as a bare number. */
		format?: (value: number) => string;
		label: string;
		leaveExpressionMode: () => void;
		/** Rule id — also the key into the shared baselines and the bundle's field metadata. */
		ruleId: 'abv' | 'points' | 'price';
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

	/** This field's distribution — where the data sits inside the available zone. */
	const histogram = $derived(fieldHistogram(bundle, ruleId, valueMin, valueMax));
</script>

<section>
	<RangeSlider
		{available}
		{baseline}
		{format}
		{histogram}
		{label}
		{step}
		{valueMax}
		{valueMin}
		onChange={(next) => {
			leaveExpressionMode();
			// Write the handle position locally first: on the worker tier the engine's own value lags a
			// full round trip, so waiting for the recompute would snap the handle backwards mid-drag.
			value = next;
			commitRule(engine, ruleId, range(field, next));
		}}
	/>
</section>
