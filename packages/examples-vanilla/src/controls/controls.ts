/**
 * `controls/controls` — the chip-group, search-input, and checkbox controls, hand-built over the shared
 * `ui-styles` classes.
 *
 * @remarks
 * The framework-less counterparts to `react-ui`'s controls and their Vue / Svelte ports. Each builder
 * returns a `{ element, update }` pair: `element` is mounted once, and `update` re-applies state
 * in place. That split is what lets the two page wirings differ — `/books` calls a single control's
 * `update` when its signal fires, while `/books-raw` calls every `update` after one coarse change —
 * without either page knowing how the DOM is built.
 *
 * Markup + class names mirror the other verticals exactly, so all four render identically.
 *
 * @packageDocumentation
 */

import type { ExclusionMap } from '@filter-enginez/examples-shared/books-domain';

import { el, setHidden, svg } from '../dom.js';

/** A mounted control: a stable root element plus an in-place state updater. */
export interface Control<State> {
	/** The root element — appended once, never replaced. */
	readonly element: HTMLElement;
	/** Re-apply state in place. */
	readonly update: (state: State) => void;
}

/** State a chip group renders from. */
export interface ChipGroupState {
	/** All candidate values, in display order. */
	readonly options: readonly string[];
	/** Currently-selected values. */
	readonly selected: readonly string[];
	/** Predictive-disable data; chips that would empty the result set are subdued + disabled. */
	readonly exclusion?: ExclusionMap;
}

/** Construction-time options for a chip group. */
export interface ChipGroupOptions {
	/** Called with the clicked value; the caller commits the rule change. */
	readonly onToggle: (value: string) => void;
	/** Show projected-count badges on unselected chips when exclusion data is present. */
	readonly showCount?: boolean;
	/** Per-chip label formatter. Defaults to identity. */
	readonly formatLabel?: (value: string) => string;
	/**
	 * Cap the group's height and let it scroll.
	 *
	 * @remarks
	 * For a vocabulary too long to lay flat — wine's varietals are the only case. `ui-styles` supplies
	 * `fe-chip-toggle--capped` for exactly this, so it is a modifier rather than a second control.
	 */
	readonly scrollable?: boolean;
}

/**
 * Build a chip-toggle set for `InSet`-style filters, with exclusion-aware disabling.
 *
 * @remarks
 * A chip whose addition would empty the result set renders subdued + `disabled`, telling the user
 * "this would give zero matches" before they click. Selected chips always stay clickable so the user
 * can deselect to escape a dead end.
 *
 * @param options - Toggle callback + display options.
 * @returns The mounted chip group.
 */
export function createChipToggleGroup(options: ChipGroupOptions): Control<ChipGroupState> {
	const {
		formatLabel = (value: string): string => value,
		onToggle,
		scrollable: isScrollable = false,
		showCount: shouldShowCount = false,
	} = options;
	const element = el('div', {
		className: isScrollable ? 'fe-chip-toggle fe-chip-toggle--capped' : 'fe-chip-toggle',
	});

	return {
		element,
		update: ({ exclusion, options: values, selected }) => {
			element.replaceChildren(
				...values.map((value) => {
					const isSelected = selected.includes(value);
					const data = exclusion?.get(value);
					const isUnavailable = (data?.wouldBeEmpty ?? false) && !isSelected;
					const label = formatLabel(value);
					const classNames = ['fe-chip'];

					if (isSelected) {
						classNames.push('fe-chip--selected');
					}
					if (isUnavailable) {
						classNames.push('fe-chip--unavailable');
					}

					return el('button', {
						attrs: {
							'aria-pressed': isSelected,
							disabled: isUnavailable ? 'true' : null,
							title: chipTitle(label, data?.projectedCount, isUnavailable, shouldShowCount),
							type: 'button',
						},
						children: [
							label,
							shouldShowCount
							&& data !== undefined
							&& !isSelected
							&& el('span', {
								className: isUnavailable
									? 'fe-chip__count fe-chip__count--unavailable'
									: 'fe-chip__count',
								text: `(${data.projectedCount.toLocaleString()})`,
							}),
						],
						className: classNames.join(' '),
						on: {
							click: () => {
								onToggle(value);
							},
						},
					});
				}),
			);
		},
	};
}

/** Construction-time options for a search input. */
export interface SearchInputOptions {
	/** Fires per keystroke so the caller can mirror the typed text. */
	readonly onChange: (value: string) => void;
	/** Fires on blur / Enter / clear — where expensive engine work belongs. */
	readonly onCommit: (value: string) => void;
	/** Placeholder text. */
	readonly placeholder?: string;
	/** Accessible name for the field. */
	readonly ariaLabel?: string;
}

/**
 * Build a search input with a magnifier icon and a clear-X affordance.
 *
 * @remarks
 * `onChange` fires per keystroke (mirror the text); `onCommit` fires on blur, Enter, or clear — so the
 * engine recomputes once per committed query rather than once per character. The focus halo and the
 * clear-X hover are pure CSS, so this holds no state beyond the field value.
 *
 * @param options - Change/commit callbacks + display options.
 * @returns The mounted search input; `update(value)` sets the field text.
 */
export function createSearchInput(options: SearchInputOptions): Control<string> {
	const { ariaLabel, onChange, onCommit, placeholder } = options;

	const field = el('input', {
		attrs: {
			'aria-label': ariaLabel ?? null,
			placeholder: placeholder ?? null,
			type: 'search',
		},
		className: 'fe-search-input__field',
		on: {
			blur: (event) => {
				onCommit((event.target as HTMLInputElement).value);
			},
			input: (event) => {
				const { value } = event.target as HTMLInputElement;

				syncClear(value);
				onChange(value);
			},
			keydown: (event) => {
				const keyEvent = event as KeyboardEvent;
				const target = keyEvent.currentTarget as HTMLInputElement;

				if (keyEvent.key === 'Enter') {
					keyEvent.preventDefault();
					onCommit(target.value);
					target.blur();
				} else if (keyEvent.key === 'Escape') {
					target.blur();
				}
			},
		},
	});

	const clearButton = el('button', {
		attrs: { 'aria-label': 'Clear search', type: 'button' },
		children: [
			svg(
				'svg',
				{
					fill: 'none',
					height: 14,
					stroke: 'currentColor',
					'stroke-linecap': 'round',
					'stroke-linejoin': 'round',
					'stroke-width': 1.75,
					viewBox: '0 0 24 24',
					width: 14,
				},
				[svg('path', { d: 'M18 6 6 18M6 6l12 12' })],
			),
		],
		className: 'fe-search-input__clear',
		on: {
			click: () => {
				field.value = '';
				syncClear('');
				onChange('');
				onCommit('');
			},
		},
	});

	/** Show the clear-X only when there is text (mirrors the other verticals' `v-if` / `{#if}`). */
	function syncClear(value: string): void {
		setHidden(clearButton, value.length === 0);
	}

	const element = el('div', {
		children: [magnifierIcon(), field, clearButton],
		className: 'fe-search-input',
	});

	syncClear('');

	return {
		element,
		update: (value) => {
			// Don't clobber what the user is actively typing; only re-sync on external change.
			if (field.value !== value) {
				field.value = value;
			}
			syncClear(value);
		},
	};
}

/** State a checkbox control renders from. */
export interface CheckboxState {
	/** Whether the box is checked. */
	readonly checked: boolean;
	/** Whether the control is disabled (its rule would empty the result set). */
	readonly disabled?: boolean;
}

/** Construction-time options for a checkbox control. */
export interface CheckboxOptions {
	/** Visible label text. */
	readonly label: string;
	/** Called with the next checked state. */
	readonly onToggle: (checked: boolean) => void;
}

/**
 * Build a labelled checkbox for `Boolean` / `Exists` / Bloom-membership toggles.
 *
 * @param options - Label + toggle callback.
 * @returns The mounted checkbox control.
 */
export function createCheckboxControl(options: CheckboxOptions): Control<CheckboxState> {
	const { label, onToggle } = options;
	const input = el('input', {
		attrs: { type: 'checkbox' },
		on: {
			change: (event) => {
				onToggle((event.target as HTMLInputElement).checked);
			},
		},
	});
	const element = el('label', {
		children: [input, el('span', { text: label })],
		className: 'fe-books-checkbox',
	});

	return {
		element,
		update: ({ checked, disabled = false }) => {
			input.checked = checked;
			input.disabled = disabled;
			element.className = disabled ? 'fe-books-checkbox fe-books-checkbox--disabled' : 'fe-books-checkbox';
		},
	};
}

/**
 * The magnifier glyph for {@link createSearchInput}.
 *
 * @internal
 */
function magnifierIcon(): SVGElement {
	return svg(
		'svg',
		{
			'aria-hidden': 'true',
			class: 'fe-search-input__icon',
			fill: 'none',
			height: 14,
			stroke: 'currentColor',
			'stroke-linecap': 'round',
			'stroke-linejoin': 'round',
			'stroke-width': 1.75,
			viewBox: '0 0 24 24',
			width: 14,
		},
		[svg('circle', { cx: 11, cy: 11, r: 8 }), svg('path', { d: 'm21 21-4.3-4.3' })],
	);
}

/**
 * The `title` tooltip for a chip: a dead-end explanation when unavailable, otherwise the projected
 * count when counts are shown.
 *
 * @internal
 */
function chipTitle(
	label: string,
	projectedCount: number | undefined,
	isUnavailable: boolean,
	shouldShowCount: boolean,
): string | null {
	if (isUnavailable) {
		return `No matches for ${label} given your other filters`;
	}
	if (shouldShowCount && projectedCount !== undefined) {
		return `${projectedCount.toLocaleString()} would match`;
	}

	return null;
}
