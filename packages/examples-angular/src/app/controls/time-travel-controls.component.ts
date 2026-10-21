/**
 * `<fe-time-travel-controls>` — the header cluster: undo, redo, and the devtools toggle.
 *
 * @remarks
 * The Angular member of a set of five. React's `examples-shared/devtools`, SvelteKit's and Vue's
 * `TimeTravelControls`, and the vanilla port all render the same three controls with the same icons —
 * undo `↩`, redo `↪`, devtools `>_` — because someone who learns this header on `/books` should not
 * have to re-learn it one vertical over.
 *
 * **These are the engine's own devtools, not Redux's.** `engine.core.devtools` is an LRU action log
 * plus a time-travel cursor implemented in `@filter-enginez/core`, with no store library in the path.
 * That is exactly why every vertical can carry the surface: only the VIEW was ever framework-shaped.
 *
 * ### Reads, in this vertical's idiom
 *
 * `canUndo` / `canRedo` are plain getters on a mutable object, so neither is reactive on its own.
 * They are re-read whenever `lastChangeEvent$` emits — the stream is the dependency, the getter is
 * the value. `toSignal` bridges it, which is what lets these be `computed` rather than another
 * `| async` in the template.
 *
 * ### The keyboard binding lives HERE
 *
 * `attachUndoRedoKeyboard` from `@filter-enginez/core/keyboard/browser` — the same binding the React
 * hook wraps, not a second implementation. It is attached beside the buttons whose tooltips advertise
 * it, which is the only arrangement that cannot drift apart: a binding wired once in an app-level
 * component leaves any route that renders the buttons elsewhere advertising a shortcut nothing has
 * attached. The shortcut drives the same two handlers as the buttons, so a keyboard undo marks the
 * busy tracker before it writes, exactly as a click does, and a shortcut with nothing to step to
 * writes nothing and marks nothing.
 *
 * Undo and redo stay in the header rather than inside the panel because they are ordinary
 * post-misclick affordances, and they render always (going `disabled`) because a control that
 * vanishes when it cannot act teaches nobody that time travel exists.
 *
 * @packageDocumentation
 */

import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectEngineBusy, injectFilterEngine } from '@filter-enginez/angular-rxjs';
import { attachUndoRedoKeyboard } from '@filter-enginez/core/keyboard/browser';

/** The slice of core's devtools this component drives. @internal */
interface TimeTravelCursor {
	readonly canRedo: boolean;
	readonly canUndo: boolean;
	readonly redo: () => void;
	readonly undo: () => void;
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-time-travel-controls',
	template: `
		<button
			type="button"
			class="fe-icon-button"
			title="Undo (Cmd/Ctrl+Z)"
			aria-label="Undo (Cmd/Ctrl+Z)"
			[disabled]="!canUndo()"
			(click)="handleUndo()"
		>
			<svg
				viewBox="0 0 24 24"
				width="18"
				height="18"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M9 14 4 9l5-5" />
				<path d="M4 9h11a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-3" />
			</svg>
		</button>

		<button
			type="button"
			class="fe-icon-button"
			title="Redo (Cmd/Ctrl+Shift+Z)"
			aria-label="Redo (Cmd/Ctrl+Shift+Z)"
			[disabled]="!canRedo()"
			(click)="handleRedo()"
		>
			<svg
				viewBox="0 0 24 24"
				width="18"
				height="18"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="m15 14 5-5-5-5" />
				<path d="M20 9H9a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h3" />
			</svg>
		</button>

		<!-- These three are one cluster, but stepping and inspecting are different jobs. -->
		<span aria-hidden="true" class="fe-icon-button-divider"></span>

		<!--
			The toggle is CYAN when open, per the dual-accent contract: it names a surface you are
			looking at (identity), not work the engine is doing (which would be phosphor).
		-->
		<button
			type="button"
			class="fe-icon-button fe-icon-button--raised"
			[title]="isDevtoolsOpen() ? 'Hide devtools' : 'Show devtools (action log + time-travel)'"
			[attr.aria-label]="isDevtoolsOpen() ? 'Hide devtools' : 'Show devtools'"
			[attr.aria-pressed]="isDevtoolsOpen()"
			(click)="toggled.emit()"
		>
			<!--
				A terminal prompt, >_ — the most legible eight-pixel shorthand for "developer surface"
				available, and it needs no text label beside it. (No backticks in here: this is an
				Angular INLINE template, so a backtick would close the template literal itself.)
			-->
			<svg
				viewBox="0 0 24 24"
				width="18"
				height="18"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="m5 8 4 4-4 4" />
				<path d="M13 16h6" />
			</svg>
		</button>
	`,
})
export class TimeTravelControlsComponent {
	/** Whether the devtools panel is open — drives the toggle's pressed state. */
	public readonly isDevtoolsOpen = input.required<boolean>();

	/**
	 * Emitted when the toggle is clicked; the page owns the open state.
	 *
	 * @remarks
	 * Bare, not `output<void>()` — see `<fe-filters-toggle>` for the full note. `void` as a type
	 * argument means "a value nobody may use" rather than "no value", and the lint rule is right to
	 * reject it.
	 */
	public readonly toggled = output();

	private readonly _busy = injectEngineBusy();
	private readonly _engine = injectFilterEngine();

	/**
	 * The time-travel cursor.
	 *
	 * @remarks
	 * `devtools` is a public core API but is not on the narrowed core surface this component is typed
	 * against, so it is reached through an explicit structural cast — as in `<fe-devtools-panel>`.
	 */
	private readonly _devtools = (this._engine.core as unknown as { devtools: unknown })
		.devtools as TimeTravelCursor;

	/**
	 * The engine's change stream, bridged to a signal.
	 *
	 * @remarks
	 * The VALUE is never read — only the emission matters, as the trigger to re-read two getters. It
	 * is `undefined` until the first change, which is correct: an empty log has nothing to step to and
	 * both buttons should start disabled.
	 */
	private readonly _lastChange = toSignal(this._engine.lastChangeEvent$, { initialValue: null });

	/** Whether there is a step behind the cursor. */
	protected readonly canUndo = computed((): boolean => {
		void this._lastChange();

		return this._devtools.canUndo;
	});

	/** Whether there is a step ahead of the cursor. */
	protected readonly canRedo = computed((): boolean => {
		void this._lastChange();

		return this._devtools.canRedo;
	});

	constructor() {
		// The attach function returns its own teardown, which is exactly what `DestroyRef` wants — so
		// the binding cannot leak a duplicate listener across a re-navigation. It drives the handlers,
		// not the cursor, so the shortcut marks busy like the buttons.
		inject(DestroyRef).onDestroy(attachUndoRedoKeyboard({
			redo: () => {
				this.handleRedo();
			},
			undo: () => {
				this.handleUndo();
			},
		}));
	}

	/**
	 * Step one action back.
	 *
	 * @remarks
	 * Marks busy BEFORE the engine call, so the computing indicator lights on the click's own frame.
	 * An undo over 150k rows costs what the filter it reverses cost; skipping this makes the app look
	 * frozen for the duration rather than busy.
	 */
	protected handleUndo(): void {
		// The live getter rather than the `computed`: a shortcut can arrive between a cursor move and
		// the change event that re-reads it.
		if (!this._devtools.canUndo) {
			return;
		}
		this._busy.markUserAction();
		this._devtools.undo();
	}

	/** Step one action forward. */
	protected handleRedo(): void {
		if (!this._devtools.canRedo) {
			return;
		}
		this._busy.markUserAction();
		this._devtools.redo();
	}
}
