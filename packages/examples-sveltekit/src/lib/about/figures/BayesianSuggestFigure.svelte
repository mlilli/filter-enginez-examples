<script lang="ts">
	/**
	 * `<BayesianSuggestFigure>` — Svelte port of the Bayesian co-occurrence suggestion illustration.
	 *
	 * Given the current selection (cyan chips), the engine tallies which options historically co-occur
	 * and ranks the most likely next filters as probability bars. The tally connector pulses phosphor
	 * (engine working); the chips + bars are cyan (data). Geometry is verbatim from the React figure; the
	 * `fe-fig-bayes__*` animation CSS lives in `@filter-enginez/ui-styles`.
	 */

	import { inView } from '../inView.js';

	/** One suggested filter with its co-occurrence probability (0–1). */
	interface Suggestion {
		readonly label: string;
		readonly probability: number;
	}

	/** The ranked suggestions (highest first) — probabilities drive the bar widths. */
	const SUGGESTIONS: readonly Suggestion[] = [
		{ label: '90+ points', probability: 0.86 },
		{ label: 'oak', probability: 0.62 },
		{ label: 'red blend', probability: 0.44 },
		{ label: 'reserve', probability: 0.27 },
	];

	/** The current selection chips. */
	const SELECTION = [
		{ label: 'napa', x: 20 },
		{ label: 'cabernet', x: 96 },
	] as const;

	/** Geometry for the suggestion rows. */
	const BAR_X = 150;
	const BAR_MAX_WIDTH = 288;
	const ROW_TOP = 120;
	const ROW_STEP = 30;
</script>

<div
	class="fe-fig fe-fig-bayes"
	role="img"
	aria-label="From the current filter selection, the engine ranks the filters most likely to be chosen next, shown as probability bars."
	use:inView
>
	<svg viewBox="0 0 460 250" xmlns="http://www.w3.org/2000/svg" class="fe-fig__svg fe-fig-bayes__svg">
		<!-- Current selection -->
		<text x={20} y={28} class="fe-fig-bayes__eyebrow">current selection</text>
		{#each SELECTION as chip (chip.label)}
			<g>
				<rect x={chip.x} y={38} width={chip.label.length > 5 ? 84 : 66} height={26} rx={13} class="fe-fig-bayes__chip is-selected" />
				<text x={chip.x + (chip.label.length > 5 ? 42 : 33)} y={51} class="fe-fig-bayes__chip-label is-selected">
					{chip.label}
				</text>
			</g>
		{/each}

		<!-- Co-occurrence tally connector (phosphor, transient) -->
		<line x1={40} y1={70} x2={40} y2={104} class="fe-fig-bayes__connector" />
		<circle class="fe-fig-bayes__pulse" cx={40} cy={70} r={3.5} />

		<text x={20} y={104} class="fe-fig-bayes__eyebrow">suggested filters</text>

		<!-- Suggestion rows -->
		{#each SUGGESTIONS as suggestion, index (suggestion.label)}
			{@const y = ROW_TOP + index * ROW_STEP}
			{@const width = suggestion.probability * BAR_MAX_WIDTH}
			<g class={index === 0 ? 'fe-fig-bayes__row is-top' : 'fe-fig-bayes__row'}>
				<text x={BAR_X - 10} y={y + 9} class="fe-fig-bayes__row-label">{suggestion.label}</text>
				<rect x={BAR_X} y={y} width={BAR_MAX_WIDTH} height={13} rx={3} class="fe-fig-bayes__bar-track" />
				<rect
					x={BAR_X}
					y={y}
					width={width}
					height={13}
					rx={3}
					class="fe-fig-bayes__bar"
					style={`animation-delay: ${600 + index * 180}ms`}
				/>
				<text x={BAR_X + width + 8} y={y + 9} class="fe-fig-bayes__pct">{Math.round(suggestion.probability * 100)}%</text>
			</g>
		{/each}
	</svg>
</div>
