/**
 * `<fe-results-header>` — active-filter pills, the rolling result count, and the engine status pill.
 *
 * @remarks
 * ### This is the app's one `toSignal` component, and it earns it
 *
 * Everywhere else in this vertical, reads are `stream$ | async` (see the README). Here they are
 * `toSignal(…, { requireSync: true })`, because this component doesn't just *render* engine state — it
 * **derives** from it. `isComputing` is a `computed` over two sources, and the count roll is an
 * `effect` that fires on every change of `resultCount`. Expressing that over Observables would mean
 * `combineLatest` plus a manual subscription plus teardown; over signals it's four lines.
 *
 * `requireSync: true` is legal because of `reactive-rxjs`'s replay contract: every stream is a
 * `BehaviorSubject` seeded from live engine state, so there is always a current value at construction.
 * (It would NOT be legal for `events$`, which is an unseeded `Subject` — notification, not state.)
 *
 * ### Why `isComputing` ORs in a local flag
 *
 * On the main-thread routes (`/books`, `/real-estate`) the engine filters synchronously, so `isBusy$`
 * flips back to `false` before the browser ever paints. On its own the indicator would never visibly
 * light there. ORing in
 * `isTicking` ties the "computing" state to the count animation instead, which is the thing a person
 * actually perceives as the engine working. Every vertical does this; it is not an Angular
 * workaround.
 *
 * ### Dataset-neutral by two inputs, and DI for everything else
 *
 * The component reads five streams off the injected engine, runs one count-roll `effect`, and owns
 * the `markUserAction()`-before-write ordering that both write paths depend on. All of that is
 * dataset-independent, so it stays inside; only the two things that genuinely differ come in as
 * inputs — the {@link noun} beside the count, and a {@link summarize} function.
 *
 * {@link summarize} is a FUNCTION rather than a `summaries` value for a specific reason: the chip
 * list must recompute whenever `activeRules$` emits, and that subscription belongs here. Taking a
 * ready-made array instead would force every page to subscribe to `activeRules$` purely to feed this
 * component — three call sites doing the engine read this one already does. (Precedent: `format` and
 * `parse` on `<fe-range-slider>`.)
 *
 * ### The two writes are overridable, and wine is why
 *
 * `removeRule` and `clearAll` write the engine directly, which is right for books and real estate:
 * every rule they hold is a plain flat-map rule, so dropping one IS `core.removeRule(id)`.
 *
 * Wine is not like that. Its "Clear all" must leave **expression mode** as well as drop the thirteen
 * facets — `clearAllWineFilters` is two operations deliberately fused, because splitting them at a
 * call site is exactly how a clear-all comes to blank every control while a preset keeps driving the
 * results. And in expression mode the chip list is ONE synthetic chip whose id, `SMART_FILTER_CHIP_ID`,
 * names no rule at all: `core.removeRule('__smart-filter__')` is a **silent no-op**, so its × would
 * simply not work, with nothing anywhere to report it.
 *
 * Hence {@link removeRuleHandler} and {@link clearAllHandler} — optional, and when absent the engine
 * write stands unchanged. They are function INPUTS rather than outputs on purpose: an Angular output
 * cannot tell whether anyone is bound to it, so outputs would need a second "and use them" flag to
 * express the same thing, and the fallback is not an event this component is announcing — it is a
 * behavior a caller is replacing. `summarize` above sets the precedent.
 *
 * **A handler is responsible for its own busy marking, and this component does NOT mark for it.** The
 * default path calls `markUserAction()` because nothing else will. Wine's handlers are the shared
 * `wine-domain` commit helpers, which mark `wineBusyCore` themselves — the very counter this route's
 * `EngineBusyStream` is a view onto. Marking here too would be a second increment on one counter
 * through two doors.
 *
 * Note the component never touches a record, only rule metadata and `sourceData().length` — hence
 * `injectFilterEngine<unknown>()`. It is generic by not being generic.
 *
 * @packageDocumentation
 */

import type { FilterRule, RuleId } from '@filter-enginez/core';

import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectEngineBusy, injectFilterEngine } from '@filter-enginez/angular-rxjs';
import { prefersReducedMotion } from '@filter-enginez/brand/motion';
import { buildRuleSummaries, type FilterSummary } from '@filter-enginez/examples-shared/books-domain';

import { ComputingIndicatorComponent } from './computing-indicator.component.js';

/**
 * Turns the engine's active rules into one chip each.
 *
 * @remarks
 * Every dataset summarizer satisfies this. Real estate's takes a second options argument
 * (`{ metroCenters }`, so the Distance chip can read "≤ 15 mi of Greater Denver"), which a call site
 * binds with an arrow rather than passing the bare reference.
 *
 * `FilterSummary` is ONE declaration in `examples-shared/src/summaries/ruleSummary.ts`, re-exported by
 * the domain barrels, and this import resolves to it, so every summarizer satisfies this signature by
 * design rather than by structural accident. (`react-ui` declares its own, deliberately — see that
 * module for why that one is a boundary rather than a duplicate.)
 */
export type RuleSummarizer = (rules: ReadonlyMap<RuleId, FilterRule>) => readonly FilterSummary[];

/** Count-roll duration in ms — matches React's `useTickingNumber` and the Vue/Svelte ports. */
const ROLL_DURATION_MS = 600;

/**
 * Cubic ease-out. Quick off the mark, gentle landing — the count should feel like it's settling, not braking.
 *
 * @param progress - Normalized 0-1 time.
 * @returns Normalized 0-1 eased position.
 */
function easeOutCubic(progress: number): number {
	return 1 - (1 - progress) ** 3;
}


@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ComputingIndicatorComponent],
	selector: 'fe-results-header',
	template: `
		<div class="fe-results-header">
			@if (summaries().length === 0) {
				<div class="fe-active-filters__empty">No filters active — showing the full corpus.</div>
			} @else {
				<div class="fe-active-filters">
					<span class="fe-active-filters__count">
						{{ summaries().length }} {{ summaries().length === 1 ? 'filter' : 'filters' }}
					</span>
					<div class="fe-active-filters__chips">
						@for (summary of summaries(); track summary.ruleId) {
							<div
								class="fe-filter-chip"
								[class.fe-filter-chip--recent]="summary.ruleId === lastChangeRuleId()"
							>
								<span aria-hidden="true" class="fe-filter-chip__dot"></span>
								<span class="fe-filter-chip__label">{{ summary.label }}</span>
								<span
									class="fe-filter-chip__value"
									[class.fe-filter-chip__value--numeric]="summary.isNumeric"
								>
									{{ summary.value }}
								</span>
								<button
									type="button"
									class="fe-filter-chip__remove"
									[attr.aria-label]="'Remove ' + summary.label + ' filter'"
									(click)="removeRule(summary.ruleId)"
								>
									<svg
										viewBox="0 0 24 24"
										width="12"
										height="12"
										fill="none"
										stroke="currentColor"
										stroke-width="1.75"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path d="M18 6 6 18M6 6l12 12" />
									</svg>
								</button>
							</div>
						}
						<button type="button" class="fe-active-filters__clear" (click)="clearAll()">
							Clear all
						</button>
					</div>
				</div>
			}

			<div class="fe-result-count">
				<span
					class="fe-result-count__number"
					[class.fe-result-count__number--computing]="isComputing()"
				>
					{{ displayed().toLocaleString() }}
				</span>
				<span class="fe-result-count__label">{{ noun() }}</span>
				@if (delta() !== 0) {
					<span
						class="fe-result-count__delta"
						[class.fe-result-count__delta--down]="delta() < 0"
						[class.fe-result-count__delta--up]="delta() > 0"
					>
						{{ delta() > 0 ? '+' : '' }}{{ delta().toLocaleString() }}
					</span>
				}
				<span class="fe-result-count__total">
					filtered from {{ totalCount().toLocaleString() }} total
				</span>
				<span class="fe-result-count__status">
					<fe-computing-indicator [isComputing]="isComputing()" />
				</span>
			</div>
		</div>
	`,
})
export class ResultsHeaderComponent {
	/**
	 * What the count is counting — the word beside the number.
	 *
	 * @remarks
	 * Plural and lowercase (`books`, `listings`, `bottles`). Every page passes its own; the default is
	 * the generic `results`.
	 */
	public readonly noun = input<string>('results');

	/**
	 * How to turn active rules into chips. Defaults to the books summarizer — see {@link RuleSummarizer}.
	 */
	public readonly summarize = input<RuleSummarizer>(buildRuleSummaries);

	/**
	 * Replaces the per-chip × write. Omit it and the component removes the rule off the engine itself.
	 *
	 * @remarks
	 * The `ruleId` handed over is whatever {@link summarize} put on the chip, which is not necessarily
	 * a rule the engine holds — wine's expression-mode chip carries a synthetic id. A handler is
	 * therefore free to treat it as an intent rather than an address.
	 *
	 * Owns its own `markUserAction()`. See the class remarks.
	 */
	public readonly removeRuleHandler = input<((ruleId: RuleId) => void) | undefined>();

	/** Replaces the "Clear all" write. Same contract as {@link removeRuleHandler}. */
	public readonly clearAllHandler = input<(() => void) | undefined>();

	private readonly _busy = injectEngineBusy();

	/**
	 * `unknown` deliberately: this component reads rule metadata and a corpus LENGTH, never a record.
	 * Typing it to a dataset would be a coupling it does not earn.
	 */
	private readonly _engine = injectFilterEngine<unknown>();

	/**
	 * The animation's start value, deliberately a PLAIN FIELD rather than a signal.
	 *
	 * @remarks
	 * The roll effect writes it every frame. If it were a signal the effect would read its own write
	 * and re-trigger itself forever; keeping it un-tracked breaks that cycle. (The Vue port keeps the
	 * same mirror for the identical reason.)
	 */
	private _shown = 0;

	/** Every constraining + no-op rule currently on the engine. Feeds {@link summaries}. */
	private readonly _activeRules = toSignal(this._engine.activeRules$, { requireSync: true });

	/** The full corpus. Only its length is used, for the "filtered from N total" line. */
	private readonly _sourceData = toSignal(this._engine.sourceData$, { requireSync: true });

	/** The live, un-animated count straight off the engine. */
	protected readonly resultCount = toSignal(this._engine.resultCount$, { requireSync: true });

	/** Corpus size, for "filtered from N total". */
	protected readonly totalCount = computed<number>(() => this._sourceData().length);

	/** The number actually on screen — chases {@link resultCount} over {@link ROLL_DURATION_MS}. */
	protected readonly displayed = signal(0);

	/** True only while the roll is in flight. */
	protected readonly isTicking = signal(false);

	/** Whether the engine reports itself mid-recompute. */
	protected readonly isEngineBusy = toSignal(this._busy.isBusy$, { requireSync: true });

	/** The union that drives the phosphor indicator — see the class remarks. */
	protected readonly isComputing = computed<boolean>(() => this.isEngineBusy() || this.isTicking());

	/** How far the active filters have moved the count off the full corpus. */
	protected readonly delta = computed<number>(() => this.resultCount() - this.totalCount());

	/** The rule that changed most recently, for the phosphor chip border. */
	protected readonly lastChangeRuleId = toSignal(this._engine.lastChangeRuleId$, {
		requireSync: true,
	});

	/** One chip per CONSTRAINING rule — the shared builders drop no-op rules, so the count is honest. */
	protected readonly summaries = computed<readonly FilterSummary[]>(() =>
		this.summarize()(this._activeRules()),
	);

	public constructor() {
		this.displayed.set(this.resultCount());
		this._shown = this.resultCount();

		effect((onCleanup) => {
			const target = this.resultCount();

			if (this._shown === target) {
				return;
			}

			// Snap rather than roll when motion is unwelcome, or when there's no rAF to roll with
			// (SSR / jsdom). Either way the displayed value must still land on the truth.
			if (typeof requestAnimationFrame !== 'function' || prefersReducedMotion()) {
				this._shown = target;
				this.displayed.set(target);

				return;
			}

			const from = this._shown;
			// Elapsed comes from a fresh clock read, NOT the rAF timestamp argument: under jsdom the two
			// clocks disagree and the subtraction can go negative, which snaps the roll backwards.
			const start = performance.now();
			let frame = 0;

			const step = (): void => {
				const progress = Math.min(1, (performance.now() - start) / ROLL_DURATION_MS);
				const value = Math.round(from + (target - from) * easeOutCubic(progress));

				this._shown = value;
				this.displayed.set(value);

				if (progress < 1) {
					frame = requestAnimationFrame(step);

					return;
				}
				this._shown = target;
				this.displayed.set(target);
				this.isTicking.set(false);
			};

			this.isTicking.set(true);
			frame = requestAnimationFrame(step);

			onCleanup(() => {
				if (frame !== 0) {
					cancelAnimationFrame(frame);
				}
			});
		});
	}

	/**
	 * Drop one rule.
	 *
	 * @remarks
	 * The default path marks the busy tracker BEFORE the write, so the indicator catches the recompute.
	 * A supplied {@link removeRuleHandler} takes the whole path INCLUDING that marking — see the class
	 * remarks for why marking on its behalf would double-count.
	 *
	 * @param ruleId - The rule the clicked chip stands for. May be synthetic under a handler.
	 */
	protected removeRule(ruleId: RuleId): void {
		const handler = this.removeRuleHandler();

		if (handler !== undefined) {
			handler(ruleId);

			return;
		}
		this._busy.markUserAction();
		this._engine.core.removeRule(ruleId);
	}

	/** Drop every rule. Same override and ordering rationale as {@link removeRule}. */
	protected clearAll(): void {
		const handler = this.clearAllHandler();

		if (handler !== undefined) {
			handler();

			return;
		}
		this._busy.markUserAction();
		this._engine.core.clearRules();
	}
}
