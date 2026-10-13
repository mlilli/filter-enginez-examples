/**
 * `<SelectMenu />` — canonical single-select dropdown (a styled native `<select>` with a custom
 * chevron), matching the `fe-select` block in `@filter-enginez/ui-styles`.
 *
 * @remarks
 * Pure presentational and **stateless**: the caller owns `value` + `onChange`. The native arrow is
 * suppressed (`appearance: none`) in favor of a CSS-positioned chevron, and the focus border-swap +
 * halo are pure CSS (`:focus-within` on the `fe-select` classes), so the component holds no state.
 * A native `<select>` keeps full keyboard + screen-reader semantics for free (it reports as an ARIA
 * `combobox` with the supplied `ariaLabel`).
 *
 * **`value` + placeholder.** `value` is the currently-selected option value; pass `''` for "nothing
 * selected". When `placeholder` is supplied it renders as a leading empty-value option (`value=""`),
 * so the caller can model an explicit "off" / "any" state and map it back to a rule removal.
 *
 * Paired with `<NumberField />` in the `NumericComparisonRule` demo (operator + threshold).
 */

/**
 * A single selectable option.
 */
export interface SelectOption {
	/** The option's value — the string handed back to `onChange`. */
	readonly value: string;
	/** The human-readable option text. */
	readonly label: string;
}

/**
 * Props for `<SelectMenu />`.
 */
export interface SelectMenuProps {
	/** The selectable options, in display order. */
	readonly options: readonly SelectOption[];
	/** The currently-selected option value (`''` when nothing is selected). */
	readonly value: string;
	/** Called with the newly-selected option value. */
	readonly onChange: (value: string) => void;
	/** Accessible name for the select (required — a `<select>` needs a name). */
	readonly ariaLabel: string;
	/** Optional leading empty-value option (models an explicit "off" / "any" choice). */
	readonly placeholder?: string;
}

/**
 * Canonical single-select dropdown.
 */
export const SelectMenu = (props: SelectMenuProps): React.ReactElement => {
	const { ariaLabel, onChange, options, placeholder, value } = props;

	return (
		<div className="fe-select">
			<select
				className="fe-select__field"
				value={value}
				aria-label={ariaLabel}
				onChange={(event) => onChange(event.target.value)}
			>
				{placeholder !== undefined ? <option value="">{placeholder}</option> : null}
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
			{/* Custom chevron — the native arrow is suppressed via `appearance: none`. */}
			<svg
				className="fe-select__chevron"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.75"
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="m6 9 6 6 6-6" />
			</svg>
		</div>
	);
};
