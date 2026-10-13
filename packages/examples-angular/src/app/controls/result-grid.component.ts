/**
 * `<fe-result-grid>` — incremental "load more" card grid over the current result set, for any dataset.
 *
 * @remarks
 * Render `results.slice(0, renderLimit)`, expand the limit when an `IntersectionObserver` reports the
 * bottom sentinel entering the scroller, cap at {@link HARD_CAP_RENDER}, and reset to the first page
 * whenever the result set's identity changes. The Angular port of Vue's `<ResultGrid>` and, before
 * it, `examples-shared`'s `BooksResultGrid`.
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

/** First page of cards shown before the user scrolls. */
const INITIAL_BATCH = 60;
/** Page size for each subsequent "load more" trigger. */
const BATCH_INCREMENT = 60;
/** Hard cap on cards ever rendered at once — bounds worst-case DOM cost. */
const HARD_CAP_RENDER = 1500;
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
				<p class="fe-result-grid__empty-title">{{ emptyTitle() }}</p>
				<p class="fe-result-grid__empty-hint">{{ emptyHint() }}</p>
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
				[attr.aria-label]="scrollRegionLabel()"
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
				@if (isCappedShort()) {
					<p class="fe-result-grid__cap-notice">
						Showing
						<span class="fe-result-grid__cap-shown">{{ renderedCount().toLocaleString() }}</span>
						of
						<span class="fe-result-grid__cap-total">{{ results().length.toLocaleString() }}</span>
						{{ noun() }} · narrow your filters to surface the rest
					</p>
				}
			</div>
		}
	`,
})
export class ResultGridComponent<T> {
	/** The card template, one instance per visible record. See {@link ResultCardDirective}. */
	public readonly card = input.required<TemplateRef<ResultCardContext<T>>>();

	/** Hint shown beneath the empty-state title, naming a filter worth widening. */
	public readonly emptyHint = input.required<string>();

	/** Empty-state headline, e.g. `'No books match the current filters.'` */
	public readonly emptyTitle = input.required<string>();

	/** Stable key for a result, so Angular can reuse card DOM across renders. */
	public readonly itemKey = input.required<(item: T) => string>();

	/** Accessible name for the grid's `role="list"`, e.g. `'Matching books'`. */
	public readonly listLabel = input.required<string>();

	/** Plural record noun for the cap notice — `matches` reads well for every dataset. */
	public readonly noun = input<string>('matches');

	/** The current filtered result set, in full. This component does its own paging. */
	public readonly results = input.required<readonly T[]>();

	/**
	 * Accessible name for the SCROLLER, e.g. `'Book results'`.
	 *
	 * @remarks
	 * Required, not optional, because the scroll region is a WCAG 2.1.1 obligation rather than a
	 * nicety, and an optional label is one a call site can silently omit.
	 */
	public readonly scrollRegionLabel = input.required<string>();

	/** How many cards the user has paged into view. */
	private readonly _renderLimit = signal(INITIAL_BATCH);

	private readonly _scroller = viewChild<ElementRef<HTMLDivElement>>('scroller');
	private readonly _sentinel = viewChild<ElementRef<HTMLDivElement>>('sentinel');

	/** Cards actually in the DOM — the render limit, bounded by the result set and the hard cap. */
	protected readonly renderedCount = computed<number>(() =>
		Math.min(this._renderLimit(), this.results().length, HARD_CAP_RENDER),
	);

	/** The slice rendered this pass. */
	protected readonly visible = computed<readonly T[]>(() =>
		this.results().slice(0, this.renderedCount()),
	);

	/** True when the hard cap — not the result set — is what is limiting the grid. */
	protected readonly isCappedShort = computed<boolean>(
		() => this.renderedCount() >= HARD_CAP_RENDER && this.results().length > HARD_CAP_RENDER,
	);

	public constructor() {
		// Reset to the first page whenever the result set's IDENTITY changes. A filter commit hands back
		// a fresh array, so this fires on every commit and the user sees the new first page rather than
		// page seven of the previous one. Reading `results()` is the whole point of the effect; the
		// write to `_renderLimit` is not read here, so there is no self-trigger.
		effect(() => {
			this.results();
			this._renderLimit.set(INITIAL_BATCH);

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
					this._renderLimit.update((limit) =>
						Math.min(limit + BATCH_INCREMENT, total, HARD_CAP_RENDER),
					);
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
