/**
 * `<fe-bayesian-suggest-figure>` — the Bayesian co-occurrence suggestion illustration.
 *
 * @remarks
 * Given the current selection (cyan chips), the engine tallies which options historically co-occur
 * and ranks the most likely next filters as probability bars. The tally connector pulses phosphor
 * (engine working); the chips + bars are cyan (data). Geometry is verbatim from the React / Vue
 * figures; the `fe-fig-bayes__*` animation CSS lives in `@filter-enginez/ui-styles`.
 *
 * **Do not add component styles to this file.** The figure is styled entirely by the global sheet;
 * the moment this component contributes styles, Angular's emulated encapsulation rewrites the
 * selectors and every animation silently dies.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component } from '@angular/core';

import { InViewDirective } from '../in-view.directive.js';

/** One suggested filter with its co-occurrence probability (0–1). */
interface Suggestion {
	readonly label: string;
	readonly probability: number;
}

/** A rendered selection chip: the source label plus its derived pill width and label anchor. */
interface SelectionChip {
	readonly label: string;
	readonly labelX: number;
	readonly width: number;
	readonly x: number;
}

/** A rendered suggestion row: the derived bar geometry, percentage and stagger delay. */
interface SuggestionRow {
	readonly barWidth: number;
	readonly delayMs: number;
	readonly isTop: boolean;
	readonly label: string;
	readonly pct: number;
	readonly y: number;
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

/** The selection chips with their derived widths — long labels get the wider pill. */
const CHIPS: readonly SelectionChip[] = SELECTION.map((chip) => ({
	label: chip.label,
	labelX: chip.x + (chip.label.length > 5 ? 42 : 33),
	width: chip.label.length > 5 ? 84 : 66,
	x: chip.x,
}));

/** The suggestion rows with their derived bar geometry. */
const ROWS: readonly SuggestionRow[] = SUGGESTIONS.map((suggestion, index) => ({
	barWidth: suggestion.probability * BAR_MAX_WIDTH,
	delayMs: 600 + index * 180,
	isTop: index === 0,
	label: suggestion.label,
	pct: Math.round(suggestion.probability * 100),
	y: ROW_TOP + index * ROW_STEP,
}));

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [InViewDirective],
	selector: 'fe-bayesian-suggest-figure',
	template: `
		<div
			feInView
			class="fe-fig fe-fig-bayes"
			role="img"
			aria-label="From the current filter selection, the engine ranks the filters most likely to be chosen next, shown as probability bars."
		>
			<svg viewBox="0 0 460 250" xmlns="http://www.w3.org/2000/svg" class="fe-fig__svg fe-fig-bayes__svg">
				<!-- Current selection -->
				<text x="20" y="28" class="fe-fig-bayes__eyebrow">current selection</text>
				@for (chip of chips; track chip.label) {
					<g>
						<rect
							[attr.x]="chip.x"
							y="38"
							[attr.width]="chip.width"
							height="26"
							rx="13"
							class="fe-fig-bayes__chip is-selected"
						/>
						<text [attr.x]="chip.labelX" y="51" class="fe-fig-bayes__chip-label is-selected">{{ chip.label }}</text>
					</g>
				}

				<!-- Co-occurrence tally connector (phosphor, transient) -->
				<line x1="40" y1="70" x2="40" y2="104" class="fe-fig-bayes__connector" />
				<circle class="fe-fig-bayes__pulse" cx="40" cy="70" r="3.5" />

				<text x="20" y="104" class="fe-fig-bayes__eyebrow">suggested filters</text>

				<!-- Suggestion rows -->
				@for (row of rows; track row.label) {
					<g [class]="row.isTop ? 'fe-fig-bayes__row is-top' : 'fe-fig-bayes__row'">
						<text [attr.x]="barLabelX" [attr.y]="row.y + 9" class="fe-fig-bayes__row-label">{{ row.label }}</text>
						<rect
							[attr.x]="barX"
							[attr.y]="row.y"
							[attr.width]="barMaxWidth"
							height="13"
							rx="3"
							class="fe-fig-bayes__bar-track"
						/>
						<rect
							[attr.x]="barX"
							[attr.y]="row.y"
							[attr.width]="row.barWidth"
							height="13"
							rx="3"
							class="fe-fig-bayes__bar"
							[style.animation-delay.ms]="row.delayMs"
						/>
						<text [attr.x]="barX + row.barWidth + 8" [attr.y]="row.y + 9" class="fe-fig-bayes__pct">{{ row.pct }}%</text>
					</g>
				}
			</svg>
		</div>
	`,
})
export class BayesianSuggestFigureComponent {
	/** Widest a probability bar can be, in user units. */
	protected readonly barMaxWidth = BAR_MAX_WIDTH;

	/** X anchor of the right-aligned row label, ten units left of the track. */
	protected readonly barLabelX = BAR_X - 10;

	/** Left edge of the bar track. */
	protected readonly barX = BAR_X;

	/** The selection chips, exposed for the template. */
	protected readonly chips = CHIPS;

	/** The suggestion rows, exposed for the template. */
	protected readonly rows = ROWS;
}
