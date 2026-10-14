<script setup lang="ts">
/**
 * `<WineChipSection>` — one exclusion-aware `InSetRule` chip group.
 *
 * @remarks
 * Color, body, sweetness and varietal are four near-identical facets differing only in label,
 * vocabulary, and whether the group scrolls. That is the shape where the fourth copy quietly disagrees
 * with the other three; React and SvelteKit both collapse them for the same reason.
 *
 * **The rule id doubles as the field name** — `color`, `body`, `sweetness` and `varietal` are each both
 * the engine's key for the rule and the `Wine` property it constrains. A facet where the two diverge
 * needs its own section rather than a second prop here.
 *
 * ## THE trap: the selection is local state adopting the engine, not a `computed`
 *
 * This is the one panel in the repo where a read-only derivation is **wrong**, and the reason is the
 * worker. Wine's `.core` mutations are fire-and-forget: `activeRules` only reassigns after an awaited
 * round trip against 150k records. A `computed` off the rule would therefore flicker the chip back OFF
 * for the length of that trip on every click. Real estate derives outright and is right to — it
 * filters on the main thread, where the settle lands in the same frame.
 *
 * Svelte expresses this as a writable `$derived`. Vue has no writable-derived construct, so it is a
 * `ref` seeded from the committed rule plus a **one-way `watch`** that adopts engine-side changes. The
 * three properties that matter:
 *
 *   1. **Seeded, not empty.** `/wine` calls `core.loadConfig(urlConfig)` before this mounts, so a
 *      selection initialized to `[]` would render every chip unselected over correct results — and the
 *      next click would write a one-element set, silently dropping the restored values.
 *   2. **The click paints immediately** (`selected.value = next`), before the engine round trip.
 *   3. **The watch adopts, and never fights.** Its source is the committed value alone. `watchEffect`
 *      would be wrong for the same reason Svelte's docblock forbids an adopt `$effect`: it would track
 *      `selected` too, re-run on a local click, read the still-stale engine value, and snap the chip
 *      straight back.
 *
 * `EMPTY_SELECTION` rather than an inline `?? []`, so an absent rule yields the SAME array identity
 * every evaluation. A referentially-new `[]` reads as a change and makes the watch fire on every
 * unrelated settle.
 *
 * ## It reads the bundle context directly
 *
 * The exclusion map comes from `injectWineBundle()` rather than a prop, matching the range and origin
 * sections. The map changes on every engine settle, so threading it down would mean the panel
 * re-deriving four values per bundle purely to hand them straight to four children.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import { inSet, type InSetRule, type RuleId } from '@filter-enginez/core';
import { toggleSetValue } from '@filter-enginez/examples-shared/selection';
import {
	chipExclusionMap,
	commitSelection,
	EMPTY_SELECTION,
} from '@filter-enginez/examples-shared/wine-domain';
import { useEngineRefs } from '@filter-enginez/vue-signals';
import { computed, ref, watch } from 'vue';

import ChipToggleGroup from '../../controls/ChipToggleGroup.vue';
import SectionHeader from '../../controls/SectionHeader.vue';
import { injectWineBundle } from '../wineBundle.js';

const props = withDefaults(
	defineProps<{
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
	}>(),
	{
		scrollable: false,
		showCount: false,
	},
);

// `rule(ruleId)` rather than the whole `activeRules` map: the engine memoizes a signal per rule id, so
// four chip groups subscribe to four narrow signals and a color commit does not wake the other three.
// It must be called in `setup()` — that is where its teardown is registered — so it cannot move inside
// the `computed` below.
const ruleRef = useEngineRefs(props.engine).rule(props.ruleId);

/** What the engine currently holds for this facet. The watch source, and the seed. */
const committed = computed<readonly string[]>(
	() => (ruleRef.value as InSetRule<string> | undefined)?.config.set ?? EMPTY_SELECTION,
);

/** The painted selection — seeded from the engine, written on click, re-adopted on settle. */
const selected = ref<readonly string[]>(committed.value);

// One-way, and `watch` rather than `watchEffect` — see the docblock. The callback writes `selected`
// but the SOURCE never reads it, so a local click cannot re-trigger this.
watch(committed, (next) => {
	selected.value = next;
});

const bundleContext = injectWineBundle();
const bundle = computed(() => bundleContext?.current.value ?? null);

/** Which chips would empty the results, and by how much. Empty until the first bundle — all enabled. */
const exclusion = computed(() => chipExclusionMap(bundle.value, props.ruleId));

/**
 * Toggle one value, painting locally before the engine round trip.
 *
 * @param value - The chip clicked.
 */
function handleToggle(value: string): void {
	props.leaveExpressionMode();

	const next = toggleSetValue(selected.value, value);

	selected.value = next;
	commitSelection(props.engine, props.ruleId, next, (values) => inSet<string>(props.ruleId, values));
}
</script>

<template>
	<section>
		<SectionHeader :label="label" />
		<ChipToggleGroup
			:exclusion="exclusion"
			:options="options"
			:scrollable="scrollable"
			:selected="selected"
			:show-count="showCount"
			@toggle="handleToggle"
		/>
	</section>
</template>
