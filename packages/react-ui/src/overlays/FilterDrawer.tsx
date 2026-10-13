/**
 * `<FilterDrawer />` — a mobile off-canvas panel for the filter controls.
 *
 * @remarks
 * Dumb + prop-driven: the consumer owns the `isOpen` state and the `onClose` handler; this
 * component only renders the overlay when open and manages the dialog's focus + dismissal
 * affordances. Intended for small viewports — the React apps render this below the two-column
 * breakpoint and a static sidebar at `lg:` and up, so `FilterDrawer` never has to know about
 * breakpoints itself.
 *
 * **Accessibility** (WCAG 2.1 AA):
 *   - `role="dialog"` + `aria-modal="true"` + an accessible name (`ariaLabel` or the `title`).
 *   - Focus moves into the panel on open and is **restored** to the previously-focused element
 *     (typically the trigger button) on close.
 *   - `Escape` closes; the scrim closes on click/tap (it's a real `<button>`, kept out of the tab
 *     order so it doesn't duplicate the header close in keyboard nav).
 *   - `Tab` / `Shift+Tab` are **trapped** within the panel.
 *
 * Styling: the `fe-filter-drawer*` classes in `@filter-enginez/ui-styles` (mobile-first; the slide +
 * scrim fade respect `prefers-reduced-motion`).
 */

import { useEffect, useRef } from 'react';

/** Selector for tabbable elements inside the panel (excludes `tabindex="-1"`). */
const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Props for `<FilterDrawer />`.
 */
export interface FilterDrawerProps {
	/** Whether the drawer is open. When false, nothing renders. */
	readonly isOpen: boolean;
	/** Called on any dismissal — Escape, scrim click, or the close button. */
	readonly onClose: () => void;
	/** Heading shown in the drawer header. Defaults to `Filters`. */
	readonly title?: string;
	/** Optional `aria-label` override for the dialog (defaults to `title`). */
	readonly ariaLabel?: string;
	/**
	 * Keep `children` mounted (but visually hidden + out of the a11y tree) while the drawer is
	 * closed, instead of unmounting them. Defaults to `false`.
	 *
	 * @remarks
	 * Use this when the drawer's contents own state or side effects that must survive a close — e.g.
	 * wine's `<WineFilterPanel />` drives the shared engine-busy resolver, so unmounting it
	 * on close would strand the "computing" indicator lit. The children keep a stable tree position
	 * (via keys) so toggling open/closed never remounts them.
	 */
	readonly keepMounted?: boolean;
	/** The drawer body — typically the filter panel. */
	readonly children: React.ReactNode;
}

/**
 * Mobile off-canvas filter drawer.
 */
export const FilterDrawer = (props: FilterDrawerProps): React.ReactElement | null => {
	const { ariaLabel, children, isOpen, keepMounted: shouldKeepMounted = false, onClose, title = 'Filters' } = props;
	const panelRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!isOpen) {
			return undefined;
		}
		// `activeElement` is `Element | null`; in any browser/jsdom it is at least `<body>`, an
		// HTMLElement, so the cast is safe and the restore call below never no-ops on `null`.
		const previouslyFocused = document.activeElement as HTMLElement | null;

		// Move focus into the panel on open (it's `tabIndex={-1}` so it can hold focus).
		/* v8 ignore next -- defensive: the panel ref is always attached by the time this open-effect runs */
		panelRef.current?.focus();

		const handleKeyDown = (event: KeyboardEvent): void => {
			if (event.key === 'Escape') {
				event.preventDefault();
				onClose();

				return;
			}
			if (event.key !== 'Tab') {
				return;
			}
			const panel = panelRef.current;

			/* v8 ignore next 3 -- defensive: the panel ref is attached whenever this handler is bound (drawer is open) */
			if (panel === null) {
				return;
			}
			const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
			const first = focusable[0];
			const last = focusable[focusable.length - 1];

			/* v8 ignore next 3 -- defensive: the header close button is always a tabbable child, so `focusable` is never empty */
			if (first === undefined || last === undefined) {
				return;
			}
			if (event.shiftKey && document.activeElement === first) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && document.activeElement === last) {
				event.preventDefault();
				first.focus();
			}
		};

		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('keydown', handleKeyDown);
			/* v8 ignore next -- defensive: `previouslyFocused` is always at least <body>, never null */
			previouslyFocused?.focus();
		};
	}, [isOpen, onClose]);

	// Unmount entirely when closed unless the caller opted into `keepMounted`, in which case we keep
	// rendering a hidden host (see the `--closed` modifier) so the children's mount survives.
	if (!isOpen && !shouldKeepMounted) {
		return null;
	}

	return (
		<div
			className={`fe-filter-drawer${isOpen ? '' : ' fe-filter-drawer--closed'}`}
			role={isOpen ? 'dialog' : undefined}
			aria-modal={isOpen ? 'true' : undefined}
			aria-label={isOpen ? ariaLabel ?? title : undefined}
		>
			{/* Scrim — click/tap to dismiss. A real <button> (natively interactive, so no clickable-div
			    a11y violation) held out of the tab order and hidden from assistive tech: it's a pure
			    pointer affordance, and keyboard / AT users dismiss via Escape or the labeled header ×.
			    Only present while open. */}
			{isOpen ? (
				<button
					key="scrim"
					type="button"
					tabIndex={-1}
					aria-hidden="true"
					className="fe-filter-drawer__scrim"
					onClick={onClose}
				/>
			) : null}
			{/* `key="panel"` (and `key="body"` below) pin the children to a stable tree position so
			    toggling the scrim / header on open/close never moves — and therefore never remounts —
			    the body when `keepMounted` is set. */}
			<div key="panel" ref={panelRef} tabIndex={-1} className="fe-filter-drawer__panel">
				{isOpen ? (
					<div key="header" className="fe-filter-drawer__header">
						<span className="fe-filter-drawer__title">{title}</span>
						<button
							type="button"
							className="fe-filter-drawer__close"
							onClick={onClose}
							aria-label="Close filters"
						>
							<svg
								viewBox="0 0 24 24"
								width="18"
								height="18"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.75"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d="M18 6 6 18M6 6l12 12" />
							</svg>
						</button>
					</div>
				) : null}
				<div key="body" className="fe-filter-drawer__body">{children}</div>
			</div>
		</div>
	);
};
