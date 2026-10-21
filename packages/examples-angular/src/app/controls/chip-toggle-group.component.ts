/**
 * `<fe-chip-toggle-group>` — a row of toggle chips with **predictive disable**.
 *
 * @remarks
 * The predictive-disable behavior is the engine showing off: before you click anything, each chip
 * already knows whether selecting it would empty the result set given every *other* active filter, and
 * dims itself if so. That projection arrives as an `ExclusionMap` computed by the engine's
 * `applyFiltersAndQuery` bundle — this component only renders it.
 *
 * **A selected chip is never unavailable.** Deselecting must always stay possible, or a person who
 * filters themselves into a corner has no way out. That rule is load-bearing, not cosmetic.
 *
 * **No whitespace between a chip's tags, its label and its badge.** Angular keeps one space for every
 * line break beside an interpolation, so a chip laid out over several lines would read
 * ` red (86,914) `.
 * Written tight, its text is `red(86,914)` and starts with its value, as in every other app
 * (`tests/tooling/filterPanelMarkupParity.test.ts`).
 *
 * @packageDocumentation
 */

import type { ExclusionMap } from '@filter-enginez/examples-shared/books-domain';

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-chip-toggle-group',
	template: `
		<div class="fe-chip-toggle" [class.fe-chip-toggle--capped]="isScrollable()">
			@for (option of options(); track option) {
				<button
					type="button"
					class="fe-chip"
					[class.fe-chip--selected]="isSelected(option)"
					[class.fe-chip--unavailable]="isUnavailable(option)"
					[disabled]="isUnavailable(option)"
					[attr.aria-pressed]="isSelected(option)"
					[attr.title]="titleFor(option)"
					(click)="toggled.emit(option)"
				>{{ labelFor(option) }}@if (shouldShowCount() && projectedCountFor(option) !== null && !isSelected(option)) {<span
							class="fe-chip__count"
							[class.fe-chip__count--unavailable]="isUnavailable(option)"
						>({{ projectedCountFor(option)?.toLocaleString() }})</span>}</button>
			}
		</div>
	`,
})
export class ChipToggleGroupComponent {
	/** Per-option projection from the engine's bundle. Absent means "no projection available". */
	public readonly exclusion = input<ExclusionMap>();

	/** Optional display transform (books uses it to turn `young-adult` into `young adult`). */
	public readonly formatLabel = input<(value: string) => string>();

	/** The chip vocabulary, in display order. */
	/**
	 * Cap the group's height and scroll it, for facets with a long vocabulary.
	 *
	 * @remarks
	 * Wine's varietal facet renders 60 chips; uncapped it pushes the eight sections below it off the
	 * panel. `.fe-chip-toggle--capped` is a `ui-styles` MODIFIER on this element rather than a wrapper,
	 * which is exactly what lets it be a boolean input instead of a change of markup shape at every
	 * call site. Vue and SvelteKit spell the same thing `scrollable`; the `is` prefix is this repo's
	 * boolean-naming rule.
	 */
	public readonly isScrollable = input<boolean>(false);
	public readonly options = input.required<readonly string[]>();

	/** Which options are currently selected. */
	public readonly selected = input.required<readonly string[]>();

	/** Whether to render the projected match count beside each unselected chip. */
	public readonly shouldShowCount = input<boolean>(false);

	/** Emitted with the option that was clicked; the parent owns the set arithmetic. */
	public readonly toggled = output<string>();

	/** Whether this option is currently part of the filter. */
	protected isSelected(option: string): boolean {
		return this.selected().includes(option);
	}

	/**
	 * Whether selecting this option would produce zero results — and it isn't already selected.
	 *
	 * @param option - The chip value.
	 * @returns `true` when the chip should render dimmed and disabled.
	 */
	protected isUnavailable(option: string): boolean {
		return (this.exclusion()?.get(option)?.wouldBeEmpty ?? false) && !this.isSelected(option);
	}

	/** Display text for the chip. */
	protected labelFor(option: string): string {
		return this.formatLabel()?.(option) ?? option;
	}

	/** How many records would survive if this chip were selected, or `null` when the engine has no projection. */
	protected projectedCountFor(option: string): number | null {
		return this.exclusion()?.get(option)?.projectedCount ?? null;
	}

	/** Hover explanation — why a chip is dim, or what selecting it would yield. */
	protected titleFor(option: string): string | undefined {
		if (this.isUnavailable(option)) {
			return `No matches for ${this.labelFor(option)} given your other filters`;
		}

		const count = this.projectedCountFor(option);

		if (this.shouldShowCount() && count !== null) {
			return `${count.toLocaleString()} would match`;
		}

		return undefined;
	}
}
