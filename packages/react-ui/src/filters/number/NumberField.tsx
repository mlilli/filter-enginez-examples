/**
 * `<NumberField />` — canonical numeric input, matching the `fe-number-field` block in
 * `@filter-enginez/ui-styles`.
 *
 * @remarks
 * **Commits on change, never per keystroke**, like every other app's number field. A number field
 * emits an input event per keystroke and mid-typing values are usually nonsense: typing "95" passes
 * through "9" first, which would filter for scores above nine and briefly show the whole corpus. So
 * the field holds the typed text as a draft and calls `onChange` only when the browser's `change`
 * event fires (a spinner step, or leaving an edited field), on blur, and on Enter, once per value.
 *
 * A blank or unparseable field is never emitted: leaving it puts the committed value back, because
 * `Number('')` is 0 and clearing the box to retype must not silently become a real threshold. The
 * draft re-syncs whenever `value` changes from outside. The focus border-swap and halo are pure CSS
 * (`:focus` on the `fe-number-field` class).
 *
 * Paired with `<SelectMenu />` in the `NumericComparisonRule` demo (operator + threshold).
 */

import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

/**
 * Props for `<NumberField />`.
 */
export interface NumberFieldProps {
	/** Current numeric value. */
	readonly value: number;
	/** Called with the parsed number when an edit is committed (blank / unparseable edits are ignored). */
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
	const [draft, setDraft] = useState(() => String(value));
	const [syncedFrom, setSyncedFrom] = useState(value);
	const inputRef = useRef<HTMLInputElement | null>(null);
	// The value last committed or adopted, so Enter, the native `change` and the blur that follow one
	// edit emit it once between them.
	const committedRef = useRef(value);

	// Adopt an outside change during render, so the field never paints the stale number first.
	if (!Object.is(syncedFrom, value)) {
		setSyncedFrom(value);
		setDraft(String(value));
	}

	/**
	 * Commit the field's text: emit a changed real number, otherwise put the committed value back.
	 *
	 * @param raw - The field's text.
	 */
	const commit = (raw: string): void => {
		const parsed = Number.parseFloat(raw);

		if (!Number.isFinite(parsed)) {
			setDraft(String(value));

			return;
		}
		if (Object.is(parsed, committedRef.current)) {
			return;
		}
		committedRef.current = parsed;
		onChange(parsed);
	};
	// The latest commit, for the native `change` listener registered once below. Seeded with this
	// render's `commit` and refreshed after every render, so the listener never sees a placeholder.
	const commitRef = useRef(commit);

	useEffect(() => {
		committedRef.current = value;
	}, [value]);

	useEffect(() => {
		commitRef.current = commit;
	});

	// React's `onChange` on an input is the per-keystroke `input` event; the native `change` event is
	// the one that means "the value is settled" (a spinner step, or leaving an edited field).
	useEffect(() => {
		const input = inputRef.current;

		/* v8 ignore next 3 -- defensive: the ref is attached before effects run */
		if (input === null) {
			return undefined;
		}
		const handleNativeChange = (): void => {
			commitRef.current(input.value);
		};

		input.addEventListener('change', handleNativeChange);

		return () => {
			input.removeEventListener('change', handleNativeChange);
		};
	}, []);

	return (
		<input
			ref={inputRef}
			type="number"
			className="fe-number-field"
			value={draft}
			aria-label={ariaLabel}
			min={min}
			max={max}
			step={step}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={(event) => commit(event.target.value)}
			onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					commit(event.currentTarget.value);
				}
			}}
		/>
	);
};
