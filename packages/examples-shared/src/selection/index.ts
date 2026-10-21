/**
 * `@filter-enginez/examples-shared/selection` — flat multi-select semantics and the "Clear all"
 * gesture, belonging to no dataset and no framework.
 *
 * @remarks
 * Two questions every panel asks, and each earns this address the same way `./picker` and `./bounds`
 * do. Every chip group and checkbox list in the repo answers "the user clicked a value — what is the
 * next selection?", and every results header answers "the user clicked Clear all — what does the
 * engine do?" — six apps × three datasets, plus the shared React sections. Answering each once means a
 * fix reaches every one of those call sites.
 *
 * ### Why the CALLER owns this and not the control
 *
 * `<ChipToggleGroup>` and `<CheckboxList>` are prop-driven: they render a selection and emit
 * `onToggle(value)`. They never compute the next set, deliberately — the caller owns the rule, and
 * only the caller knows what an empty selection writes (a removal, for every `InSetRule` facet here).
 * So this cannot live in `react-ui` beside the controls; it belongs with the panels, which is
 * `examples-shared`.
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

/**
 * The minimum "Clear all" needs from a reactive facade: its imperative engine's `clearRules`.
 *
 * @remarks
 * Structural, so `SignalsEngine`, `RxJsEngine` and a bare `{ core }` all satisfy it, whichever
 * dataset they hold.
 */
export interface ClearableEngineHost {
	/** The imperative engine every reactive facade wraps. */
	readonly core: {
		/** Drop every rule, every group and the expression, as one action. */
		clearRules(): void;
	};
}

/**
 * Return a panel to neutral: every rule, every group and expression mode, in one engine action.
 *
 * @remarks
 * What every results header's "Clear all" calls, in every dataset and every app. `clearRules` rather
 * than a `removeRule` per known facet id, for three reasons a user can see:
 *
 *   1. **Nothing is missed.** A rule under an id no panel lists (a facet added later, a hand-edited
 *      `?f=` link) is cleared too, so no pill survives "Clear all".
 *   2. **One action.** The devtools log records one `RULES_CLEARED`, and one Undo brings the whole
 *      state back, the same in every app.
 *   3. **One change event.** The engine emits a single `reset`, which every reactive surface treats as
 *      a full re-read, so the controls, the pills and the count all refresh together, on the debounced
 *      server tier as much as on the worker.
 *
 * The busy mark comes first, so the computing indicator lights on the click's own frame. Each app
 * passes its own vertical's `markUserAction`, because each vertical owns one busy tracker.
 *
 * `clearRules` is the seam for a facade that routes the call somewhere first, such as the Redux app
 * dispatching it as a `forwardToEngine('clearRules')` intent so the Redux DevTools see it. It must
 * still end in the engine's `clearRules`.
 *
 * @param engine - The reactive facade.
 * @param markUserAction - The vertical's busy mark, called before the write.
 * @param clearRules - Performs the clear; the engine's own `clearRules` by default.
 */
export function clearAllFilters(
	engine: ClearableEngineHost,
	markUserAction: () => void,
	clearRules: () => void = () => {
		engine.core.clearRules();
	},
): void {
	markUserAction();
	clearRules();
}
