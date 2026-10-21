/**
 * `<fe-filters-toggle>` — the mobile "Filters" button that opens and closes the inline filter collapse.
 *
 * @remarks
 * Rendered only below the `lg` breakpoint, where the filter panel collapses rather than being a
 * permanent sidebar; above it the panel is always open and this button would be a control with
 * nothing to control. The page owns that decision — see `viewport/desktop-breakpoint.ts` — and
 * simply does not render this component on desktop.
 *
 * ### Why it is a component and not three copies of nine lines of markup
 *
 * `/books`, `/books-server`, `/real-estate` and `/wine` all need the same button, the same 24×24
 * hamburger path and the same `'Hide filters' : 'Filters'` ternary, and the shared `<fe-result-grid>`
 * beside it exists on exactly the argument that a third copy is the line.
 * Consistency here is also user-visible in a way a helper usually is not: the icon, the label and the
 * `aria-expanded` wiring are the affordance, and one page drifting is one page where the collapse
 * announces itself differently to a screen reader.
 *
 * All styling is `fe-books-app__filters-toggle` from `@filter-enginez/ui-styles`. That prefix is the
 * documented misnomer for the SHARED app chrome every vertical composes — header, footer, brand,
 * this button — and it must not be copied under a per-dataset name.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-filters-toggle',
	template: `
		<!--
			aria-expanded, not aria-pressed: this discloses a region rather than latching a setting, and
			the two are announced differently. The panel it controls is hidden with the hidden attribute
			rather than removed, so the relationship is a real disclosure the whole way down.
		-->
		<button
			type="button"
			class="fe-books-app__filters-toggle"
			[attr.aria-expanded]="isOpen()"
			(click)="toggled.emit()"
		>
			<svg
				viewBox="0 0 24 24"
				width="18"
				height="18"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M3 5h18M6 12h12M10 19h4" />
			</svg>
			{{ isOpen() ? 'Hide filters' : 'Filters' }}
		</button>
	`,
})
export class FiltersToggleComponent {
	/** Whether the collapse is currently open. Drives both the label and `aria-expanded`. */
	public readonly isOpen = input.required<boolean>();

	/**
	 * Emitted on click. The page owns the state; this component holds none.
	 *
	 * @remarks
	 * No type argument, deliberately. `output<void>()` is the obvious spelling and
	 * `@typescript-eslint/no-invalid-void-type` rejects it — reasonably, since `void` as a type
	 * argument means "a value nobody may use" rather than "no value". A bare `output()` already
	 * produces a valueless emitter, so there is nothing to say.
	 */
	public readonly toggled = output();
}
