<script setup lang="ts">
/**
 * `<WineFilterPanel>` — the thirteen-section wine panel, plus the preset block above it.
 *
 * @remarks
 * `baselines` is deliberately NOT a prop. Every slider takes the same bounds off the bundle context,
 * which `<WineView>` publishes — threading it in as well would be a second route to one value.
 *
 * ## The scroller and the body are two elements, and only wine splits them
 *
 * Every other panel in the repo composes `.fe-filter-panel__scroller` and `.fe-filter-panel__body`
 * onto one element. Wine cannot: the smart-filter block has to scroll WITH the panel while staying
 * interactive as everything below it dims and locks. Applying a preset that greyed out its own clear
 * button would be a trap.
 *
 * Omitting the scroller class entirely does not look broken — the panel silently stops scrolling and
 * the page scrolls instead, which is easy to miss in review.
 *
 * ## `inert` for expression mode ONLY, deliberately not for computing
 *
 * `inert` removes descendants from the focus order and **blurs whatever is focused inside**. On a
 * transient state that is user-hostile: committing a filter by keyboard sets `isComputing`, which
 * would blur the row the user just activated and drop them at the top of the document. Mouse users
 * would never notice — they hold no focus position — so mouse testing alone cannot catch it.
 *
 * Expression mode is different. It is a persistent state the user chose, the sections really are
 * dormant while a preset drives the results, and the smart-filter block sits OUTSIDE this container so
 * there is always a reachable way back out.
 *
 * Computing keeps the visual dim and `pointer-events: none` from `--busy`, plus `aria-busy`, on the
 * main-thread and worker tiers alike. A keystroke landing mid-recompute is harmless: the busy tracker
 * is version-based and resolves out-of-order commits by design, which is exactly why it counts
 * versions instead of holding a boolean.
 *
 * ## Option order
 *
 * Every chip group and the single-color menu list their values through the shared
 * `orderedPresentOptions`: the design order (`red, white, rosé…`, `light … full`), keeping only the
 * values the loaded corpus carries, so the menu and the chips beside it agree, in every app.
 */

import type { InSetRule } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import {
	BODY_ORDER,
	COLOR_ORDER,
	deriveSelectedPresetIds,
	EMPTY_SELECTION,
	exitExpressionMode,
	orderedPresentOptions,
	type OriginNodeSpec,
	type PickerTreeNode,
	SWEETNESS_ORDER,
	visibleVarietalChips,
	type WineChipVocabularies,
} from '@filter-enginez/examples-shared/wine-domain';
import { useEngineRefs } from '@filter-enginez/vue-signals';
import { computed, ref, watch } from 'vue';

import PanelHeader from '../controls/PanelHeader.vue';
import ScoreCompareSection from './sections/ScoreCompareSection.vue';
import SingleColorSection from './sections/SingleColorSection.vue';
import WineChipSection from './sections/WineChipSection.vue';
import WineNotesSection from './sections/WineNotesSection.vue';
import WineOriginSection from './sections/WineOriginSection.vue';
import WineRangeSection from './sections/WineRangeSection.vue';
import WinerySearchSection from './sections/WinerySearchSection.vue';
import WineVintageSection from './sections/WineVintageSection.vue';
import WineSmartFilters from './WineSmartFilters.vue';

const props = withDefaults(
	defineProps<{
		engine: SignalsEngine<Wine>;
		/** Dims + locks the manual sections while a bundle round trip is pending. */
		isComputing?: boolean;
		/** Dims + locks them harder while a preset holds the engine in expression mode. */
		isExpressionMode?: boolean;
		originSpecs: readonly OriginNodeSpec[];
		originTree: PickerTreeNode | null;
		vocabularies: WineChipVocabularies;
	}>(),
	{
		isComputing: false,
		isExpressionMode: false,
	},
);

/**
 * Per-slider drag granularity.
 *
 * @remarks
 * **NOT `SLIDER_STEPS`.** That record is the grid the BASELINE BOUNDS are rounded outward onto, and it
 * is all zeros deliberately — padding price by 5 once turned a $4 corpus minimum into a displayed $0.
 * The two are unrelated knobs.
 *
 * Price snaps to whole dollars, as React's does. Its track is log-scaled, so near the floor one dollar
 * is a visible stretch of track and a coarser step would make $8 or $12 unreachable by drag; the arrow
 * keys still cross the tail quickly, because on a log track a press moves about one percent of the
 * track (never less than one step) rather than one dollar.
 */
const DRAG_STEPS = { abv: 0.1, points: 1, price: 1, vintage: 1 } as const;

// Both from one `useEngineRefs` call, in `setup()`, where their teardown registers.
const engineRefs = useEngineRefs(props.engine);
const { expression } = engineRefs;
const varietalRule = engineRefs.rule('varietal');

/** The preset ids the committed expression implies. */
const committedPresets = computed(() => deriveSelectedPresetIds(expression.value));

/**
 * The lit preset chips — the panel's ONE piece of control state, because it is the one facet that is
 * not a rule.
 *
 * @remarks
 * Same `ref` + one-way `watch` as the twelve facet sections, and for the same reason: on the worker
 * tier the expression signal lands a round trip after the write, so a read-only derivation would blank
 * the chips between the click and the settle.
 *
 * Deriving rather than seeding once is what deletes the reset registry: the header's "Clear all" and
 * the smart-filter chip's × both just call `clearAllWineFilters`, and these chips go out on their own.
 */
const activePresets = ref<readonly string[]>(committedPresets.value);

watch(committedPresets, (next) => {
	activePresets.value = next;
});

/** The colors the corpus actually contains, in canonical order — the chips AND the single-color menu. */
const colorOptions = computed(() => orderedPresentOptions(COLOR_ORDER, props.vocabularies.color));

/**
 * The committed varietal selection — read here only to decide which varietal chips render.
 *
 * @remarks
 * `<WineChipSection>` owns the selection itself; this is a read. `EMPTY_SELECTION` keeps one array
 * identity while no rule is set, so an unrelated settle does not recompute the chip list.
 */
const selectedVarietals = computed<readonly string[]>(
	() => (varietalRule.value as InSetRule<string> | undefined)?.config.set ?? EMPTY_SELECTION,
);

/**
 * The varietal chips: the most-reviewed `VARIETAL_CHIP_LIMIT`, plus any selected varietal beyond them.
 *
 * @remarks
 * The vocabulary is ranked most-reviewed first and runs to hundreds of grapes, so the group shows the
 * top of it and scrolls. `visibleVarietalChips` keeps a selected rare grape on screen too — one
 * restored from a shared `?f` link still gets a chip the user can see and clear.
 */
const varietalOptions = computed(() => visibleVarietalChips(props.vocabularies.varietal, selectedVarietals.value));

const bodyOptions = computed(() => orderedPresentOptions(BODY_ORDER, props.vocabularies.body));

const sweetnessOptions = computed(() => orderedPresentOptions(SWEETNESS_ORDER, props.vocabularies.sweetness));

/** Drop any active preset — a facet edit means the user is back in flat-map mode. */
function leaveExpressionMode(): void {
	if (activePresets.value.length === 0) {
		return;
	}
	activePresets.value = [];
	exitExpressionMode(props.engine);
}

/**
 * Adopt a selection the preset block just applied, before the engine confirms it.
 *
 * @param next - The preset ids now lit.
 */
function handleSelectedChange(next: readonly string[]): void {
	activePresets.value = next;
}
</script>

<template>
	<div class="fe-filter-panel">
		<PanelHeader />

		<!-- The scroll container. The smart filters scroll with the panel but stay INTERACTIVE while the
		     manual sections below dim and lock — see the docblock. -->
		<div class="fe-filter-panel__scroller">
			<WineSmartFilters
				:engine="engine"
				:selected="activePresets"
				@selected-change="handleSelectedChange"
			/>

			<div
				class="fe-filter-panel__body"
				:class="{
					'fe-filter-panel__body--busy': isComputing && !isExpressionMode,
					'fe-filter-panel__body--expression': isExpressionMode,
				}"
				:aria-busy="isComputing && !isExpressionMode"
				:inert="isExpressionMode"
			>
				<WineRangeSection
					:engine="engine"
					:leave-expression-mode="leaveExpressionMode"
					rule-id="price"
					:step="DRAG_STEPS.price"
				/>

				<WineRangeSection
					:engine="engine"
					:leave-expression-mode="leaveExpressionMode"
					rule-id="points"
					:step="DRAG_STEPS.points"
				/>

				<ScoreCompareSection :engine="engine" :leave-expression-mode="leaveExpressionMode" />

				<WineChipSection
					:engine="engine"
					label="Color"
					:leave-expression-mode="leaveExpressionMode"
					:options="colorOptions"
					rule-id="color"
					show-count
				/>

				<SingleColorSection
					:engine="engine"
					:leave-expression-mode="leaveExpressionMode"
					:options="colorOptions"
				/>

				<WineChipSection
					:engine="engine"
					:label="`Varietal (${vocabularies.varietal.length})`"
					:leave-expression-mode="leaveExpressionMode"
					:options="varietalOptions"
					rule-id="varietal"
					scrollable
				/>

				<WineOriginSection
					:engine="engine"
					:leave-expression-mode="leaveExpressionMode"
					:specs="originSpecs"
					:tree="originTree"
				/>

				<WineVintageSection
					:engine="engine"
					:leave-expression-mode="leaveExpressionMode"
					:step="DRAG_STEPS.vintage"
				/>

				<WineRangeSection
					:engine="engine"
					:leave-expression-mode="leaveExpressionMode"
					rule-id="abv"
					:step="DRAG_STEPS.abv"
				/>

				<WineChipSection
					:engine="engine"
					label="Body"
					:leave-expression-mode="leaveExpressionMode"
					:options="bodyOptions"
					rule-id="body"
				/>

				<WineChipSection
					:engine="engine"
					label="Sweetness"
					:leave-expression-mode="leaveExpressionMode"
					:options="sweetnessOptions"
					rule-id="sweetness"
				/>

				<WineNotesSection :engine="engine" :leave-expression-mode="leaveExpressionMode" />

				<WinerySearchSection :engine="engine" :leave-expression-mode="leaveExpressionMode" />
			</div>
		</div>
	</div>
</template>
