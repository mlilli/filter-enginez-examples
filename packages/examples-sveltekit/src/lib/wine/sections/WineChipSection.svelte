<script lang="ts">
	/**
	 * `<WineChipSection>` — one exclusion-aware `InSetRule` chip group.
	 *
	 * @remarks
	 * Color, body, sweetness and varietal differ only in label, vocabulary, and whether the group
	 * scrolls, so they share this one section rather than four near-identical blocks in the panel — the
	 * shape where the fourth copy quietly disagrees with the other three. React collapses the same
	 * facets into `<ChipFilterSection />` for the same reason.
	 *
	 * **The rule id doubles as the field name**, here and in React: `color`, `body`, `sweetness` and
	 * `varietal` are each both the engine's key for the rule and the `Wine` property it constrains. A
	 * facet where the two diverge needs its own section rather than a second prop here — that
	 * coincidence is what keeps this contract one identifier wide.
	 *
	 * ### The selection is a WRITABLE `$derived` off this facet's rule
	 *
	 * Which is Svelte's one-construct spelling of React's seed-and-adopt: its initial value is the
	 * committed rule's set (the seed), it is reassignable when the user clicks (the optimistic paint),
	 * and it recomputes — discarding the local value — whenever the rule changes from outside (the
	 * adopt). Same idiom the books and real-estate panels use for their search boxes.
	 *
	 * Seeding is what makes a shared `?f` link arrive with the right chips lit: `routes/wine/+page.svelte`
	 * calls `core.loadConfig(urlConfig)` before this ever mounts, so a selection initialized to empty
	 * would render every chip unselected over correct results — and the next click would write a
	 * one-element set, silently dropping the restored values it never knew about.
	 *
	 * **A FULLY derived (read-only) selection would be wrong here, and this is the one panel where that
	 * is true.** Wine is worker-backed: `.core` mutations are fire-and-forget and `activeRules` only
	 * reassigns after an awaited round trip, so a read-only derivation would flicker the chip off for
	 * the length of that trip on every click. Real estate derives outright because it filters on the
	 * main thread. The writable form gets both: the click paints, and the round trip confirms.
	 *
	 * **Do not "improve" this into a `$state` plus an adopt `$effect`.** React's equivalent guards its
	 * effect with `sameSelection`, which is safe there because the dependency array already limits it to
	 * engine-side changes. Svelte has no dependency array — an effect that read `selected` would re-run
	 * on a local click, see the still-stale engine value, and snap the chip straight back.
	 *
	 * ### It reads the bundle context directly
	 *
	 * The exclusion map comes from `getWineBundle()` rather than from a prop, matching the range and
	 * origin sections. The panel has no opinion about it: the map changes on every engine settle, so
	 * threading it down would mean the panel re-deriving four values per bundle purely to hand them
	 * straight to four children.
	 */

	import type { Wine } from '@filter-enginez/mock-data/wine';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { inSet, type InSetRule, type RuleId } from '@filter-enginez/core';
	import { toggleSetValue } from '@filter-enginez/examples-shared/selection';
	import { chipExclusionMap, EMPTY_SELECTION } from '@filter-enginez/examples-shared/wine-domain';
	import { createEngineStores } from '@filter-enginez/svelte-signals';
	import ChipToggleGroup from '$lib/controls/ChipToggleGroup.svelte';
	import SectionHeader from '$lib/controls/SectionHeader.svelte';

	import { getWineBundle } from '../wineBundle.js';
	import { commitSelection } from '../wineCommit.js';

	const {
		engine,
		label,
		leaveExpressionMode,
		options,
		ruleId,
		scrollable = false,
		showCount = false,
	}: {
		engine: SignalsEngine<Wine>;
		/** Section heading. Varietal's carries its vocabulary size, so this is not derivable from `ruleId`. */
		label: string;
		leaveExpressionMode: () => void;
		/** The candidate values, in display order. */
		options: readonly string[];
		/** The rule id — also the `Wine` field the `InSetRule` constrains. See the docblock. */
		ruleId: RuleId;
		/** Cap the group's height and let it scroll. Varietal only; the other three fit. */
		scrollable?: boolean;
		/** Show projected-count badges on unselected chips. */
		showCount?: boolean;
	} = $props();

	/**
	 * This facet's own rule store, subscribed once at init.
	 *
	 * @remarks
	 * `rule(ruleId)` rather than the whole `activeRules` map: the engine memoizes a signal per rule id,
	 * so four chip groups subscribe to four narrow signals and a color commit does not wake the other
	 * three. Both the engine and `ruleId` are props that never change for a mounted section, so
	 * capturing them once is intended.
	 */
	// svelte-ignore state_referenced_locally
	const ruleStore = createEngineStores(engine).rule(ruleId);

	/**
	 * The current selection — a WRITABLE `$derived`; see the docblock.
	 *
	 * @remarks
	 * `EMPTY_SELECTION` rather than an inline `?? []`, so an absent rule yields the SAME array every
	 * evaluation rather than a referentially-new one that reads as a change — the trap that constant's
	 * own docblock names for all three frameworks.
	 */
	let selected = $derived(($ruleStore as InSetRule<string> | undefined)?.config.set ?? EMPTY_SELECTION);

	const bundleContext = getWineBundle();
	const bundle = $derived(bundleContext?.current() ?? null);

	/** Which chips would empty the results, and by how much. Empty until the first bundle — all enabled. */
	const exclusion = $derived(chipExclusionMap(bundle, ruleId));
</script>

<!-- One invocation, one wrapper. The height cap is a `scrollable` prop forwarded to the shared
     control rather than a wrapper chosen by an `{#if}` around two copies of this call, so there is
     no second branch to fall behind. -->
{#snippet chips()}
	<ChipToggleGroup
		{exclusion}
		{options}
		{scrollable}
		{selected}
		{showCount}
		onToggle={(value) => {
			leaveExpressionMode();
			selected = toggleSetValue(selected, value);
			commitSelection(engine, ruleId, selected, (values) => inSet<string>(ruleId, values));
		}}
	/>
{/snippet}

<section>
	<SectionHeader {label} />
	{@render chips()}
</section>
