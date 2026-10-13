<script lang="ts">
	/**
	 * `<ScoreCompareSection>` — a six-operator `NumericComparisonRule` over a wine's points.
	 *
	 * @remarks
	 * The Svelte counterpart to React's `<PointsCompareFilterSection />`, extracted for the same
	 * reason React has it as its own file: the panel is a composition root, and a section carrying two
	 * controls plus its own commit rules earns a boundary.
	 *
	 * Operator plus threshold, rather than a fixed "90 points or better" checkbox: one hardcoded
	 * threshold and one operator would demonstrate very little of the rule type this section exists to
	 * show.
	 *
	 * ### The operator derives; the threshold is local and adopts CONDITIONALLY
	 *
	 * The two controls are asymmetric on purpose, and React's `<PointsCompareFilterSection />` draws
	 * the same line. The OPERATOR is the facet — a writable `$derived` off the committed rule, like
	 * every other control in this panel, so a `?f` restore and a clear-all both reach it.
	 *
	 * The THRESHOLD cannot be, because it must survive the operator being `— off —` — a state in which
	 * there is no rule to derive from at all. A writable `$derived` would snap it back to the default
	 * the moment the facet was switched off, discarding the number the user typed before choosing an
	 * operator. So it is `$state` plus an effect that adopts ONLY when a rule exists. It is the one
	 * control in the panel where the effect form is correct rather than a regression.
	 *
	 * See `<WineChipSection>` for why the derivations are writable on a worker-backed route.
	 */

	import type { Wine } from '@filter-enginez/mock-data/wine';
	import type { SignalsEngine } from '@filter-enginez/reactive-signals';

	import { numCompare, type NumericComparisonOp, type NumericComparisonRule } from '@filter-enginez/core';
	import { createEngineStores } from '@filter-enginez/svelte-signals';
	import NumberField from '$lib/controls/NumberField.svelte';
	import SectionHeader from '$lib/controls/SectionHeader.svelte';
	import SelectMenu from '$lib/controls/SelectMenu.svelte';
	import { get } from 'svelte/store';

	import { clearRule, commitRule } from '../wineCommit.js';

	const {
		engine,
		leaveExpressionMode,
	}: {
		engine: SignalsEngine<Wine>;
		leaveExpressionMode: () => void;
	} = $props();

	/** Shown before an operator is picked — the low end of a "great" score, matching React. */
	const DEFAULT_THRESHOLD = 90;

	/** This facet's own rule store. The engine never changes for a mounted section. */
	// svelte-ignore state_referenced_locally
	const ruleStore = createEngineStores(engine).rule('points-compare');

	/** The committed rule, or `undefined` when the operator is off. */
	const committedRule = $derived($ruleStore as NumericComparisonRule | undefined);

	/** The active operator — a WRITABLE `$derived`; `''` when the facet is off. */
	let op = $derived<string>(committedRule?.config.op ?? '');

	// The threshold's eager seed. The rule may already be on the engine from a `?f` restore or a JSON
	// config, and the effect below deliberately cannot supply a default.
	let threshold = $state((get(ruleStore) as NumericComparisonRule | undefined)?.config.value ?? DEFAULT_THRESHOLD);

	// Adopts ONLY when a rule exists — see the docblock. Reads the committed value and never
	// `threshold` itself, so a local edit cannot re-trigger it against a stale engine.
	$effect(() => {
		const committedThreshold = committedRule?.config.value;

		if (committedThreshold !== undefined) {
			threshold = committedThreshold;
		}
	});

	/** Math glyphs rather than `>=` etc., matching React — they read faster in a narrow control. */
	const OPERATORS: readonly { label: string; value: string }[] = [
		{ label: '≥', value: '>=' },
		{ label: '>', value: '>' },
		{ label: '=', value: '==' },
		{ label: '≤', value: '<=' },
		{ label: '<', value: '<' },
		{ label: '≠', value: '!=' },
	];
</script>

<section>
	<SectionHeader label="Score comparison" />
	<div class="fe-operator-row">
		<div class="fe-operator-row__op">
			<SelectMenu
				options={OPERATORS}
				value={op}
				placeholder="— off —"
				ariaLabel="Points comparison operator"
				onChange={(next) => {
					leaveExpressionMode();
					op = next;
					if (next === '') {
						clearRule(engine, 'points-compare');

						return;
					}
					commitRule(engine, 'points-compare', numCompare('points', { op: next as NumericComparisonOp, value: threshold }));
				}}
			/>
		</div>
		<div class="fe-operator-row__value">
			<NumberField
				value={threshold}
				min={80}
				max={100}
				ariaLabel="Points comparison threshold"
				onChange={(next) => {
					threshold = next;
					// Only re-commit when an operator is active. Editing the threshold with the facet off
					// must not silently switch it on.
					if (op === '') {
						return;
					}
					leaveExpressionMode();
					commitRule(engine, 'points-compare', numCompare('points', { op: op as NumericComparisonOp, value: next }));
				}}
			/>
		</div>
	</div>
</section>
