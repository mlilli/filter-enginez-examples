/**
 * `adoptCommittedRule` — the writable control state a WORKER-TIER panel needs.
 *
 * @remarks
 * ## Why this exists, and why real estate has nothing like it
 *
 * `real-estate-filter-panel.component.ts` states the house rule in bold: **"Selection is DERIVED,
 * never mirrored."** Every one of its fourteen controls reads its value straight back out of
 * `activeRules$`, so "Clear all", a chip removed in the results header and a `?f` URL restore all
 * reach the controls for free, with no second copy of the truth to drift.
 *
 * That rule is right for real estate and **wrong for wine**, and the difference is the worker. Real
 * estate filters on the main thread, so a commit and its settle land in the same frame and a pure
 * derivation never visibly lags. Wine's `.core` mutations are fire-and-forget across a Comlink
 * boundary: `activeRules$` only re-emits after an awaited round trip against 150k records. A pure
 * `computed` off the rule would therefore flick the clicked chip back OFF — or snap a dragged slider
 * handle backwards — for the length of that trip, on every single interaction.
 *
 * So wine paints locally and ADOPTS the engine afterwards, which is a **writable derived**: seeded
 * from the engine, written on interaction, re-synced when the engine moves on its own. Svelte spells
 * that `$derived` with an assignment; Vue has no such construct and spells it `ref` + a one-way
 * `watch`. Angular has `linkedSignal`, and this app already uses it for the identical job — the
 * devtools panel's optimistic time-travel cursor, whose docblock makes the same argument about the
 * same worker.
 *
 * ## Why `linkedSignal` and not `signal` + an adopt `effect`
 *
 * The hand-rolled version is one line longer and several traps deeper. Its correctness rests on the
 * effect reading ONLY the committed value — read the painted signal too and it re-runs on every local
 * write, reads the still-stale engine value, and snaps the control straight back. Vue's docblock
 * forbids `watchEffect` for precisely this reason and Svelte's forbids an adopt `$effect`; both are
 * warning about a hazard `linkedSignal` does not have, because the source computation is the only
 * thing tracked by construction.
 *
 * It also seeds correctly for free. `/wine` calls `core.loadConfig(urlConfig)` before the panel
 * mounts, so a control that started neutral would render blank over correctly-filtered results, and
 * the next click would commit a one-element set — silently discarding everything the shared link
 * restored. `linkedSignal` computes lazily on first read, which is after inputs are bound, so a
 * section can seed from an input-driven rule id. An eager `signal(committed())` in a field
 * initializer cannot: `input.required` throws when read before Angular has set it.
 *
 * ## Not the short form of `linkedSignal`. The short form is wrong here, and quietly
 *
 * `linkedSignal(() => read(activeRules().get(id)))` reads as the obvious spelling and fails a test
 * this module ships. **The short form re-seeds whenever a tracked DEPENDENCY changes, not when the
 * derived VALUE changes** — measured, not assumed. Every one of the thirteen sections tracks the same
 * `activeRules$`, which emits a new `Map` on every settle, so a `varietal` commit re-seeds the `color`
 * section too, discarding a click the user made a moment earlier and whose own round trip is still in
 * flight. On a main-thread panel that gap does not exist and the bug cannot appear; on this one it is
 * a chip that un-ticks itself when an unrelated facet lands.
 *
 * The `{ source, computation }` form fixes it by putting a `computed` in between. A `computed` dedupes
 * on `Object.is` and simply does not notify when its value is unchanged, so an unrelated settle costs
 * a `Map.get` and stops there. Only a real change to THIS facet re-seeds.
 *
 * ## Which is why `read` must be REFERENCE-STABLE for the absent case
 *
 * The dedupe is the whole mechanism, and it is `Object.is`. Return a fresh `[]` or a fresh object when
 * no rule is present and `committed` reports a change on every settle — reinstating the short form's
 * behavior through the back door, with nothing to show for it. Use `EMPTY_SELECTION`, or `null`, or
 * the rule's own `config`, all of which are stable per rule instance.
 *
 * `wine-chip-section.component.spec.ts` pins both halves: the pending paint surviving an unrelated
 * settle, and a real settle still landing.
 *
 * @packageDocumentation
 */

import type { FilterRule, RuleId } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';
import type { RxJsEngine } from '@filter-enginez/reactive-rxjs';

import { computed, linkedSignal, type WritableSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

/**
 * Local control state that paints immediately and re-syncs when the engine settles.
 *
 * @remarks
 * **Must be called in an injection context** — a field initializer or a constructor — because
 * `toSignal` registers teardown against the calling component's `DestroyRef`.
 *
 * `ruleId` is a THUNK rather than a plain value, so a section whose facet is chosen by an input can
 * pass `this.ruleId` straight through — reading `this.ruleId()` eagerly in a field initializer would
 * throw, because Angular has not set the input yet. A `Signal<RuleId>` satisfies this by construction;
 * a section with a fixed facet writes `() => 'origin'` and pays nothing for the indirection.
 *
 * @typeParam Rule - The rule type this facet commits.
 * @typeParam Value - What the control paints.
 * @param engine - The wine engine.
 * @param ruleId - Yields the facet's rule id — a signal, or an arrow for a fixed facet.
 * @param read - Projects the committed rule onto the control's value. MUST be reference-stable for
 *   the absent case — see the module remarks.
 * @returns A writable signal: set it on interaction, and it re-seeds on settle.
 */
export function adoptCommittedRule<Rule extends FilterRule, Value>(
	engine: RxJsEngine<Wine>,
	ruleId: () => RuleId,
	read: (rule: Rule | undefined) => Value,
): WritableSignal<Value> {
	const activeRules = toSignal(engine.activeRules$, { requireSync: true });
	// The `computed` is load-bearing, not a readability step: it is the dedupe that keeps an unrelated
	// facet's settle from re-seeding this one. See the module remarks.
	const committed = computed<Value>(() => read(activeRules().get(ruleId()) as Rule | undefined));

	return linkedSignal<Value, Value>({ computation: (value) => value, source: committed });
}
