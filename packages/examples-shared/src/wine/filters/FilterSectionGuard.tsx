/**
 * `<FilterSectionGuard />` — wraps the scrollable filter stack and applies the global "computing"
 * disabled state.
 *
 * @remarks
 * By design, ALL filter inputs go dim + non-interactive while a bundle round-trip is pending. A
 * single `pointer-events: none` + opacity overlay on the entire filter scroll container achieves this
 * without threading a `disabled` prop into every control (which would touch ChipToggleGroup,
 * CheckboxList, HierarchicalPicker, SearchInput, and RangeSlider with the same pattern).
 *
 * **Scope.** The guard intentionally does NOT cover `<PanelHeader />` — the user should always be
 * able to recover, and clear-all itself triggers a new round-trip anyway. (The clear-all
 * affordance lives in `<ResultsHeader />`'s active-filters bar.)
 *
 * ## `pointer-events: none` is a MOUSE affordance; `inert` handles the keyboard
 *
 * The modifier class blocks click and drag, not the keyboard: `pointer-events: none` removes an
 * element as a hit-test target and has no bearing on the focus order. Without `inert`, a keyboard
 * user could Tab straight into the dormant sections and operate controls the engine is ignoring.
 *
 * All six wine panels use the same mechanism, gated on expression mode ALONE — Vue's `:inert`,
 * SvelteKit's `inert={…}`, Angular's `[attr.inert]`, vanilla's `toggleAttribute('inert', …)`, and
 * the `inert` prop below for both React apps.
 *
 * **Expression mode only, deliberately — and that is the load-bearing half.** `inert` blurs
 * whatever is focused inside it. Expression mode is a durable state the user chose, so losing focus
 * to it is coherent; "computing" is a transient that resolves in a few hundred milliseconds, and
 * applying `inert` there would rip focus out from under a keyboard user on every single commit.
 * Mouse users would never notice the difference. That asymmetry is why the two states do not share
 * a mechanism, and it is written the same way on Vue's and vanilla's panels.
 *
 * @packageDocumentation
 */

import { useMode } from '@filter-enginez/react-signals';

import { useIsEngineBusy } from '../engineBusy.js';

/**
 * The filter scroll container guard — dims + locks its children while the engine is computing OR while
 * a smart-filter preset holds the engine in expression mode (which makes the flat-map sections
 * dormant). `<SmartFilterPresets />` sits OUTSIDE this guard, so there's always a way back.
 */
export const FilterSectionGuard = ({ children, topSlot }: { readonly children: React.ReactNode; readonly topSlot?: React.ReactNode }): React.ReactElement => {
	const isComputing = useIsEngineBusy();
	const isExpressionMode = useMode() === 'expression';
	// Expression mode dims HARDER than computing (0.4 vs 0.55), and the two say different things:
	// "these are dormant while a preset drives the results" versus "hold on, recomputing". Both
	// modifiers set `pointer-events: none`, which blocks click and drag — and, on its own, nothing
	// a keyboard does. See the `inert` note in the module docblock.
	let modifier = '';

	if (isExpressionMode) {
		modifier = ' fe-filter-panel__body--expression';
	} else if (isComputing) {
		modifier = ' fe-filter-panel__body--busy';
	}

	return (
		<div className="fe-filter-panel__scroller">
			{/* `topSlot` (the smart-filter presets) scrolls with the panel but stays interactive, so the
			    user can always switch / clear the active expression; only the manual sections below dim +
			    lock. That is why the presets sit OUTSIDE the guarded body rather than inside it — `inert`
			    below would otherwise take the escape hatch with everything else. */}
			{topSlot}
			{/* `inert` is what actually locks this subtree: it removes every descendant from the focus
			    order, so the modifier class handles the pointer and this handles the keyboard. React 19
			    renders a boolean `inert` as the bare attribute, which is byte-identical to what the other
			    four verticals emit — the shared e2e suite asserts `inert=""` on all five. */}
			<div className={`fe-filter-panel__body${modifier}`} inert={isExpressionMode} aria-busy={isComputing}>
				{children}
			</div>
		</div>
	);
};
