/**
 * `<fe-search-input>` — a search field with a magnifier and a clear affordance, committing on the
 * shared typeahead contract.
 *
 * @remarks
 * Every search field in the app (wine's tasting notes and winery, books' description, author and ISBN
 * pattern, real estate's description) renders through this component, and its timing is the one
 * `@filter-enginez/examples-shared/search-core` decides for all six apps:
 *
 *   - **Search as you type.** Each keystroke re-arms a trailing debounce, and the query commits once
 *     the typing pauses.
 *   - **Leaving the field commits at once.** Blur, Enter and the clear button flush the pending
 *     debounce.
 *   - **Nothing unchanged is committed.** {@link commit} fires only with a trimmed query that differs
 *     from the last one committed or adopted, so tabbing through an empty field, or Enter followed by
 *     the blur it causes, writes nothing. The parent marks the engine busy inside its `commit`
 *     handler, so the computing indicator lights only when something is written.
 *   - **An external change is adopted, an echo is not.** When {@link query} changes from outside
 *     (Clear all, a pill's ×, Undo, a `?f=` link) the field shows it; the echo of the field's own
 *     commit is skipped, so a debounced commit landing mid-word never yanks the text back.
 *
 * The component owns the field's text and the controller; the parent owns the rule. It passes the
 * rule's current query in and decides, in its `commit` handler, what a query writes (a removal for an
 * empty one, or a rule with an empty query, per dataset).
 *
 * @packageDocumentation
 */

import {
	ChangeDetectionStrategy,
	Component,
	DestroyRef,
	effect,
	inject,
	input,
	output,
	signal,
	untracked,
} from '@angular/core';
import { createTypeaheadController, type TypeaheadController } from '@filter-enginez/examples-shared/search-core';

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-search-input',
	template: `
		<div class="fe-search-input">
			<svg
				class="fe-search-input__icon"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="11" cy="11" r="8" />
				<path d="m21 21-4.3-4.3" />
			</svg>
			<input
				#field
				type="search"
				class="fe-search-input__field"
				[value]="text()"
				[attr.placeholder]="placeholder()"
				[attr.aria-label]="ariaLabel()"
				(input)="onInput($event)"
				(blur)="onFlush(field.value)"
				(keydown.enter)="onEnter($event, field)"
				(keydown.escape)="field.blur()"
			/>
			@if (text().length > 0) {
				<button
					type="button"
					class="fe-search-input__clear"
					aria-label="Clear search"
					(click)="onClear()"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
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
			}
		</div>
	`,
})
export class SearchInputComponent {
	/** Accessible name for the field. */
	public readonly ariaLabel = input<string>();

	/** Placeholder copy. */
	public readonly placeholder = input<string>();

	/** The rule's current query; `''` when there is no rule. */
	public readonly query = input.required<string>();

	/** A changed, trimmed query to write to the engine. The handler marks busy and writes. */
	public readonly commit = output<string>();

	/** What the field shows: keystrokes while typing, the rule's query after an external change. */
	protected readonly text = signal('');

	/**
	 * The timing half of the field.
	 *
	 * @remarks
	 * Seeded with an empty query: the first {@link query} the effect below hands to `adopt` is then
	 * either `''` (nothing to show) or a restored rule's query, which it adopts and shows.
	 */
	private readonly _controller: TypeaheadController = createTypeaheadController({
		commit: (trimmedQuery) => {
			this.commit.emit(trimmedQuery);
		},
		initialQuery: '',
	});

	public constructor() {
		// Adopt each new rule query. Only `query()` is tracked; the adoption itself runs untracked so
		// writing `text` cannot re-trigger this effect.
		effect(() => {
			const ruleQuery = this.query();

			untracked(() => {
				if (this._controller.adopt(ruleQuery)) {
					this.text.set(ruleQuery);
				}
			});
		});

		// A field torn down mid-debounce must not commit into a route that has gone.
		inject(DestroyRef).onDestroy(() => {
			this._controller.dispose();
		});
	}

	/** Clear the field and commit the empty query at once. */
	protected onClear(): void {
		this.text.set('');
		this._controller.flush('');
	}

	/**
	 * Commit at once, then leave the field; the blur that follows commits nothing a second time.
	 *
	 * @param event - The keydown.
	 * @param field - The input element.
	 */
	protected onEnter(event: Event, field: HTMLInputElement): void {
		event.preventDefault();
		this._controller.flush(field.value);
		field.blur();
	}

	/**
	 * Commit the field's text at once, cancelling any pending debounce.
	 *
	 * @param value - The field's text.
	 */
	protected onFlush(value: string): void {
		this._controller.flush(value);
	}

	/**
	 * Take a keystroke: show it, and re-arm the debounced commit.
	 *
	 * @param event - The native `input` event.
	 */
	protected onInput(event: Event): void {
		const { value } = event.target as HTMLInputElement;

		this.text.set(value);
		this._controller.input(value);
	}
}
