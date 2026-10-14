/**
 * `<fe-wine-vintage-section>` — an `InSetRule<number>` presented as a range slider.
 *
 * @remarks
 * **The facet's rule type and its control disagree on purpose.** A vintage is a discrete year, not a
 * continuous measure, so the engine holds an explicit SET of years — but nobody wants to tick sixteen
 * checkboxes to say "2015 to 2020". So the control is a slider and the two conversions in
 * `wine-domain/vintage.ts` bridge it: `vintageYearsFromRange` expands a dragged span into the set to
 * commit, and `vintageBoundsFromSet` recovers a span from whatever set is committed.
 *
 * That round trip is lossy in one direction and deliberately so: a set with a gap in it — reachable
 * through a hand-written JSON config, never through this control — reads back as its outer bounds. The
 * slider then shows a span wider than the rule, which is the honest rendering of "this control cannot
 * express what is committed", and the next drag replaces it.
 *
 * **The track is log-scaled toward the youngest vintage.** Nearly every bottle is from the last twenty
 * years and a few are a century old, so `wineSliderScale` gives recent years most of the track and
 * `wineSliderHistogram` slices the bars to match. The non-vintage year at the right end reads `NV`,
 * through the shared `WINE_SLIDER_TEXT.vintage` (`formatVintage` / `parseVintage`), in the readout,
 * the editable fields and the thumbs' `aria-valuetext` alike.
 *
 * **The projection reads `baseline()`, which is why it cannot be a plain arrow over the rule alone.**
 * `vintageBoundsFromSet` needs the baseline to resolve an empty set. That read happens inside the
 * `adoptCommittedRule` source computation, so the baseline is tracked too — correct, and worth knowing:
 * the baseline is fixed after boot, so it contributes no extra re-seeds in practice.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { injectFilterEngine } from '@filter-enginez/angular-rxjs';
import { inSet, type InSetRule } from '@filter-enginez/core';
import {
	commitRule,
	FALLBACK_BOUNDS,
	fieldBounds,
	type NumericBounds,
	vintageBoundsFromSet,
	vintageYearsFromRange,
	WINE_SLIDER_TEXT,
	wineSliderHistogram,
	wineSliderScale,
} from '@filter-enginez/examples-shared/wine-domain';

import { type RangeSliderChange, RangeSliderComponent } from '../../controls/range-slider.component.js';
import { adoptCommittedRule } from '../adopted-rule-state.js';
import { injectWineBundle } from '../wine-bundle.js';

/** The engine's key for this facet. */
const RULE_ID = 'vintage';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [RangeSliderComponent],
	selector: 'fe-wine-vintage-section',
	template: `
		<section>
			<fe-range-slider
				ariaLabel="Filter by vintage year"
				[available]="available()"
				[baseline]="baseline()"
				[format]="text.format"
				[histogram]="histogram()"
				label="Vintage"
				[parse]="text.parse"
				[scale]="scale()"
				[step]="step()"
				[valueMax]="valueMax()"
				[valueMin]="valueMin()"
				(rangeChange)="handleChange($event)"
			/>
		</section>
	`,
})
export class WineVintageSectionComponent {
	/** Drops any active preset — a facet edit means the user is back in flat-map mode. */
	public readonly leaveExpressionMode = input.required<() => void>();

	/** Drag granularity. NOT `SLIDER_STEPS` — see the panel's `DRAG_STEPS`. */
	public readonly step = input.required<number>();

	/** The shared vintage readout and parser: a plain year, or `NV` for the non-vintage year. */
	protected readonly text = WINE_SLIDER_TEXT.vintage;

	private readonly _bundle = injectWineBundle();

	private readonly _engine = injectFilterEngine<Wine>();

	/** The full-corpus track extent; the placeholder only when no panel is above. */
	protected readonly baseline = computed(
		() => this._bundle?.baselines.vintage ?? FALLBACK_BOUNDS.vintage,
	);

	/** The log track, anchored at the youngest vintage; built over the same baseline the slider gets. */
	protected readonly scale = computed(() => wineSliderScale(RULE_ID, this.baseline()));

	/** The painted handle span — written on drag, re-seeded on settle. `null` means no constraint. */
	protected readonly span = adoptCommittedRule<InSetRule<number>, NumericBounds | null>(
		this._engine,
		() => RULE_ID,
		(rule) => (rule === undefined ? null : vintageBoundsFromSet(rule.config.set, this.baseline())),
	);

	/** The current bundle, or `null` before the first round trip — and in isolation tests. */
	private readonly _currentBundle = computed(() => this._bundle?.current() ?? null);

	/** The lower handle — the committed bound, or the baseline edge when this facet carries no rule. */
	protected readonly valueMin = computed(() => this.span()?.min ?? this.baseline().min);

	/** @see valueMin */
	protected readonly valueMax = computed(() => {
		const current = this.span();

		return current !== null && Number.isFinite(current.max) ? current.max : this.baseline().max;
	});

	/** The filtered-except-self bounds, or `undefined` to fall back to the whole baseline track. */
	protected readonly available = computed(
		() => fieldBounds(this._currentBundle(), RULE_ID) ?? undefined,
	);

	/**
	 * The per-vintage distribution, sliced into equal pieces of the log track.
	 *
	 * @remarks
	 * The bundle carries one bucket per year; `wineSliderHistogram` sums them into the track's slices,
	 * so recent years get bars of their own and the sparse early decades share a few.
	 */
	protected readonly histogram = computed(() =>
		wineSliderHistogram(this._currentBundle(), RULE_ID, this.baseline(), this.valueMin(), this.valueMax()),
	);

	/**
	 * Commit a dragged span as the set of years it covers.
	 *
	 * @param next - The new bounds.
	 */
	protected handleChange(next: RangeSliderChange): void {
		this.leaveExpressionMode()();
		// Locally first — the engine's own value lags a worker round trip.
		this.span.set({ max: next.max, min: next.min });
		commitRule(
			this._engine,
			RULE_ID,
			inSet<number>(RULE_ID, vintageYearsFromRange(next, this.baseline())),
		);
	}
}
