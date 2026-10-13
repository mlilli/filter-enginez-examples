/**
 * `<NumberField />` — canonical numeric input, matching the `fe-number-field` block in
 * `@filter-enginez/ui-styles`.
 *
 * @remarks
 * Pure presentational and **stateless**: the caller owns `value` + `onChange`. `onChange` fires with
 * the parsed number on every edit; a blank field (or an otherwise-unparseable value) is swallowed
 * rather than emitted as `NaN`, so the caller only ever sees real numbers and a mid-edit empty box
 * can't clobber the model. The focus border-swap + halo are pure CSS (`:focus` on the
 * `fe-number-field` class).
 *
 * Paired with `<SelectMenu />` in the `NumericComparisonRule` demo (operator + threshold).
 */

/**
 * Props for `<NumberField />`.
 */
export interface NumberFieldProps {
	/** Current numeric value. */
	readonly value: number;
	/** Called with the parsed number on each valid edit (blank / unparseable edits are ignored). */
	readonly onChange: (value: number) => void;
	/** Accessible name for the input (required). */
	readonly ariaLabel: string;
	/** Optional minimum (native `min` + spinner floor). */
	readonly min?: number;
	/** Optional maximum (native `max` + spinner ceiling). */
	readonly max?: number;
	/** Optional step granularity (native `step`). Defaults to `1`. */
	readonly step?: number;
}

/**
 * Canonical numeric input.
 */
export const NumberField = (props: NumberFieldProps): React.ReactElement => {
	const { ariaLabel, max, min, onChange, step = 1, value } = props;

	return (
		<input
			type="number"
			className="fe-number-field"
			value={value}
			aria-label={ariaLabel}
			min={min}
			max={max}
			step={step}
			onChange={(event) => {
				// `parseFloat` collapses both a blank field and any unparseable entry to `NaN`, so the
				// caller only ever sees a real number (and a mid-edit empty box can't emit `0`).
				const parsed = Number.parseFloat(event.target.value);

				if (Number.isNaN(parsed)) {
					return;
				}
				onChange(parsed);
			}}
		/>
	);
};
