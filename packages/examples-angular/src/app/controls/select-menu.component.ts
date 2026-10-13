/**
 * `<fe-select-menu>` — a labelled `<select>` over the shared `fe-select` classes.
 *
 * @remarks
 * The Angular counterpart to react-ui's, Vue's and Svelte's `<SelectMenu>`. All styling comes from
 * `@filter-enginez/ui-styles` — the chrome, the focus ring, the suppressed native arrow and the drawn
 * one — so this component contributes markup and nothing else.
 *
 * The placeholder is a real `<option value="">`, not a `disabled` one: for these filters "no
 * selection" is a legitimate state meaning "this facet is off", so the user has to be able to return
 * to it. A disabled placeholder would make the filter one-way.
 *
 * ### Why the selection is bound per-OPTION rather than once on the `<select>`
 *
 * Every other framework's version of this control binds `value` on the select element itself, and
 * that is the obvious translation. In Angular it silently does not work. A property binding on a host
 * element is applied in template order *before* the `@for` inside it materializes its views, so the
 * very first change-detection pass assigns `select.value = 'x'` to a select with no options — the
 * browser drops it, `value` reverts to the empty string, and the binding never re-runs because from
 * Angular's point of view the bound value never changed. The control would open on the placeholder no
 * matter what the parent passed, and only on first paint, which is the hardest kind of bug to catch.
 *
 * Binding `selected` on each option instead inverts the ordering problem out of existence: the
 * bindings live on the option views themselves, so they cannot run before those views exist. Vue and
 * React get away with the obvious form only because both mount children before applying element
 * props.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/** One entry in the menu. Structural, so call sites can pass their own readonly literals. */
export interface SelectMenuOption {
	/** Visible text. */
	readonly label: string;
	/** The value emitted when this entry is chosen. */
	readonly value: string;
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-select-menu',
	template: `
		<div class="fe-select">
			<select
				class="fe-select__field"
				[attr.aria-label]="selectLabel()"
				(change)="onChange($event)"
			>
				@if (placeholder() !== undefined) {
					<option value="" [selected]="value() === ''">{{ placeholder() }}</option>
				}
				@for (option of options(); track option.value) {
					<option [value]="option.value" [selected]="value() === option.value">
						{{ option.label }}
					</option>
				}
			</select>
			<!--
				fe-select__chevron, not a text glyph. ui-styles positions THIS class (absolute, right: 10px);
				a made-up class name renders unstyled and lands flush against the border. Geometry copied from
				React's SelectMenu so the two match.
			-->
			<svg
				class="fe-select__chevron"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="m6 9 6 6 6-6" />
			</svg>
		</div>
	`,
})
export class SelectMenuComponent {
	/** The selectable options, in display order. */
	public readonly options = input.required<readonly SelectMenuOption[]>();

	/** Optional "no selection" label. Omit it and the facet has no off switch. */
	public readonly placeholder = input<string>();

	/**
	 * Accessible name for the select.
	 *
	 * @remarks
	 * `selectLabel`, not `ariaLabel` — a control's label prop is named after the thing it labels, so
	 * the name survives being read next to `listLabel`, `groupLabel` and `scrollRegionLabel` on the
	 * sibling controls. The convention also sidesteps the template-type-checking trap the Vue port
	 * documents, where an `aria-label` binding is matched against the global HTML aria typing before a
	 * prop of the same name.
	 */
	public readonly selectLabel = input.required<string>();

	/** The selected value, or `''` for the placeholder. */
	public readonly value = input.required<string>();

	/**
	 * Emitted with the newly-chosen value. The caller owns the underlying rule.
	 *
	 * @remarks
	 * Named for the input it pairs with rather than after the DOM event, which makes `[(value)]` work
	 * at the call site — and which `@angular-eslint/no-output-native` requires anyway, since an output
	 * called `change` would shadow the native event on any host that also listens for it.
	 */
	public readonly valueChange = output<string>();

	/** Read the new value off the native event, so the template stays free of casts. */
	protected onChange(event: Event): void {
		this.valueChange.emit((event.target as HTMLSelectElement).value);
	}
}
