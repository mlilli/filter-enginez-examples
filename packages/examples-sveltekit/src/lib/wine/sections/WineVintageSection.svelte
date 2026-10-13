<script lang="ts">
	/**
	 * `<WineVintageSection>` — the discrete-year vintage facet, rendered as a range slider.
	 *
	 * @remarks
	 * `mock-data`'s wine config declares vintage an **`InSetRule<number>`**, because a vintage is a
	 * discrete year and the engine should see it as one. Nobody picks years individually though — people
	 * think "wines from 2018 to 2022" — so every vertical renders a dual-handle slider and materializes
	 * the span into the set on commit. That is the whole reason this cannot share
	 * `<WineRangeSection>`, and it is the same split React draws between `<VintageFilterSection />` and
	 * `<RangeFilterSection />`.
	 *
	 * Both halves of the conversion live in `wine-domain/vintage`, so this section, React's, and the
	 * rule summaries all read one definition of what a vintage selection IS. A full-baseline span
	 * commits an EMPTY set rather than every year: an empty `InSetRule` is the engine's permissive
	 * state, so "not narrowed" and "all of them selected" collapse to the same rule and the facet
	 * correctly drops out of the active-filter chips.
	 *
	 * ### A writable `$derived`, over the set → span conversion
	 *
	 * Same contract as `<WineRangeSection>` — see it, and `<WineChipSection>` behind it, for why the
	 * derivation has to be writable on a worker-backed route. The only difference is what it derives
	 * THROUGH: `vintageBoundsFromSet` turns the committed year set back into the span the handles
	 * occupy, and an empty set (the permissive state) reads back as the full baseline — the same span
	 * that produced it.
	 *
	 * Everything else — the bundle context reads, `null` meaning "no rule" — matches
	 * `<WineRangeSection>`.
	 */

	import type { Wine } from '@filter-enginez/mock-data/wine';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { inSet, type InSetRule } from '@filter-enginez/core';
	import {
		FALLBACK_BOUNDS,
		fieldBounds,
		fieldHistogram,
		vintageBoundsFromSet,
		vintageYearsFromRange,
	} from '@filter-enginez/examples-shared/wine-domain';
	import { createEngineStores } from '@filter-enginez/svelte-signals';
	import RangeSlider from '$lib/controls/RangeSlider.svelte';

	import { getWineBundle } from '../wineBundle.js';
	import { commitRule } from '../wineCommit.js';

	const {
		engine,
		leaveExpressionMode,
		step,
	}: {
		engine: SignalsEngine<Wine>;
		leaveExpressionMode: () => void;
		/** Drag granularity. NOT `SLIDER_STEPS` — see the panel's `DRAG_STEPS`. */
		step: number;
	} = $props();

	const bundleContext = getWineBundle();
	const bundle = $derived(bundleContext?.current() ?? null);

	/** The full-corpus track extent; the placeholder only when no provider is above. */
	const baseline = $derived(bundleContext?.baselines.vintage ?? FALLBACK_BOUNDS.vintage);

	/**
	 * This facet's own rule store, subscribed once at init.
	 *
	 * @remarks
	 * The engine is a prop that never changes for a mounted section, so capturing it once is intended.
	 */
	// svelte-ignore state_referenced_locally
	const ruleStore = createEngineStores(engine).rule('vintage');

	/** The committed year set, or `undefined` when this facet carries no rule. */
	const committedRule = $derived($ruleStore as InSetRule<number> | undefined);

	/**
	 * The handle span — a WRITABLE `$derived`; `null` when this facet carries no rule.
	 *
	 * @remarks
	 * Depends on `baseline` as well as the rule, which is inert: the bundle context is captured once at
	 * init and `<WineView>` publishes final baselines before it renders the panel, so that half never
	 * invalidates.
	 */
	let value = $derived(
		committedRule === undefined ? null : vintageBoundsFromSet(committedRule.config.set, baseline),
	);

	/** The lower handle — the committed bound, or the baseline edge when this facet carries no rule. */
	const valueMin = $derived(value?.min ?? baseline.min);

	/** @see valueMin */
	const valueMax = $derived(value !== null && Number.isFinite(value.max) ? value.max : baseline.max);

	/** The filtered-except-self bounds, or `undefined` to fall back to the whole baseline track. */
	const available = $derived(fieldBounds(bundle, 'vintage') ?? undefined);

	/** One bucket per year — the per-vintage distribution, matching the field's actual discreteness. */
	const histogram = $derived(fieldHistogram(bundle, 'vintage', valueMin, valueMax));
</script>

<section>
	<RangeSlider
		{available}
		{baseline}
		{histogram}
		{step}
		{valueMax}
		{valueMin}
		label="Vintage"
		format={(year) => String(Math.round(year))}
		onChange={(next) => {
			leaveExpressionMode();
			// Write the handle position locally first — the engine's own value lags a worker round trip.
			value = { max: next.max, min: next.min };
			commitRule(engine, 'vintage', inSet<number>('vintage', vintageYearsFromRange(next, baseline)));
		}}
	/>
</section>
