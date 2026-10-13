/**
 * `<HeaderIconButton />` — the square icon button the page headers use for undo / redo.
 *
 * @remarks
 * Transparent at rest, tinting to `--gray-2` on hover, and visibly inert when disabled — which it
 * routinely is, since undo with an empty action log has nothing to step to. It stays a real
 * `<button disabled>` rather than a hidden or removed element: a control that vanishes when it cannot
 * act teaches nobody that time travel exists, and it reflows the header every time the log empties.
 *
 * Sizing is a PROP, not a constant. The header renders 36px on desktop and 44px on touch, per the
 * mobile-first ≥44px target rule, and the two are chosen by the parent's `useIsDesktop()`.
 *
 * Shared by every React app shell — wine, books and real estate, in both React apps.
 *
 * @packageDocumentation
 */

/**
 * Props for {@link HeaderIconButton}.
 */
export interface HeaderIconButtonProps {
	/** The icon. An inline SVG, sized by the caller. */
	readonly children: React.ReactNode;
	/** Whether the action is currently unavailable. */
	readonly disabled?: boolean;
	/** Accessible name AND tooltip — the button has no visible text. */
	readonly label: string;
	/** Invoked on click. Never called while disabled. */
	readonly onClick: () => void;
	/** Edge length in pixels. 36 on desktop, 44 on touch. */
	readonly sizePx: number;
}

/**
 * A square, icon-only header button.
 */
export const HeaderIconButton = (props: HeaderIconButtonProps): React.ReactElement => {
	const { children, disabled: isDisabled = false, label, onClick, sizePx } = props;

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={isDisabled}
			title={label}
			aria-label={label}
			className="inline-flex items-center justify-center transition-colors"
			style={{
				background: 'transparent',
				border: '1px solid transparent',
				borderRadius: 'var(--radius-md)',
				color: isDisabled ? 'var(--gray-6)' : 'var(--gray-8)',
				cursor: isDisabled ? 'not-allowed' : 'pointer',
				height: `${String(sizePx)}px`,
				padding: 0,
				width: `${String(sizePx)}px`,
			}}
			// Hover AND focus, in step. Hover alone would give a keyboard user tabbing along the header
			// the focus ring and none of the fill the mouse user gets — a quieter affordance for the
			// people who most need the loud one. `jsx-a11y` flags exactly
			// this pairing, and it is right to.
			onMouseOver={(event) => {
				applyHoverStyle(event.currentTarget, isDisabled);
			}}
			onFocus={(event) => {
				applyHoverStyle(event.currentTarget, isDisabled);
			}}
			onMouseOut={(event) => {
				clearHoverStyle(event.currentTarget);
			}}
			onBlur={(event) => {
				clearHoverStyle(event.currentTarget);
			}}
		>
			{children}
		</button>
	);
};

/**
 * Paint the raised state on hover or focus.
 *
 * @remarks
 * Inline style rather than a CSS class because the whole button is inline-styled — the two React
 * apps are the Tailwind ones, and this control has no `ui-styles` block. A `fe-header-icon-button`
 * block would replace these two helpers.
 *
 * @param element - The button.
 * @param isDisabled - When `true`, nothing is painted; a disabled control must not look pressable.
 *
 * @internal
 */
function applyHoverStyle(element: HTMLButtonElement, isDisabled: boolean): void {
	if (isDisabled) {
		return;
	}
	element.style.background = 'var(--gray-2)';
	element.style.borderColor = 'var(--gray-5)';
}

/**
 * Return the button to its resting state.
 *
 * @param element - The button.
 *
 * @internal
 */
function clearHoverStyle(element: HTMLButtonElement): void {
	element.style.background = 'transparent';
	element.style.borderColor = 'transparent';
}
