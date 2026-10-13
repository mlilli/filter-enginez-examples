/**
 * `<fe-checkbox-control>` — one labelled checkbox in the toggles row.
 *
 * @remarks
 * Its `isDisabled` input carries the same predictive-disable idea as the chips, arrived at by a
 * cheaper route: checkboxes are binary, so instead of consulting the engine's projection bundle the
 * panel just asks `toggleWouldBeEmpty(results, candidateRule)` against a prebuilt candidate. One pass
 * over the current results beats a full re-query for a single yes/no.
 *
 * ### No `styles` block, deliberately
 *
 * `.fe-books-checkbox` lives in `ui-styles`, including the `min-height` that gives the row the same
 * 44px touch target every vertical has. A scoped copy here would be a second definition free to
 * diverge from it, and the touch target is the first thing such a copy tends to lose.
 *
 * Angular's emulated encapsulation scopes a component's OWN styles; it does not shield the component
 * from GLOBAL stylesheets, so `ui-styles` reaches this markup unaided. There is no
 * accessibility-versus-DRY tension here.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-checkbox-control',
	template: `
		<label
			class="fe-books-checkbox"
			[class.fe-books-checkbox--disabled]="isDisabled()"
			[attr.title]="isDisabled() ? 'No matches given your other filters' : null"
		>
			<input
				type="checkbox"
				[checked]="isChecked()"
				[disabled]="isDisabled()"
				(change)="onChange($event)"
			/>
			{{ label() }}
		</label>
	`,
})
export class CheckboxControlComponent {
	/** Whether the filter is on. */
	public readonly isChecked = input.required<boolean>();

	/** Whether turning it on would empty the result set. */
	public readonly isDisabled = input<boolean>(false);

	/** Visible label text. */
	public readonly label = input.required<string>();

	/** Emits the NEXT checked state. */
	public readonly toggled = output<boolean>();

	/** Relay the native change as a typed boolean. */
	protected onChange(event: Event): void {
		this.toggled.emit((event.target as HTMLInputElement).checked);
	}
}
