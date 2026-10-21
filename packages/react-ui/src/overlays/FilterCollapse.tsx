/**
 * `<FilterCollapse />` — the filter sidebar card, with a "Filters" disclosure below the two-column
 * breakpoint.
 *
 * @remarks
 * Every app in the repo shows its filter panel the same way on a small viewport: an inline collapse
 * inside the sidebar card, opened by a "Filters" / "Hide filters" button, that pushes the results down
 * rather than covering them. At the breakpoint and up the card is the sticky sidebar, the panel is
 * always shown and there is no button. This is the React rendering of that one design; SvelteKit's
 * `WineView.svelte`, Angular's `<fe-filters-toggle>`, Vue and vanilla render the same markup.
 *
 * ### Hidden, never unmounted
 *
 * A closed panel keeps its place in the tree under the `hidden` attribute. Every control's local state
 * (a half-typed search, an expanded tree node, the real-estate map and its zoom) survives a close, an
 * engine-connected panel never re-subscribes, and `hidden` takes the subtree out of the accessibility
 * tree as well as out of view. `fe-filter-collapse` gets its `display` only through `:not([hidden])` in
 * `ui-styles`, which is what lets the attribute win: an authored `display` on the wrapper would paint a
 * "hidden" panel.
 *
 * ### The classes are the shared chrome
 *
 * `fe-books-app__sidebar` (the card), `fe-books-app__filters-toggle` (the button) and
 * `fe-filter-collapse` (the region) are the classes every other app composes, so one stylesheet lays
 * out all six. The `fe-books-app__*` prefix names the shared app shell, not the books dataset. The
 * button's icon, its two labels and its `aria-expanded` match the other apps' exactly, so the control
 * announces itself the same way to a screen reader whichever app renders it; `aria-controls` names the
 * region it discloses.
 *
 * The consumer decides `isCollapsible` (the React apps pass `!useIsDesktop()`), because this package
 * reads no browser globals. The component holds only the open/closed state, which starts closed, as
 * it does in every app.
 *
 * @packageDocumentation
 */

import { useId, useState } from 'react';

/**
 * Props for `<FilterCollapse />`.
 */
export interface FilterCollapseProps {
	/**
	 * Whether the panel collapses behind the "Filters" button: `true` below the two-column breakpoint.
	 * At `false` the button is not rendered and the panel is always shown.
	 */
	readonly isCollapsible: boolean;
	/** The filter panel. Rendered once and kept mounted whether shown or not. */
	readonly children: React.ReactNode;
}

/**
 * The filter sidebar card: the "Filters" disclosure button on small viewports, and the panel region
 * it shows and hides.
 */
export const FilterCollapse = (props: FilterCollapseProps): React.ReactElement => {
	const { children, isCollapsible } = props;
	const [isOpen, setIsOpen] = useState(false);
	const regionId = useId();

	return (
		<aside className="fe-books-app__sidebar">
			{isCollapsible ? (
				// `aria-expanded`, not `aria-pressed`: this discloses a region rather than latching a
				// setting, and assistive technology announces the two differently.
				<button
					type="button"
					className="fe-books-app__filters-toggle"
					aria-controls={regionId}
					aria-expanded={isOpen}
					onClick={() => {
						setIsOpen((isCurrentlyOpen) => !isCurrentlyOpen);
					}}
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
						<path d="M3 5h18M6 12h12M10 19h4" />
					</svg>
					{isOpen ? 'Hide filters' : 'Filters'}
				</button>
			) : null}
			<div id={regionId} className="fe-filter-collapse" hidden={isCollapsible && !isOpen}>
				{children}
			</div>
		</aside>
	);
};
