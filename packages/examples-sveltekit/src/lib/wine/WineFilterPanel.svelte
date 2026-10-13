<script lang="ts">
	/**
	 * `<WineFilterPanel>` — the fourteen-section wine filter panel.
	 *
	 * @remarks
	 * At parity with the React panel's facet set: four chip groups (color, body, sweetness, varietal),
	 * four range sliders (price, points, ABV, vintage), a fuzzy tasting-note search, a points
	 * comparison, the origin tree, and the smart-filter presets.
	 *
	 * ### A composition root, and nothing else
	 *
	 * Every facet is its own section under `sections/`, and each one owns its control state, its
	 * commit, and the bundle reads it needs. This file holds what is genuinely the PANEL's: the
	 * drag-step table, the expression-mode handshake, and the order the sections appear in. Keeping the
	 * facets in their own files is also what keeps this one well under the repo's 500-line cap.
	 *
	 * ### Every control is a WRITABLE `$derived` off the engine
	 *
	 * Each section reads its own rule store and derives its control from the committed rule: seeded from
	 * it at init, reassignable when the user acts, and recomputed whenever the rule changes from
	 * outside. So "Clear all", a removed results-header chip, a preset taking over, devtools time
	 * travel, and a shared `?f` link all reach the controls with no reset table and no registration
	 * handshake for the two halves to drift apart in.
	 *
	 * Local mirrors seeded to empty would not be cosmetic: `routes/wine/+page.svelte` calls
	 * `core.loadConfig(urlConfig)` BEFORE this component mounts, so a `?f` reload would land with rules
	 * on the engine, correct results on screen, and every control blank — and the next click would
	 * write a one-element set, silently dropping the restored values the panel never knew about.
	 *
	 * **WRITABLE, where the real-estate panel's selections are read-only derivations**, because wine is
	 * worker-backed: `.core` mutations are fire-and-forget and `activeRules` only reassigns after an
	 * awaited round trip, so a read-only derivation would flicker chips off and snap sliders backwards
	 * for the length of that trip. The local write paints the control and the recompute confirms it
	 * later. `<WineChipSection>` carries the full argument, including why hand-rolling the same thing as
	 * a `$state` plus an adopt `$effect` reintroduces the snap-back by another route.
	 *
	 * ### Expression mode replaces the flat rules entirely
	 *
	 * A smart-filter preset calls `setExpression`, which switches the engine out of flat-map mode. The
	 * individual facets then no longer describe what is being filtered, so selecting a preset clears
	 * them and selecting a facet clears the preset. Leaving both visibly active would show a panel
	 * whose controls do not match its results.
	 */

	import type { Wine } from '@filter-enginez/mock-data/wine';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import {
		BODY_ORDER,
		COLOR_ORDER,
		deriveSelectedPresetIds,
		type OriginNodeSpec,
		type PickerTreeNode,
		SWEETNESS_ORDER,
		type WineChipVocabularies,
	} from '@filter-enginez/examples-shared/wine-domain';
	import { createEngineStores } from '@filter-enginez/svelte-signals';
	import PanelHeader from '$lib/controls/PanelHeader.svelte';

	import ScoreCompareSection from './sections/ScoreCompareSection.svelte';
	import SingleColorSection from './sections/SingleColorSection.svelte';
	import WineChipSection from './sections/WineChipSection.svelte';
	import WineNotesSection from './sections/WineNotesSection.svelte';
	import WineOriginSection from './sections/WineOriginSection.svelte';
	import WineRangeSection from './sections/WineRangeSection.svelte';
	import WinerySearchSection from './sections/WinerySearchSection.svelte';
	import WineVintageSection from './sections/WineVintageSection.svelte';
	import { commitExpression } from './wineCommit.js';
	import WineSmartFilters from './WineSmartFilters.svelte';

	// `baselines` is deliberately NOT a prop. Every slider takes the same bounds off the bundle
	// context, which `<WineView>` publishes — threading it in as well would be a second route to one
	// value.
	const {
		engine,
		isComputing = false,
		isExpressionMode = false,
		originSpecs,
		originTree,
		vocabularies,
	}: {
		engine: SignalsEngine<Wine>;
		/** Dims + locks the manual sections while a bundle round trip is pending. */
		isComputing?: boolean;
		/** Dims + locks them harder while a preset holds the engine in expression mode. */
		isExpressionMode?: boolean;
		originSpecs: readonly OriginNodeSpec[];
		originTree: PickerTreeNode | null;
		vocabularies: WineChipVocabularies;
	} = $props();

	/**
	 * The engine's expression store, subscribed once at init. The engine is a prop that is never
	 * reassigned — the route renders the view only after boot resolves — so capturing it is intended.
	 */
	// svelte-ignore state_referenced_locally
	const { expression } = createEngineStores(engine);

	/**
	 * The lit preset chips — the panel's ONE piece of control state, because it is the one facet that
	 * is not a rule.
	 *
	 * @remarks
	 * A writable `$derived` off the committed expression, exactly like the twelve facet sections off
	 * their rules. `deriveSelectedPresetIds` is the inverse of the preset table: it recovers which
	 * presets built a committed expression, which is what lets a shared `?f` link restore the chips
	 * rather than the results alone.
	 *
	 * Deriving rather than seeding once is what deletes the reset registry: the header's "Clear all" and
	 * the smart-filter chip's × both just call `clearAllWineFilters`, and these chips go out on their
	 * own. On the async tiers that lands a round trip later, which is harmless — a local write has
	 * already painted them, and the recompute confirms the same value.
	 */
	let activePresets = $derived(deriveSelectedPresetIds($expression));

	/**
	 * Per-slider drag granularity.
	 *
	 * @remarks
	 * NOT `SLIDER_STEPS`. That record is the grid the BASELINE BOUNDS are rounded outward onto, and it
	 * is all zeros deliberately (padding price by 5 once turned a $4 corpus minimum into a displayed
	 * $0). Reusing it here conflated two unrelated knobs and, via a `|| 1` fallback, silently snapped
	 * the price slider to $1 where React snaps to $5.
	 */
	const DRAG_STEPS = { abv: 0.1, points: 1, price: 5, vintage: 1 } as const;

	/** Drop any active preset — a facet edit means the user is back in flat-map mode. */
	function leaveExpressionMode(): void {
		if (activePresets.length === 0) {
			return;
		}
		activePresets = [];
		commitExpression(engine, null);
	}
</script>

<div class="fe-filter-panel">
	<PanelHeader />

	<!-- The scroll container. `topSlot` (the smart filters) scrolls with the panel but stays
	     INTERACTIVE while the manual sections below dim and lock — otherwise applying a preset would
	     leave the user with no way to clear it. -->
	<div class="fe-filter-panel__scroller">
		<!-- No `onBeforeApply` hook to blank the flat controls: applying a preset calls
		     `clearAllFacetRules`, and every section adopts its own rule's removal. That handshake was
		     the last caller of the panel's reset table. -->
		<WineSmartFilters
			{engine}
			onSelectedChange={(next) => {
				activePresets = next;
			}}
			selected={activePresets}
		/>

		<!--
			`inert` for EXPRESSION MODE ONLY, deliberately not for computing.

			`inert` removes descendants from the focus order and BLURS whatever is focused inside. On a
			transient state that is user-hostile: committing a filter by keyboard set `isComputing`,
			which blurred the row the user had just activated and dropped them back at the top of the
			document. Mouse users never noticed because they hold no focus position; keyboard users lost
			their place on every single selection.

			Expression mode is different — it is a persistent state the user chose, the sections really
			are dormant while a preset drives the results, and the smart-filter block sits OUTSIDE this
			container so there is always a reachable way back out.

			Computing keeps the visual dim and `pointer-events: none` from `--busy`. A keystroke that
			lands mid-recompute is harmless: the busy tracker is version-based and resolves out-of-order
			commits by design, which is exactly why it counts versions instead of holding a boolean.
		-->
		<div
			class="fe-filter-panel__body"
			class:fe-filter-panel__body--expression={isExpressionMode}
			class:fe-filter-panel__body--busy={isComputing && !isExpressionMode}
			inert={isExpressionMode}
		>
			<WineRangeSection
				{engine}
				{leaveExpressionMode}
				field="priceUsd"
				format={(price) => `$${Math.round(price)}`}
				label="Price (USD)"
				ruleId="price"
				step={DRAG_STEPS.price}
			/>

			<WineRangeSection
				{engine}
				{leaveExpressionMode}
				field="points"
				label="Points"
				ruleId="points"
				step={DRAG_STEPS.points}
			/>

			<ScoreCompareSection {engine} {leaveExpressionMode} />

			<WineChipSection
				{engine}
				{leaveExpressionMode}
				label="Color"
				options={COLOR_ORDER.filter((entry) => vocabularies.color.includes(entry))}
				ruleId="color"
				showCount
			/>

			<SingleColorSection {engine} {leaveExpressionMode} options={vocabularies.color} />

			<WineChipSection
				{engine}
				{leaveExpressionMode}
				label={`Varietal (${vocabularies.varietal.length})`}
				options={vocabularies.varietal.slice(0, 60)}
				ruleId="varietal"
				scrollable
			/>

			<WineOriginSection {engine} {leaveExpressionMode} specs={originSpecs} tree={originTree} />

			<WineVintageSection {engine} {leaveExpressionMode} step={DRAG_STEPS.vintage} />

			<WineRangeSection
				{engine}
				{leaveExpressionMode}
				field="abv"
				format={(abv) => `${abv.toFixed(1)}%`}
				label="ABV (%)"
				ruleId="abv"
				step={DRAG_STEPS.abv}
			/>

			<WineChipSection
				{engine}
				{leaveExpressionMode}
				label="Body"
				options={BODY_ORDER.filter((entry) => vocabularies.body.includes(entry))}
				ruleId="body"
			/>

			<WineChipSection
				{engine}
				{leaveExpressionMode}
				label="Sweetness"
				options={SWEETNESS_ORDER.filter((entry) => vocabularies.sweetness.includes(entry))}
				ruleId="sweetness"
			/>

			<WineNotesSection {engine} {leaveExpressionMode} />

			<WinerySearchSection {engine} {leaveExpressionMode} />
		</div>
	</div>
</div>
