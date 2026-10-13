/**
 * `<fe-devtools-panel>` — the engine's action log and time-travel timeline, for the Angular vertical.
 *
 * @remarks
 * **This is core's devtools, not Redux's.** It reads `engine.core.devtools.actionLog` and
 * `.currentIndex`, and time-travels with `.jumpTo()` — all three live in `@filter-enginez/core`
 * beside `TimeTravel`, `Replay` and `Diff`, with no store library anywhere in the path. That is
 * exactly why this port is possible at all: only the VIEW was ever React.
 *
 * ### What this file is, and what it deliberately is not
 *
 * Every decision that is not markup comes from `@filter-enginez/examples-shared/devtools-core` —
 * flattening a log record, the row tone, the short label, `HH:MM:SS`, the drag-scrub arithmetic and
 * the keyboard step. Five verticals rendering five templates over one set of rules is the whole
 * point; a port that re-derived the scrub math would differ from React's at the strip's ends, and
 * the difference would be easy to miss.
 *
 * The styling is shared too — `ui-styles` carries the entire `.fe-devtools-*` block.
 *
 * ### The optimistic cursor is a `linkedSignal`
 *
 * Clicking a row tints it immediately rather than waiting for the engine round trip; the engine
 * cursor catches up a beat later and the link re-syncs. Without it the timeline feels broken on the
 * worker tier, where a jump is a message round trip — the user clicks, nothing moves, they click
 * again. Re-syncing on every external change is also what makes keyboard undo / redo move the cursor.
 *
 * `linkedSignal` is Angular's writable-derived, and it is the same construct as the SvelteKit port's
 * writable `$derived` — seed, optimistic paint and adopt in one declaration. Vue has no equivalent
 * and spells it `ref` + `watch`; that difference is the only interesting one between these two ports.
 *
 * @packageDocumentation
 */

import {
	ChangeDetectionStrategy,
	Component,
	computed,
	effect,
	type ElementRef,
	input,
	linkedSignal,
	output,
	signal,
	viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectEngineBusy, injectFilterEngine } from '@filter-enginez/angular-rxjs';
import {
	actionTypeLabel,
	actionTypeTone,
	type DevtoolsEntry,
	formatLogTime,
	indexFromScrubPointer,
	normalizeEntry,
	scrubIndexForKey,
} from '@filter-enginez/examples-shared/devtools-core';

/**
 * The BEM modifier class for a row's type badge.
 *
 * @param type - The dispatcher action type.
 * @returns The full class name.
 *
 * @internal
 */
function typeClassFor(type: string): string {
	return `fe-devtools-row__type--${actionTypeTone(type)}`;
}

/**
 * A stable track key for one row.
 *
 * @param entry - The row.
 * @param index - Its position in the log.
 * @returns The key.
 *
 * @internal
 */
function rowKeyFor(entry: DevtoolsEntry, index: number): string {
	return `${String(entry.timestamp)}-${entry.type}-${entry.summary}-${String(index)}`;
}

/**
 * A stable track key for one timeline dot.
 *
 * @remarks
 * Deliberately NOT `rowKeyFor` — the summary is left out. Two dots differing only by summary are
 * visually identical, and including it would rebuild the whole strip on an edit that changed nothing
 * about it.
 *
 * @param entry - The row the dot stands for.
 * @param index - Its position in the log.
 * @returns The key.
 *
 * @internal
 */
function dotKeyFor(entry: DevtoolsEntry, index: number): string {
	return `${String(entry.timestamp)}-${entry.type}-${String(index)}`;
}

/** The slice of core's devtools this component drives. @internal */
interface DevtoolsLog {
	readonly actionLog: { toArray: () => readonly unknown[] };
	readonly currentIndex: number;
	readonly jumpTo: (index: number) => void;
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-devtools-panel',
	template: `
		<section aria-label="Devtools action log" class="fe-devtools-panel">
			<header class="fe-devtools-panel__header">
				<div class="fe-devtools-panel__header-top">
					<h2 class="fe-devtools-panel__title">
						Devtools <span class="fe-devtools-panel__title-sep">·</span> Action Log
					</h2>
					<button
						type="button"
						class="fe-devtools-panel__close"
						aria-label="Close devtools"
						(click)="closed.emit()"
					>
						<svg
							viewBox="0 0 24 24"
							width="14"
							height="14"
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
				<div class="fe-devtools-panel__meta">
					{{ entries().length }}
					{{ entries().length === 1 ? 'action' : 'actions' }}
					<span class="fe-devtools-panel__meta-sep">·</span>
					at step <span class="fe-devtools-panel__step">#{{ activeCursor() + 1 }}</span>
				</div>
			</header>

			<div
				#scroller
				class="fe-devtools-log"
				[class.fe-devtools-log--computing]="isComputing()"
			>
				@if (entries().length === 0) {
					<div class="fe-devtools-log__empty">No actions yet. Interact with a filter to record one.</div>
				} @else {
					@for (entry of entries(); track rowKey(entry, $index); let index = $index) {
						<!-- A real button, not a clickable div: keyboard focus and Enter/Space come free. -->
						<button
							type="button"
							class="fe-devtools-row"
							[class.fe-devtools-row--active]="index === activeCursor()"
							[attr.aria-label]="
								'Jump to action ' + label(entry.type) + ' at ' + time(entry.timestamp)
							"
							[attr.aria-current]="index === activeCursor() ? 'true' : null"
							(click)="commitTo(index)"
						>
							<span class="fe-devtools-row__time">{{ time(entry.timestamp) }}</span>
							<span class="fe-devtools-row__type" [class]="typeClass(entry.type)">
								{{ label(entry.type) }}
							</span>
							<span class="fe-devtools-row__summary" [title]="entry.summary">{{ entry.summary }}</span>
							<span aria-hidden="true" class="fe-devtools-row__marker">
								{{ index === activeCursor() ? '●' : '→' }}
							</span>
						</button>
					}
				}
			</div>

			@if (entries().length === 0) {
				<footer class="fe-devtools-timeline fe-devtools-timeline--empty">
					scrub timeline · click an action to jump
				</footer>
			} @else {
				<footer
					class="fe-devtools-timeline"
					[class.fe-devtools-timeline--computing]="isComputing()"
				>
					<!--
						ONE pointer-capture strip owns the whole gesture: down latches and snaps, move
						re-snaps, up commits. The dots are pointer-events: none in ui-styles, so a press near
						a dot still resolves through the strip's arithmetic rather than hitting the dot.
					-->
					<div
						#strip
						class="fe-devtools-timeline__strip"
						role="slider"
						aria-label="Action log scrubber — drag to time-travel"
						[attr.aria-valuemin]="0"
						[attr.aria-valuemax]="entries().length - 1"
						[attr.aria-valuenow]="activeCursor()"
						tabindex="0"
						(pointerdown)="handleStripPointerDown($event)"
						(pointermove)="handleStripPointerMove($event)"
						(pointerup)="handleStripPointerUp($event)"
						(pointercancel)="endDrag()"
						(keydown)="handleStripKeyDown($event)"
					>
						<div aria-hidden="true" class="fe-devtools-timeline__line"></div>
						<div class="fe-devtools-timeline__dots">
							@for (entry of entries(); track dotKey(entry, $index); let index = $index) {
								<span
									aria-hidden="true"
									class="fe-devtools-dot"
									[class.fe-devtools-dot--active]="index === activeCursor()"
								></span>
							}
						</div>
					</div>
					<div class="fe-devtools-timeline__caption">
						scrub timeline <span class="fe-devtools-timeline__caption-sep">·</span>
						click an action to jump
					</div>
				</footer>
			}
		</section>
	`,
})
export class DevtoolsPanelComponent {
	/** Dims the panel and blocks jumps while a recompute is in flight. */
	public readonly isComputing = input(false);

	/**
	 * Emitted by the × in the header; the page owns the open state.
	 *
	 * @remarks
	 * Bare rather than `output<void>()` — see `<fe-filters-toggle>` for why.
	 */
	public readonly closed = output();

	/**
	 * Exposed for the template.
	 *
	 * @remarks
	 * These are the SHARED formatters and key builders, referenced rather than re-derived. A template
	 * cannot call a module function directly, so each is bound to a field; that indirection is the
	 * only cost of not having five verticals invent five spellings of `HH:MM:SS`.
	 */
	protected readonly dotKey = dotKeyFor;
	protected readonly label = actionTypeLabel;
	protected readonly rowKey = rowKeyFor;
	protected readonly time = formatLogTime;
	protected readonly typeClass = typeClassFor;

	private readonly _busy = injectEngineBusy();
	private readonly _engine = injectFilterEngine();

	private readonly _devtools = (this._engine.core as unknown as { devtools: unknown })
		.devtools as DevtoolsLog;
	private readonly _scroller = viewChild<ElementRef<HTMLElement>>('scroller');

	private readonly _strip = viewChild<ElementRef<HTMLElement>>('strip');

	/** The engine's change stream, bridged to a signal. Only the emission matters, not the value. */
	private readonly _lastChange = toSignal(this._engine.lastChangeEvent$, { initialValue: null });

	/** The log, re-read on every engine change. */
	protected readonly entries = computed((): readonly DevtoolsEntry[] => {
		void this._lastChange();

		return this._devtools.actionLog.toArray().map(normalizeEntry);
	});

	/** Where the ENGINE's cursor is. */
	private readonly _engineCursor = computed((): number => {
		void this._lastChange();

		return this._devtools.currentIndex;
	});

	/** Where the panel PAINTS the cursor — see the docblock on the optimistic cursor. */
	protected readonly activeCursor = linkedSignal((): number => this._engineCursor());

	private readonly _isDragging = signal(false);
	private _lastScrubIndex = 0;

	constructor() {
		// Keep the active row on screen. Covers click-to-jump, a scrub commit, keyboard undo/redo, and
		// a fresh action appended below the fold. Deferred a frame so the row exists at its new spot.
		effect((onCleanup) => {
			void this.activeCursor();
			void this.entries().length;

			const scroller = this._scroller()?.nativeElement;

			if (scroller === undefined) {
				return;
			}
			const handle = requestAnimationFrame(() => {
				scroller
					.querySelector<HTMLElement>('[aria-current="true"]')
					?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
			});

			onCleanup(() => {
				cancelAnimationFrame(handle);
			});
		});
	}

	/**
	 * Time-travel the engine to an index.
	 *
	 * @remarks
	 * Paints first, then marks busy, then calls the engine — the order every other port uses, and it
	 * matters on the worker tier where the jump is a round trip.
	 *
	 * @param index - The log index to jump to.
	 */
	protected commitTo(index: number): void {
		if (this.isComputing()) {
			return;
		}
		this.activeCursor.set(index);
		this._busy.markUserAction();
		this._devtools.jumpTo(index);
	}

	/**
	 * Latch the scrub gesture and snap to the pressed position.
	 *
	 * @param event - The pointer-down.
	 */
	protected handleStripPointerDown(event: PointerEvent): void {
		if (this.isComputing()) {
			return;
		}
		event.preventDefault();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		this._isDragging.set(true);
		this._lastScrubIndex = this._indexAt(event.clientX);
		this.activeCursor.set(this._lastScrubIndex);
	}

	/**
	 * Re-snap mid-drag, painting without committing.
	 *
	 * @param event - The pointer-move.
	 */
	protected handleStripPointerMove(event: PointerEvent): void {
		if (!this._isDragging()) {
			return;
		}
		const next = this._indexAt(event.clientX);

		if (next !== this._lastScrubIndex) {
			this._lastScrubIndex = next;
			this.activeCursor.set(next);
		}
	}

	/**
	 * Commit the scrub.
	 *
	 * @param event - The pointer-up.
	 */
	protected handleStripPointerUp(event: PointerEvent): void {
		if (!this._isDragging()) {
			return;
		}
		this._isDragging.set(false);
		try {
			(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
		} catch {
			// Tolerated: the pointer can be gone already if the gesture ended off-window.
		}
		this.commitTo(this._lastScrubIndex);
	}

	/** Abandon a drag that the browser cancelled (a system gesture, a lost pointer). */
	protected endDrag(): void {
		this._isDragging.set(false);
	}

	/**
	 * Step the cursor with the keyboard.
	 *
	 * @param event - The key-down.
	 */
	protected handleStripKeyDown(event: KeyboardEvent): void {
		const next = scrubIndexForKey(event.key, this.activeCursor(), this.entries().length);

		// `null` means a key this control does not own — let the browser have it, so Tab still moves
		// focus out of the scrubber.
		if (next === null) {
			return;
		}
		event.preventDefault();
		this.commitTo(next);
	}

	/**
	 * Which index a pointer is over.
	 *
	 * @param clientX - The pointer's viewport x.
	 * @returns The index, or the current cursor when the strip has not been measured.
	 */
	private _indexAt(clientX: number): number {
		const strip = this._strip()?.nativeElement;

		if (strip === undefined) {
			return this.activeCursor();
		}

		return indexFromScrubPointer(clientX, strip.getBoundingClientRect(), this.entries().length);
	}
}
