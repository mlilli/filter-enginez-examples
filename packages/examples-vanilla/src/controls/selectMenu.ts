/**
 * `controls/selectMenu` — a labelled `<select>` over the shared `fe-select` classes.
 *
 * @remarks
 * The framework-less counterpart to react-ui's, Vue's, Svelte's and Angular's `<SelectMenu>`. All
 * styling comes from `@filter-enginez/ui-styles` — the chrome, the focus ring, the suppressed native
 * arrow and the drawn one — so this builder contributes markup and nothing else.
 *
 * ### The placeholder is a real option, never a disabled one
 *
 * For these filters "no selection" is a legitimate state meaning *this facet is off*, so the user has
 * to be able to return to it. A `disabled` placeholder would make the filter one-way: pick a value
 * once and the only route back is a page reload or the results header's clear-all.
 *
 * ### The selection is bound per-OPTION, not by writing `select.value`
 *
 * Assigning `select.value` before the options exist is silently dropped — the browser has nothing to
 * match the string against, so `value` reverts to `''` and the menu opens on the placeholder no matter
 * what the caller passed. Nothing throws and nothing warns. Setting each option's `selected` property
 * as it is built makes the ordering problem impossible to have: the option carries its own
 * selectedness, and the select adopts it the moment the option is inserted. Angular's port documents
 * the same trap from the other direction, where its template-order rules force the same fix.
 *
 * @packageDocumentation
 */

import { el, svg } from '@filter-enginez/examples-shared/dom';

import type { Control } from './controls.js';

/** One entry in the menu. Structural, so call sites can pass their own readonly literals. */
export interface SelectMenuOption {
	/** Visible text. */
	readonly label: string;
	/** The value handed back when this entry is chosen. */
	readonly value: string;
}

/** Construction-time options for a select menu. */
export interface SelectMenuOptions {
	/** Called with the newly-chosen value. The caller commits the rule change. */
	readonly onChange: (next: string) => void;
	/**
	 * Accessible name for the select.
	 *
	 * @remarks
	 * `selectLabel`, not `ariaLabel` — a control's label prop is named after the thing it labels, never
	 * after the HTML attribute it happens to end up in, so the name still reads correctly beside
	 * `groupLabel`, `listLabel` and `scrollRegionLabel` on the sibling controls.
	 */
	readonly selectLabel: string;
	/** Optional "no selection" label. Omit it and the facet has no off switch. */
	readonly placeholder?: string;
}

/** State a select menu renders from. */
export interface SelectMenuState {
	/** The selectable entries, in display order. */
	readonly options: readonly SelectMenuOption[];
	/** The selected value, or `''` for the placeholder. */
	readonly value: string;
}

/**
 * Build a labelled `<select>` for single-choice facets.
 *
 * @param options - Label, change callback, and the optional placeholder.
 * @returns The mounted select menu; `update(state)` rebuilds the option list and the selection.
 */
export function createSelectMenu(options: SelectMenuOptions): Control<SelectMenuState> {
	const { onChange, placeholder, selectLabel } = options;

	const field = el('select', {
		attrs: { 'aria-label': selectLabel },
		className: 'fe-select__field',
		on: {
			change: (event) => {
				onChange((event.target as HTMLSelectElement).value);
			},
		},
	});

	const element = el('div', {
		children: [field, chevronIcon()],
		className: 'fe-select',
	});

	return {
		element,
		// `entries`, not `options` — the construction-time bag above already owns that name, and
		// shadowing it here would make the two impossible to tell apart at a glance.
		update: ({ options: entries, value }) => {
			field.replaceChildren(
				...(placeholder === undefined ? [] : [optionElement('', placeholder, value === '')]),
				...entries.map((entry) => optionElement(entry.value, entry.label, value === entry.value)),
			);
		},
	};
}

/**
 * One `<option>`, carrying its own selectedness.
 *
 * @remarks
 * `option.selected` is the IDL property, not the `selected` content attribute: the property survives
 * the select's own reset pass when the option is inserted, which is what makes this work before the
 * element is in the tree at all.
 *
 * @internal
 */
function optionElement(value: string, label: string, isSelected: boolean): HTMLOptionElement {
	const option = el('option', { attrs: { value }, text: label });

	option.selected = isSelected;

	return option;
}

/**
 * The drawn chevron.
 *
 * @remarks
 * `fe-select__chevron`, not a text glyph. ui-styles positions THIS class (absolute, `right: 10px`); a
 * made-up class name renders unstyled and lands flush against the border. Geometry copied from
 * react-ui's `<SelectMenu />` so every vertical draws the same arrow.
 *
 * @internal
 */
function chevronIcon(): SVGElement {
	return svg(
		'svg',
		{
			'aria-hidden': 'true',
			class: 'fe-select__chevron',
			fill: 'none',
			height: 14,
			stroke: 'currentColor',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			'stroke-width': 1.75,
			viewBox: '0 0 24 24',
			width: 14,
		},
		[svg('path', { d: 'm6 9 6 6 6-6' })],
	);
}
