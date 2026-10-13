/**
 * `<ScrollRegion>` — a keyboard-focusable, named scroll container.
 *
 * @remarks
 * A vertically-scrollable region whose content is NOT itself interactive (a result grid of static
 * cards, a code block, …) is unreachable by keyboard unless the container itself is focusable — WCAG
 * 2.1.1, axe `scrollable-region-focusable`. This primitive wraps its children in a `role="group"` div
 * with `tabIndex={0}` and an accessible name, so the region can be tabbed to and scrolled with the
 * arrow keys.
 *
 * `role="group"` (a non-landmark grouping role) is deliberate: it PERMITS an accessible name —
 * unlike a bare `<div>`, on which `aria-label` is a prohibited attribute — while adding no
 * landmark-navigation noise. The project's `jsx-a11y/no-noninteractive-tabindex` preset is
 * configured to allow `tabIndex` on this role for exactly this pattern.
 *
 * Presentational + prop-driven: sizing/overflow come from the caller's `className` / `style` (e.g.
 * the grids' `flex-1 min-h-0 overflow-y-auto`), and the `ref` lands on the scroll element so
 * callers can drive scroll position + `IntersectionObserver` roots. Under React 19 `ref` is an ordinary
 * prop on a function component, so no `forwardRef` wrapper is needed.
 *
 * @packageDocumentation
 */

/**
 * Props for `<ScrollRegion>`.
 */
export interface ScrollRegionProps {
	/** Accessible name for the region — announced when it receives keyboard focus. */
	readonly ariaLabel: string;
	/** The scrollable content. */
	readonly children: React.ReactNode;
	/** Layout classes — typically the caller's overflow + flex sizing. */
	readonly className?: string;
	/**
	 * Ref to the underlying scroll element — for driving scroll position, or as an
	 * `IntersectionObserver` root.
	 */
	readonly ref?: React.Ref<HTMLDivElement>;
	/** Inline style — for dynamic sizing such as a `maxHeight` scroll cap. */
	readonly style?: React.CSSProperties;
}

/**
 * A focusable, named scroll container. Passes its `ref` through to the underlying scroll element.
 */
export const ScrollRegion = ({ ariaLabel, children, className, ref, style }: ScrollRegionProps): React.ReactElement => (
	<div ref={ref} role="group" aria-label={ariaLabel} tabIndex={0} className={className} style={style}>
		{children}
	</div>
);
