/**
 * `<fe-search-input>` — a text field with a magnifier and a clear affordance. Fully stateless.
 *
 * @remarks
 * Two outputs, deliberately: `valueChange` fires per keystroke (the parent mirrors it for display),
 * `commit` fires on blur / Enter / clear (the parent writes the engine). Committing per keystroke on a
 * 10k-record fuzzy search would be a stutter machine.
 *
 * Note Enter fires `commit` **twice** — once from the key handler, then again from the blur it
 * triggers. Commits are idempotent so this is harmless, but don't hang a non-idempotent side effect
 * off it. (The Vue original behaves identically; this is parity, not an Angular quirk.)
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

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
				[value]="value()"
				[attr.placeholder]="placeholder()"
				[attr.aria-label]="ariaLabel()"
				(input)="onInput($event)"
				(blur)="commit.emit(value())"
				(keydown.enter)="field.blur()"
				(keydown.escape)="field.blur()"
			/>
			@if (value().length > 0) {
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

	/** The displayed text — the parent owns it. */
	public readonly value = input.required<string>();

	/** Write this value to the engine. */
	public readonly commit = output<string>();

	/** Per-keystroke mirror update. Does NOT touch the engine. */
	public readonly valueChange = output<string>();

	/** Clear the field and commit the empty value in one gesture. */
	protected onClear(): void {
		this.valueChange.emit('');
		this.commit.emit('');
	}

	/** Mirror a keystroke upward. */
	protected onInput(event: Event): void {
		this.valueChange.emit((event.target as HTMLInputElement).value);
	}
}
