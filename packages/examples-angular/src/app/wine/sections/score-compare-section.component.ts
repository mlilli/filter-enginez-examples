/**
 * `<fe-score-compare-section>` — the `NumericComparisonRule` facet: an operator plus a threshold.
 *
 * @remarks
 * The only consumer of `<fe-number-field>`, and the only facet in the panel built from two controls
 * that must agree. It is not a single fixed "≥ 90" checkbox because the facet exists to demonstrate
 * the rule type, and one fixed operator demonstrates very little of it.
 *
 * ## Two pieces of state, and they adopt differently
 *
 * The operator follows the panel's usual pattern — `adoptCommittedRule`, which re-seeds whenever the
 * committed operator changes.
 *
 * **The threshold does not, and the difference is deliberate.** It must adopt ONLY when a rule exists.
 * With the facet off there is no committed value to adopt, and re-seeding anyway would reset the box
 * to the default every time the user cleared the operator — losing a threshold they had just typed. So
 * this one is a `linkedSignal` whose computation falls back to its own PREVIOUS value:
 *
 *   `(next, previous) => next ?? previous?.value ?? DEFAULT_THRESHOLD`
 *
 * which is why it is spelled out here rather than routed through the shared helper. It also seeds
 * correctly from a rule that arrived before this rendered — a `?f` restore or a JSON config — because
 * `next` is the committed value on the first evaluation, and only falls back when there is none.
 *
 * ## Editing the threshold must not switch the facet on
 *
 * With no operator selected there is no rule, and typing a number is not a request to create one — the
 * user has not said *how* to compare yet. The threshold handler therefore commits only when an
 * operator is already active.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectFilterEngine } from '@filter-enginez/angular-rxjs';
import {
	numCompare,
	type NumericComparisonOp,
	type NumericComparisonRule,
} from '@filter-enginez/core';
import { clearRule, commitRule } from '@filter-enginez/examples-shared/wine-domain';

import { NumberFieldComponent } from '../../controls/number-field.component.js';
import { SectionHeaderComponent } from '../../controls/section-header.component.js';
import { SelectMenuComponent } from '../../controls/select-menu.component.js';
import { adoptCommittedRule } from '../adopted-rule-state.js';

/** The engine's key for this facet. */
const RULE_ID = 'points-compare';

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

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NumberFieldComponent, SectionHeaderComponent, SelectMenuComponent],
	selector: 'fe-score-compare-section',
	template: `
		<section>
			<fe-section-header label="Score comparison" />
			<div class="fe-operator-row">
				<div class="fe-operator-row__op">
					<fe-select-menu
						[options]="operators"
						placeholder="— off —"
						selectLabel="Points comparison operator"
						[value]="op()"
						(valueChange)="handleOperatorChange($event)"
					/>
				</div>
				<div class="fe-operator-row__value">
					<fe-number-field
						fieldLabel="Points comparison threshold"
						[max]="100"
						[min]="80"
						[step]="1"
						[value]="threshold()"
						(valueChange)="handleThresholdChange($event)"
					/>
				</div>
			</div>
		</section>
	`,
})
export class ScoreCompareSectionComponent {
	/** Drops any active preset — a facet edit means the user is back in flat-map mode. */
	public readonly leaveExpressionMode = input.required<() => void>();

	/** Bound into the template; see {@link OPERATORS}. */
	protected readonly operators = OPERATORS;

	private readonly _engine = injectFilterEngine<Wine>();

	/** The painted operator; `''` when the facet is off. */
	protected readonly op = adoptCommittedRule<NumericComparisonRule, string>(
		this._engine,
		() => RULE_ID,
		(rule) => rule?.config.op ?? '',
	);

	private readonly _activeRules = toSignal(this._engine.activeRules$, { requireSync: true });

	/** The committed threshold, or `undefined` when the facet is off. */
	private readonly _committedThreshold = computed<number | undefined>(
		() => (this._activeRules().get(RULE_ID) as NumericComparisonRule | undefined)?.config.value,
	);

	/** The painted threshold — adopts a committed value, and otherwise keeps whatever it holds. */
	protected readonly threshold = linkedSignal<number | undefined, number>({
		computation: (next, previous) => next ?? previous?.value ?? DEFAULT_THRESHOLD,
		source: this._committedThreshold,
	});

	/**
	 * Change the operator, committing or clearing the facet.
	 *
	 * @param next - The chosen operator, or `''` for off.
	 */
	protected handleOperatorChange(next: string): void {
		this.leaveExpressionMode()();
		this.op.set(next);

		if (next === '') {
			clearRule(this._engine, RULE_ID);

			return;
		}
		commitRule(
			this._engine,
			RULE_ID,
			numCompare('points', { op: next as NumericComparisonOp, value: this.threshold() }),
		);
	}

	/**
	 * Change the threshold, re-committing only when an operator is already active.
	 *
	 * @param next - The new threshold.
	 */
	protected handleThresholdChange(next: number): void {
		this.threshold.set(next);

		// See the class remarks: editing the threshold with the facet off must not switch it on.
		if (this.op() === '') {
			return;
		}
		this.leaveExpressionMode()();
		commitRule(
			this._engine,
			RULE_ID,
			numCompare('points', { op: this.op() as NumericComparisonOp, value: next }),
		);
	}
}
