<script setup lang="ts">
/**
 * `<ScoreCompareSection>` — the `NumericComparisonRule` facet: an operator plus a threshold.
 *
 * @remarks
 * The only consumer of `<NumberField>`, and the only facet in the panel built from two controls that
 * must agree. It is an operator picker rather than a single hardcoded "≥ 90" checkbox: the facet exists
 * to demonstrate the rule type, and one fixed operator demonstrates very little of it.
 *
 * ## Two pieces of state, and they adopt differently
 *
 * The operator follows the panel's usual pattern — `ref` + one-way `watch`, per `<WineChipSection>`.
 *
 * **The threshold does not, and the difference is deliberate.** Its watch adopts ONLY when a rule
 * exists. With the facet off there is no committed value to adopt, and a watch that fired anyway would
 * reset the box to the default every time the user cleared the operator — losing a threshold they had
 * just typed. So it is seeded eagerly at mount (the rule may already be on the engine from a `?f`
 * restore or a JSON config, which the watch alone cannot supply a default for) and only overwritten by
 * a real committed value.
 *
 * ## Editing the threshold must not switch the facet on
 *
 * With no operator selected there is no rule, and typing a number is not a request to create one — the
 * user has not said *how* to compare yet. The threshold handler therefore commits only when an
 * operator is already active.
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import {
	numCompare,
	type NumericComparisonOp,
	type NumericComparisonRule,
} from '@filter-enginez/core';
import { clearRule, commitRule } from '@filter-enginez/examples-shared/wine-domain';
import { useEngineRefs } from '@filter-enginez/vue-signals';
import { computed, ref, watch } from 'vue';

import NumberField from '../../controls/NumberField.vue';
import SectionHeader from '../../controls/SectionHeader.vue';
import SelectMenu from '../../controls/SelectMenu.vue';

const props = defineProps<{
	engine: SignalsEngine<Wine>;
	leaveExpressionMode: () => void;
}>();

/** Shown before an operator is picked — the low end of a "great" score, matching React. */
const DEFAULT_THRESHOLD = 90;

/** Math glyphs rather than `>=` etc., matching React — they read faster in a narrow control. */
const OPERATORS: readonly { label: string; value: string }[] = [
	{ label: '≥', value: '>=' },
	{ label: '>', value: '>' },
	{ label: '=', value: '==' },
	{ label: '≤', value: '<=' },
	{ label: '<', value: '<' },
	{ label: '≠', value: '!=' },
];

const ruleRef = useEngineRefs(props.engine).rule('points-compare');

/** The committed rule, or `undefined` when the operator is off. */
const committedRule = computed(() => ruleRef.value as NumericComparisonRule | undefined);

/** The active operator; `''` when the facet is off. */
const committedOp = computed<string>(() => committedRule.value?.config.op ?? '');
const op = ref<string>(committedOp.value);

watch(committedOp, (next) => {
	op.value = next;
});

/** The threshold — eagerly seeded, since the watch below cannot supply a default. See the docblock. */
const threshold = ref<number>(committedRule.value?.config.value ?? DEFAULT_THRESHOLD);

// Adopts ONLY when a rule exists. Reads the committed value and never `threshold` itself, so a local
// edit cannot re-trigger this against a stale engine.
watch(
	() => committedRule.value?.config.value,
	(next) => {
		if (next !== undefined) {
			threshold.value = next;
		}
	},
);

/**
 * Change the operator, committing or clearing the facet.
 *
 * @param next - The chosen operator, or `''` for off.
 */
function handleOperatorChange(next: string): void {
	props.leaveExpressionMode();
	op.value = next;

	if (next === '') {
		clearRule(props.engine, 'points-compare');

		return;
	}
	commitRule(
		props.engine,
		'points-compare',
		numCompare('points', { op: next as NumericComparisonOp, value: threshold.value }),
	);
}

/**
 * Change the threshold, re-committing only when an operator is already active.
 *
 * @param next - The new threshold.
 */
function handleThresholdChange(next: number): void {
	threshold.value = next;

	// See the docblock: editing the threshold with the facet off must not silently switch it on.
	if (op.value === '') {
		return;
	}
	props.leaveExpressionMode();
	commitRule(
		props.engine,
		'points-compare',
		numCompare('points', { op: op.value as NumericComparisonOp, value: next }),
	);
}
</script>

<template>
	<section>
		<SectionHeader label="Score comparison" />
		<div class="fe-operator-row">
			<div class="fe-operator-row__op">
				<SelectMenu
					:options="OPERATORS"
					placeholder="— off —"
					select-label="Points comparison operator"
					:value="op"
					@change="handleOperatorChange"
				/>
			</div>
			<div class="fe-operator-row__value">
				<NumberField
					field-label="Points comparison threshold"
					:max="100"
					:min="80"
					:step="1"
					:value="threshold"
					@change="handleThresholdChange"
				/>
			</div>
		</div>
	</section>
</template>
