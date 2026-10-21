/**
 * `<SearchInput />` — canonical search input with magnifier icon + clear-X affordance, matching
 * `docs/branding/design-system/preview/inputs.html`.
 *
 * @remarks
 * Pure presentational and **stateless**: the caller owns `value` + `onChange`. The focus
 * border-swap + halo and the clear-X hover are CSS (`:focus-within` / `:hover` on the
 * `fe-search-input` classes in `@filter-enginez/ui-styles`), so the component needs no focus or
 * hover state and no `onFocus` / `onMouseOver/Out` handlers.
 *
 *   - 36px height, 12px horizontal padding, `--gray-1` bg, `--gray-5` border (→ `--accent` + a 3px
 *     `--accent-haze` halo on focus-within), `--radius-md` corners.
 *   - Magnifier icon left; clear-X right (visible only when there's text).
 *
 * **onChange vs onCommit:** `onChange` fires per keystroke (so the parent mirrors the text), and
 * `onCommit` fires on blur / Enter / clear. What each one does to the engine is the caller's: every
 * search section binds the two to `useTypeaheadSearch`, which turns keystrokes into a debounced
 * commit and the other three into an immediate one, never committing an unchanged query.
 */

/**
 * Props for `<SearchInput />`.
 */
export interface SearchInputProps {
	/** Current input value. */
	readonly value: string;
	/** Called on every keystroke so the parent can mirror the typed text in local state. */
	readonly onChange: (value: string) => void;
	/**
	 * Called when the user "commits" the value — on blur, Enter, or clear-X — for a commit that should
	 * land at once rather than after the typing pause. The clear path fires `onChange('')` then
	 * `onCommit('')`.
	 */
	readonly onCommit?: (value: string) => void;
	/** Placeholder text. */
	readonly placeholder?: string;
	/** Optional `aria-label` for the input. */
	readonly ariaLabel?: string;
}

/**
 * Canonical search input.
 */
export const SearchInput = (props: SearchInputProps): React.ReactElement => {
	const { ariaLabel, onChange, onCommit, placeholder, value } = props;

	return (
		<div className="fe-search-input">
			{/* Magnifier */}
			<svg
				className="fe-search-input__icon"
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
				<circle cx="11" cy="11" r="8" />
				<path d="m21 21-4.3-4.3" />
			</svg>
			{/* Input — `onChange` per keystroke, `onCommit` on blur / Enter. */}
			<input
				type="search"
				className="fe-search-input__field"
				value={value}
				placeholder={placeholder}
				aria-label={ariaLabel}
				onChange={(event) => onChange(event.target.value)}
				onBlur={(event) => onCommit?.(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						onCommit?.(event.currentTarget.value);
						event.currentTarget.blur();
					} else if (event.key === 'Escape') {
						event.currentTarget.blur();
					}
				}}
			/>
			{/* Clear-X — visible only when there's text; clears the parent mirror + commits empty. */}
			{value.length > 0 && (
				<button
					type="button"
					className="fe-search-input__clear"
					onClick={() => {
						onChange('');
						onCommit?.('');
					}}
					aria-label="Clear search"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.75"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M18 6 6 18M6 6l12 12" />
					</svg>
				</button>
			)}
		</div>
	);
};
