/**
 * `@filter-enginez/examples-shared/selection` — flat multi-select semantics, belonging to no dataset
 * and no framework.
 *
 * @remarks
 * One function, and it earns its own address the same way `./picker` and `./bounds` do. Every chip
 * group and checkbox list in the repo answers "the user clicked a value — what is the next selection?"
 * — six verticals × three datasets, plus the shared React sections. Answering it once means a fix to
 * the rule reaches every one of those call sites.
 *
 * ### Why the CALLER owns this and not the control
 *
 * `<ChipToggleGroup>` and `<CheckboxList>` are prop-driven: they render a selection and emit
 * `onToggle(value)`. They never compute the next set, deliberately — the caller owns the rule, and
 * only the caller knows whether an empty selection means "clear the facet" (every `InSetRule` here) or
 * "a rule that matches nothing". So this cannot live in `react-ui` beside the controls; it belongs
 * with the panels, which is `examples-shared`.
 *
 * That is also why this needs no re-export hop, unlike `./picker` and `./bounds`. Those two re-export
 * from `@filter-enginez/react-ui/bounds` because the definitions are genuinely react-ui's and
 * relocating them would invert the dependency. Nothing in `react-ui` wants this one.
 *
 * ### Its tree counterpart lives next door
 *
 * `toggleNodeSelection` in `./picker` is the same question for a HIERARCHY, where the answer involves
 * cascading into a subtree and de-cascading an ancestor into its siblings. The two are siblings in
 * intent and deliberately not one function: a flat group has no ancestry to consult, and folding the
 * tree's rules into it would make every chip group pay for a concept it does not have.
 *
 * @packageDocumentation
 */

/**
 * Add a value to a selection, or remove it when already present.
 *
 * @remarks
 * Returns a NEW array rather than mutating. Every consumer hands the result straight to a rule
 * factory, and the rules hold their config by reference — mutating a selection in place would edit
 * the rule already committed to the engine, so the next commit would compare a value against itself
 * and the change would not propagate.
 *
 * Order is append-on-add and stable-on-remove, which is user-visible in two places: the active-filter
 * chip summaries list values in selection order, and a `?f` link round-trips that order. Sorting here
 * would quietly reorder both.
 *
 * @typeParam T - The value type; a string union in every current call site.
 * @param current - The selection before the click.
 * @param value - The value the user toggled.
 * @returns The next selection.
 */
export function toggleSetValue<T>(current: readonly T[], value: T): T[] {
	return current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
}
