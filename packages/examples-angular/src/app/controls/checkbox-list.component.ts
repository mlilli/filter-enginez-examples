/**
 * `<fe-checkbox-list>` — scrollable checkbox list for high-cardinality InSet filters, with
 * exclusion-aware disabling and projected counts.
 *
 * @remarks
 * The Angular port of react-ui's, Vue's and Svelte's `<CheckboxList>`, reusing the
 * `fe-checkbox-list*` classes verbatim.
 *
 * **Why not `<fe-chip-toggle-group>`.** Chips wrap and are scannable at a dozen or so values; a facet
 * with a hundred (real estate's school districts) becomes an unreadable wall that pushes every
 * section below it off screen. A capped, scrolling list keeps the facet browsable and the panel
 * navigable.
 *
 * **Exclusion-aware disabling** matches `<fe-chip-toggle-group>` exactly, deliberately — the two
 * controls differ in layout, not in semantics. A row whose selection would empty the result set is
 * subdued (`--unavailable`) and disabled, so the user learns "zero matches" before clicking. Selected
 * rows always stay clickable, or a user who filtered themselves into a corner would have no way out.
 *
 * **`<label>`-wrapped input, not a `<button role="checkbox">`** — this is a plain binary choice, so
 * the native control carries the state, the keyboard behavior and the announcement for free. The
 * tri-state hierarchical picker needs the button treatment because `aria-checked="mixed"` has no
 * native equivalent; nothing here is mixed.
 *
 * @packageDocumentation
 */

import type { ChipExclusion, ExclusionMap } from '@filter-enginez/examples-shared/bundle-readers';

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-checkbox-list',
	template: `
		<div class="fe-checkbox-list" [style.max-height]="maxHeight()">
			@for (option of options(); track option) {
				<label
					class="fe-checkbox-list__row"
					[class.fe-checkbox-list__row--selected]="isSelected(option)"
					[class.fe-checkbox-list__row--unavailable]="isUnavailable(option)"
					[attr.title]="titleFor(option)"
				>
					<span class="fe-checkbox-list__main">
						<input
							type="checkbox"
							class="fe-checkbox-list__box"
							[checked]="isSelected(option)"
							[disabled]="isUnavailable(option)"
							(change)="toggled.emit(option)"
						/>
						<span class="fe-checkbox-list__label">{{ option }}</span>
					</span>
					@if (badgeFor(option) !== null) {
						<span
							class="fe-checkbox-list__count"
							[class.fe-checkbox-list__count--unavailable]="isUnavailable(option)"
						>
							{{ badgeFor(option) }}
						</span>
					}
				</label>
			}
		</div>
	`,
})
export class CheckboxListComponent {
	/** Optional exclusion data. Rows whose selection would yield zero results are disabled + subdued. */
	public readonly exclusion = input<ExclusionMap>();

	/** Cap on the scroller's height, as a CSS length. Beyond this the list scrolls. */
	public readonly maxHeight = input<string>('16rem');

	/** All candidate values, in display order. */
	public readonly options = input.required<readonly string[]>();

	/** Currently-selected values. */
	public readonly selected = input.required<readonly string[]>();

	/**
	 * If `true` and exclusion is provided, show projected-count badges on unselected rows.
	 *
	 * @remarks
	 * Vue calls this `showCount`; the Angular name matches the sibling `<fe-chip-toggle-group>`, whose
	 * identical flag is `shouldShowCount`. Two spellings of one concept inside one control library is
	 * the drift worth avoiding, and this vertical's existing spelling is the one that wins.
	 */
	public readonly shouldShowCount = input<boolean>(false);

	/** Emitted when a row is toggled. The caller owns the underlying rule. */
	public readonly toggled = output<string>();

	/**
	 * The projected-count badge text, or `null` when no badge should render.
	 *
	 * @remarks
	 * Folded into one accessor rather than left as the template's three-way condition: the template
	 * would otherwise have to prove the exclusion entry exists and then read it again to format it,
	 * which in Vue needed a non-null assertion. The repo forbids those, and `null` says the same thing
	 * without one.
	 *
	 * @param option - The row's value.
	 * @returns Localized count text, or `null` to render no badge.
	 */
	protected badgeFor(option: string): string | null {
		const datum = this.exclusionData(option);

		if (!this.shouldShowCount() || datum === undefined || this.isSelected(option)) {
			return null;
		}

		return datum.projectedCount.toLocaleString();
	}

	/** The engine's projection for one row, if the bundle covered it. */
	protected exclusionData(option: string): ChipExclusion | undefined {
		return this.exclusion()?.get(option);
	}

	/** Whether this option is currently part of the filter. */
	protected isSelected(option: string): boolean {
		return this.selected().includes(option);
	}

	/** Whether selecting this option would produce zero results — and it isn't already selected. */
	protected isUnavailable(option: string): boolean {
		return (this.exclusionData(option)?.wouldBeEmpty ?? false) && !this.isSelected(option);
	}

	/** Hover explanation for a dimmed row; `null` leaves the attribute off entirely. */
	protected titleFor(option: string): string | null {
		return this.isUnavailable(option)
			? `No matches for ${option} given your other filters`
			: null;
	}
}
