/**
 * `<fe-result-grid>` — incremental infinite-scroll card grid over the current result set, for any dataset.
 *
 * @remarks
 * Render `results.slice(0, renderLimit)`, expand the limit when an `IntersectionObserver` reports the
 * bottom sentinel entering the scroller, cap at `RESULT_GRID_WINDOW.cap`, and reset to the first page
 * whenever the result set's identity changes. The Angular port of Vue's `<ResultGrid>` and, before
 * it, `examples-shared`'s `BooksResultGrid`.
 *
 * ### The words and the window are shared
 *
 * The empty state, the list's and the scroller's accessible names and the cap notice come from
 * `RESULT_COPY[dataset]` and `resultCapNotice`, and the paging window from `RESULT_GRID_WINDOW` /
 * `nextRenderLimit` / `isRenderCapped` (`@filter-enginez/examples-shared/verticals`), so each
 * dataset's results column reads and grows the same in all six apps. A page names its dataset and
 * nothing else; the list label carries the live count (`1,204 matching wines`), and the cap notice
 * appears only when the cap, not the result count, is what stopped the grid.
 *
 * ### Why one shared component
 *
 * Every Angular results page (books, server-backed books, real estate, wine) renders through it, so
 * each gets the sentinel and the cap notice that every other vertical's grid has.
 *
 * The paging logic is the part worth not duplicating. It is four interacting pieces — a render limit,
 * a hard cap, an observer whose callback closes over the current length, and a reset keyed on result
 * identity — and a second copy is the one that keeps a stale `total` after a filter change.
 *
 * ### Why a template input rather than content projection
 *
 * `<ng-content>` cannot be repeated, so the card has to arrive as a `TemplateRef` rendered through
 * `NgTemplateOutlet` — Angular's equivalent of Vue's scoped slot. The wrinkle is that a bare
 * `<ng-template #card let-item>` has no context type, so `item` would be `any` at every call site.
 * {@link ResultCardDirective} exists solely to supply that type: binding it to the same array the
 * grid receives infers `T` and narrows `let-item` to the record type, with no `$any` and no
 * `eslint-disable`. Twelve lines to keep four call sites honestly typed.
 *
 * All styling is `fe-result-grid*` from `@filter-enginez/ui-styles`, shared with every framework and
 * every dataset; this component contributes markup and nothing else.
 *
 * @packageDocumentation
 */

import { NgTemplateOutlet } from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	computed,
	Directive,
	effect,
	type ElementRef,
	input,
	signal,
	type TemplateRef,
	viewChild,
} from '@angular/core';
import {
	isRenderCapped,
	nextRenderLimit,
	RESULT_COPY,
	RESULT_GRID_WINDOW,
	resultCapNotice,
	type ResultDataset,
} from '@filter-enginez/examples-shared/verticals';

/** How far below the fold the sentinel starts expanding the page. */
const SENTINEL_ROOT_MARGIN = '200px';

/** The context {@link ResultGridComponent} renders each card template with. */
export interface ResultCardContext<T> {
	/** The record for this card. Bound at the call site as `let-item`. */
	readonly $implicit: T;
}

/**
 * Types the `let-` variable on a `<fe-result-grid>` card template.
 *
 * @remarks
 * Angular infers an `<ng-template>`'s context from the directives applied to it, never from where
 * the resulting `TemplateRef` is later used — so without this the card template's `let-item` is
 * `any`, and a card bound to the wrong record type compiles happily.
 *
 * Bind it to the SAME array passed to the grid's `results`; that binding is what infers `T`. It
 * reads like `*ngFor`'s `of` for the same reason, and the duplication is inference, not state.
 *
 * ```html
 * <fe-result-grid [results]="books" [card]="cardTpl" ... />
 * <ng-template #cardTpl [feResultCardOf]="books" let-book>
 *   <fe-book-card [book]="book" />
 * </ng-template>
 * ```
 */
@Directive({ selector: 'ng-template[feResultCardOf]' })
export class ResultCardDirective<T> {
	/** The result set the card template renders over. Bound purely so `T` can be inferred. */
	public readonly feResultCardOf = input.required<readonly T[]>();

	/**
	 * Tell the template type-checker what `let-` variables this template exposes.
	 *
	 * @param _directive - The directive instance, used only to carry `T` into the guard.
	 * @param _context - The runtime context object, unchecked by design.
	 * @returns Always `true`; the value is irrelevant, the TYPE predicate is the point.
	 */
	public static ngTemplateContextGuard<T>(
		_directive: ResultCardDirective<T>,
		_context: unknown,
	): _context is ResultCardContext<T> {
		return true;
	}
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [NgTemplateOutlet],
	selector: 'fe-result-grid',
	template: `
		@if (results().length === 0) {
			<div class="fe-result-grid__empty">
				<p class="fe-result-grid__empty-title">{{ copy().emptyTitle }}</p>
				<p class="fe-result-grid__empty-hint">{{ copy().emptyHint }}</p>
			</div>
		} @else {
			<!--
				role="group" + tabindex="0" on the scroller: a scrollable region holding no focusable
				element is unreachable by keyboard, so a keyboard user cannot page through the results at
				all. The cards are articles, not links or buttons — there is deliberately nothing tabbable
				inside — so the container itself has to be the stop. WCAG 2.1.1.

				A nonnegative tabindex on a non-widget role is usually a mistake; it is not one when the
				element SCROLLS. aria-label keeps it from being a silent tab stop.

   NB: no backticks in this comment — an Angular template IS a JS template literal, and a stray
   backtick terminates it, which reports as a syntax error tens of lines further down, in code
   that is fine.
			-->
			<div
				#scroller
				class="fe-result-grid__scroller"
				role="group"
				[attr.aria-label]="copy().scrollerLabel"
				tabindex="0"
			>
				<div role="list" [attr.aria-label]="listLabel()" class="fe-result-grid">
					@for (item of visible(); track itemKey()(item)) {
						<ng-container
							[ngTemplateOutlet]="card()"
							[ngTemplateOutletContext]="{ $implicit: item }"
						/>
					}
				</div>
				<div #sentinel aria-hidden="true" style="height: 1px"></div>
				@if (capNotice(); as notice) {
					<p class="fe-result-grid__cap-notice">
						Showing
						<span class="fe-result-grid__cap-shown">{{ notice.rendered }}</span>
						of
						<span class="fe-result-grid__cap-total">{{ notice.total }}</span>
						{{ notice.suffix }}
					</p>
				}
			</div>
		}
	`,
})
export class ResultGridComponent<T> {
	/** The card template, one instance per visible record. See {@link ResultCardDirective}. */
	public readonly card = input.required<TemplateRef<ResultCardContext<T>>>();

	/**
	 * The dataset whose results these are; it picks the `RESULT_COPY` entry.
	 *
	 * @remarks
	 * Required, not optional, because the scroll region's accessible name comes from it, and the
	 * scroll region is a WCAG 2.1.1 obligation rather than a nicety.
	 */
	public readonly dataset = input.required<ResultDataset>();

	/** Stable key for a result, so Angular can reuse card DOM across renders. */
	public readonly itemKey = input.required<(item: T) => string>();

	/** The current filtered result set, in full. This component does its own paging. */
	public readonly results = input.required<readonly T[]>();

	/** How many cards the user has paged into view. */
	private readonly _renderLimit = signal<number>(RESULT_GRID_WINDOW.initial);

	private readonly _scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');
	private readonly _sentinel = viewChild<ElementRef<HTMLDivElement>>('sentinel');

	/** The dataset's empty state and accessible names. */
	protected readonly copy = computed(() => RESULT_COPY[this.dataset()]);

	/** The list's accessible name, carrying the live count: `1,204 matching wines`. */
	protected readonly listLabel = computed<string>(() => this.copy().listLabel(this.results().length));

	/** Cards actually in the DOM — the render limit, bounded by the result set and the cap. */
	protected readonly renderedCount = computed<number>(() =>
		Math.min(this._renderLimit(), this.results().length, RESULT_GRID_WINDOW.cap),
	);

	/** The slice rendered this pass. */
	protected readonly visible = computed<readonly T[]>(() =>
		this.results().slice(0, this.renderedCount()),
	);

	/** The cap notice's parts, or `null` unless the cap — not the result set — is limiting the grid. */
	protected readonly capNotice = computed(() => {
		const total = this.results().length;

		return isRenderCapped(this.renderedCount(), total) ? resultCapNotice(this.renderedCount(), total) : null;
	});

	public constructor() {
		// Reset to the first page whenever the result set's IDENTITY changes. A filter commit hands back
		// a fresh array, so this fires on every commit and the user sees the new first page rather than
		// page seven of the previous one. Reading `results()` is the whole point of the effect; the
		// write to `_renderLimit` is not read here, so there is no self-trigger.
		effect(() => {
			this.results();
			this._renderLimit.set(RESULT_GRID_WINDOW.initial);

			const scroller = this._scroller();

			if (scroller !== undefined) {
				scroller.nativeElement.scrollTop = 0;
			}
		});

		// Bottom-sentinel intersection — expands the render limit as the user nears the rendered tail.
		//
		// `total` is read into a local BEFORE the guard, deliberately. Every reactive value this effect
		// depends on has to be read on every run, and an early `return` past an unread signal is how an
		// effect comes to track nothing and never run again. (Same shape as the optional-chaining trap
		// in Svelte: `x?.m(signal())` never evaluates `signal()` while `x`
		// is null, so the dependency is never registered.)
		effect((onCleanup) => {
			const total = this.results().length;
			const sentinel = this._sentinel();
			const scroller = this._scroller();

			if (
				sentinel === undefined ||
				scroller === undefined ||
				typeof IntersectionObserver === 'undefined'
			) {
				return;
			}

			const observer = new IntersectionObserver(
				(entries) => {
					const entry = entries[0];

					if (entry === undefined || !entry.isIntersecting) {
						return;
					}
					this._renderLimit.update((limit) => nextRenderLimit(limit, total));
				},
				{ root: scroller.nativeElement, rootMargin: SENTINEL_ROOT_MARGIN, threshold: 0 },
			);

			observer.observe(sentinel.nativeElement);

			onCleanup(() => {
				observer.disconnect();
			});
		});
	}
}
