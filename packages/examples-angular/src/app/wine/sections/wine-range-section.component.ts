/**
 * `<fe-wine-range-section>` — one `RangeRule` slider with predictive bounds and a histogram.
 *
 * @remarks
 * Price, points and ABV are the same facet three times over, differing only in field, label, format
 * and drag step.
 *
 * **The handle span is a writable derived, not a `computed`** — the pattern `adopted-rule-state.ts`
 * establishes and documents at length. The slider makes the reason especially visible: on the worker
 * tier the engine's value lags a full round trip, so a read-only derivation would snap the handle
 * backwards mid-drag.
 *
 * An absent rule renders as the full baseline track, which is exactly what no constraint means. That
 * is spelled `null` rather than `min === 0`, which would collide with a genuine selection whose lower
 * bound is zero. An infinite `max` — which only reaches this route through a `?f` link from React's
 * open-ended price slider — reads back as the baseline maximum rather than as an infinite handle.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { injectFilterEngine } from '@filter-enginez/angular-rxjs';
import { range, type RangeRule } from '@filter-enginez/core';
import {
	commitRule,
	FALLBACK_BOUNDS,
	fieldBounds,
	fieldHistogram,
	type SliderFieldId,
} from '@filter-enginez/examples-shared/wine-domain';

import { type RangeSliderChange, RangeSliderComponent } from '../../controls/range-slider.component.js';
import { adoptCommittedRule } from '../adopted-rule-state.js';
import { injectWineBundle } from '../wine-bundle.js';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [RangeSliderComponent],
	selector: 'fe-wine-range-section',
	template: `
		<section>
			<fe-range-slider
				[ariaLabel]="sliderLabel()"
				[available]="available()"
				[baseline]="baseline()"
				[format]="format()"
				[histogram]="histogram()"
				[label]="label()"
				[step]="step()"
				[valueMax]="valueMax()"
				[valueMin]="valueMin()"
				(rangeChange)="handleChange($event)"
			/>
		</section>
	`,
})
export class WineRangeSectionComponent {
	/** The `Wine` property the `RangeRule` constrains — `priceUsd` for the `price` rule. */
	public readonly field = input.required<string>();

	/** Value → display string. Omitted for points, which reads as a bare number. */
	public readonly format = input<(value: number) => string>();

	public readonly label = input.required<string>();

	/** Drops any active preset — a facet edit means the user is back in flat-map mode. */
	public readonly leaveExpressionMode = input.required<() => void>();

	/** Rule id — also the key into the shared baselines and the bundle's field metadata. */
	public readonly ruleId = input.required<Extract<SliderFieldId, 'abv' | 'points' | 'price'>>();

	/** Accessible name for the slider group. */
	public readonly sliderLabel = input.required<string>();

	/** Drag granularity. NOT `SLIDER_STEPS` — see the panel's `DRAG_STEPS`. */
	public readonly step = input.required<number>();

	private readonly _bundle = injectWineBundle();

	private readonly _engine = injectFilterEngine<Wine>();

	/** The painted handle span — written on drag, re-seeded on settle. `null` means no constraint. */
	protected readonly span = adoptCommittedRule<RangeRule, RangeRule['config'] | null>(
		this._engine,
		this.ruleId,
		(rule) => rule?.config ?? null,
	);

	/** The current bundle, or `null` before the first round trip — and in isolation tests. */
	private readonly _currentBundle = computed(() => this._bundle?.current() ?? null);

	/**
	 * The full-corpus track extent.
	 *
	 * @remarks
	 * Falls back to the pre-boot placeholder only when no panel is above, which happens in isolation
	 * tests and nowhere else — the panel provides the context before it renders any section.
	 */
	protected readonly baseline = computed(
		() => this._bundle?.baselines[this.ruleId()] ?? FALLBACK_BOUNDS[this.ruleId()],
	);

	/** The lower handle — the committed bound, or the baseline edge when this facet carries no rule. */
	protected readonly valueMin = computed(() => this.span()?.min ?? this.baseline().min);

	/** @see valueMin — and the class remarks, for the infinite-maximum case. */
	protected readonly valueMax = computed(() => {
		const current = this.span();

		return current !== null && Number.isFinite(current.max) ? current.max : this.baseline().max;
	});

	/**
	 * The filtered-except-self bounds — the stretches of track a current result actually occupies.
	 *
	 * @remarks
	 * `undefined` means "fall back to the baseline", covering three cases a slider cannot tell apart:
	 * no bundle yet, the field was not queried, and no result occupies the field at all. In all three
	 * the whole track reads as available, which is the honest "we don't know yet" — dimming it would
	 * claim there is nothing there.
	 */
	protected readonly available = computed(
		() => fieldBounds(this._currentBundle(), this.ruleId()) ?? undefined,
	);

	/** This field's distribution — where the data sits inside the available zone. */
	protected readonly histogram = computed(() =>
		fieldHistogram(this._currentBundle(), this.ruleId(), this.valueMin(), this.valueMax()),
	);

	/**
	 * Commit a dragged span, painting locally first.
	 *
	 * @param next - The new bounds.
	 */
	protected handleChange(next: RangeSliderChange): void {
		this.leaveExpressionMode()();
		// Locally first: on the worker tier the engine's own value lags a full round trip, so waiting
		// for the recompute would snap the handle backwards mid-drag.
		this.span.set({ max: next.max, min: next.min });
		commitRule(this._engine, this.ruleId(), range(this.field(), next));
	}
}
