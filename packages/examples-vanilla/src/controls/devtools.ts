/**
 * The devtools surface for the framework-less vertical — the header cluster and the action-log panel.
 *
 * @remarks
 * The fifth port. React's `examples-shared/devtools`, SvelteKit's, Vue's and Angular's
 * `TimeTravelControls` all render the same three controls with the same icons — undo `↩`, redo `↪`,
 * devtools `>_` — and this file renders them with `document.createElement`.
 *
 * **That is the point of it existing.** The other four ports each bring a reactivity system to the
 * job; this one has none, so it is the honest measure of how much of the devtools surface was ever
 * framework work. The answer is: the subscription and the repaint, and nothing else. Every decision
 * still comes from `@filter-enginez/examples-shared/devtools-core`, the keybinding from
 * `@filter-enginez/core/keyboard/browser`, and the styling from `ui-styles`'s `.fe-devtools-*` block.
 *
 * ### There is no optimistic cursor here, and that is not a shortcut
 *
 * The other four ports hold a local cursor that paints ahead of the engine, because a worker-tier
 * jump is a message round trip and the timeline would otherwise feel dead. This vertical repaints
 * straight from `devtools` instead. On `/books`, `/books-raw` and `/real-estate` the engine runs
 * in-process, so `jumpTo` has returned before the next line executes. On `/wine` and `/wine-server`
 * `engine.core.devtools` is the async core shim's, which writes its own cursor optimistically before
 * the round trip — so its `currentIndex` is already current when this repaints. A local cursor here
 * would be a second source of truth guarding against a latency neither tier exposes to this file.
 *
 * @packageDocumentation
 */

import { attachUndoRedoKeyboard } from '@filter-enginez/core/keyboard/browser';
import {
	actionTypeLabel,
	actionTypeTone,
	type DevtoolsEntry,
	formatLogTime,
	indexFromScrubPointer,
	normalizeEntry,
	scrubIndexForKey,
} from '@filter-enginez/examples-shared/devtools-core';
import { el, setHidden, svg } from '@filter-enginez/examples-shared/dom';

/**
 * The slice of core's devtools this file drives.
 *
 * @remarks
 * Structural rather than the real type: `devtools` is a public core API but is not on the narrowed
 * `FilterEngine` surface these routes are typed against, so it arrives through a cast at the call
 * site and this is what it is cast TO.
 */
export interface DevtoolsCursor {
	/** The LRU action log. */
	readonly actionLog: { toArray: () => readonly unknown[] };
	/** Whether there is a step ahead of the cursor. */
	readonly canRedo: boolean;
	/** Whether there is a step behind the cursor. */
	readonly canUndo: boolean;
	/** Where the cursor is. */
	readonly currentIndex: number;
	/** Time-travel to an index. */
	readonly jumpTo: (index: number) => void;
	/** Step forward. */
	readonly redo: () => void;
	/** Step back. */
	readonly undo: () => void;
}

/** A mounted devtools surface. */
export interface DevtoolsSurface {
	/** The three header controls, for the shell's `headerControls`. */
	readonly headerControls: readonly HTMLElement[];
	/** The panel, hidden until the toggle is pressed. Insert above the results grid. */
	readonly panelElement: HTMLElement;
	/** Repaint from the engine. Call on every change event, alongside the other updaters. */
	readonly update: () => void;
	/** Detach the keyboard binding. */
	readonly dispose: () => void;
}

/** Construction options for {@link createDevtoolsSurface}. */
export interface DevtoolsSurfaceOptions {
	/** The engine's time-travel cursor. */
	readonly devtools: DevtoolsCursor;
	/**
	 * Bump the route's busy version, so a "computing" indicator lights on the click's own frame.
	 *
	 * @remarks
	 * Every route passes its dataset's tracker, so undo, redo, the keyboard shortcuts and every
	 * timeline jump light the indicator like any other write. Optional only so the surface stands
	 * alone in a suite that has no tracker to hand it.
	 */
	readonly markBusy?: () => void;
}

/**
 * Build one of the three header icon buttons.
 *
 * @param options - Label, icon paths, and the click handler.
 * @returns The button.
 *
 * @internal
 */
function iconButton(options: {
	readonly className?: string;
	readonly label: string;
	readonly onClick: () => void;
	readonly paths: readonly string[];
}): HTMLButtonElement {
	const { className = 'fe-icon-button', label, onClick, paths } = options;

	return el('button', {
		attrs: { 'aria-label': label, title: label, type: 'button' },
		children: [
			svg(
				'svg',
				{
					'aria-hidden': 'true',
					fill: 'none',
					height: 18,
					stroke: 'currentColor',
					'stroke-linecap': 'round',
					'stroke-linejoin': 'round',
					'stroke-width': 1.75,
					viewBox: '0 0 24 24',
					width: 18,
				},
				paths.map((d) => svg('path', { d })),
			),
		],
		className,
		on: { click: onClick },
	});
}

/**
 * Build one row of the action log.
 *
 * @param entry - The flattened log record.
 * @param isActive - Whether the cursor is on it.
 * @param onJump - Invoked on click.
 * @returns The row button.
 *
 * @internal
 */
function logRow(entry: DevtoolsEntry, isActive: boolean, onJump: () => void): HTMLButtonElement {
	const time = formatLogTime(entry.timestamp);
	const label = actionTypeLabel(entry.type);

	// A real `<button>`, not a clickable div: keyboard focus and Enter/Space come free.
	return el('button', {
		attrs: {
			'aria-current': isActive ? 'true' : null,
			'aria-label': `Jump to action ${label} at ${time}`,
			type: 'button',
		},
		children: [
			el('span', { className: 'fe-devtools-row__time', text: time }),
			el('span', {
				className: `fe-devtools-row__type fe-devtools-row__type--${actionTypeTone(entry.type)}`,
				text: label,
			}),
			el('span', {
				attrs: { title: entry.summary },
				className: 'fe-devtools-row__summary',
				text: entry.summary,
			}),
			el('span', {
				attrs: { 'aria-hidden': 'true' },
				className: 'fe-devtools-row__marker',
				text: isActive ? '●' : '→',
			}),
		],
		className: `fe-devtools-row${isActive ? ' fe-devtools-row--active' : ''}`,
		on: { click: onJump },
	});
}

/**
 * Mount the devtools surface over an engine's time-travel cursor.
 *
 * @param options - The cursor, and an optional busy hook.
 * @returns The header controls, the panel, and the repaint / dispose callbacks.
 */
export function createDevtoolsSurface(options: DevtoolsSurfaceOptions): DevtoolsSurface {
	const { devtools, markBusy } = options;
	let isOpen = false;
	let entries: readonly DevtoolsEntry[] = [];

	const undoButton = iconButton({
		label: 'Undo (Cmd/Ctrl+Z)',
		onClick: () => {
			if (!devtools.canUndo) {
				return;
			}
			markBusy?.();
			devtools.undo();
		},
		paths: ['M9 14 4 9l5-5', 'M4 9h11a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-3'],
	});
	const redoButton = iconButton({
		label: 'Redo (Cmd/Ctrl+Shift+Z)',
		onClick: () => {
			if (!devtools.canRedo) {
				return;
			}
			markBusy?.();
			devtools.redo();
		},
		paths: ['m15 14 5-5-5-5', 'M20 9H9a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h3'],
	});

	// The toggle is CYAN when open, per the dual-accent contract: it names a surface you are looking
	// at (identity), not work the engine is doing (which would be phosphor). `--raised` keeps it
	// visible at rest, because a control that must be FOUND cannot be a transparent square.
	const toggleButton = iconButton({
		className: 'fe-icon-button fe-icon-button--raised',
		label: 'Show devtools',
		onClick: () => {
			isOpen = !isOpen;
			update();
		},
		// A terminal prompt, `>_` — the most legible eight-pixel shorthand for "developer surface".
		paths: ['m5 8 4 4-4 4', 'M13 16h6'],
	});

	const logElement = el('div', { className: 'fe-devtools-log' });
	const dotsElement = el('div', { className: 'fe-devtools-timeline__dots' });
	const metaElement = el('div', { className: 'fe-devtools-panel__meta' });
	const captionElement = el('div', {
		children: [
			'scrub timeline ',
			el('span', { className: 'fe-devtools-timeline__caption-sep', text: '·' }),
			' click an action to jump',
		],
		className: 'fe-devtools-timeline__caption',
	});

	/**
	 * Which index a pointer is over.
	 *
	 * @param clientX - The pointer's viewport x.
	 * @returns The index, clamped, or the cursor when the strip has not been measured.
	 */
	function indexAt(clientX: number): number {
		const rect = stripElement.getBoundingClientRect();

		return rect.width === 0
			? devtools.currentIndex
			: indexFromScrubPointer(clientX, rect, entries.length);
	}

	/**
	 * Time-travel, then repaint.
	 *
	 * @param index - The log index to jump to.
	 */
	function commitTo(index: number): void {
		// A jump to where the cursor already is writes nothing and so would never settle: no busy
		// mark for it.
		if (index !== devtools.currentIndex) {
			markBusy?.();
			devtools.jumpTo(index);
		}
		update();
	}

	let isDragging = false;
	let lastScrubIndex = 0;

	// ONE pointer-capture strip owns the whole gesture: down latches and snaps, move re-snaps, up
	// commits. The dots are `pointer-events: none` in ui-styles, so a press near a dot still resolves
	// through the strip's arithmetic rather than hitting the dot.
	const stripElement = el('div', {
		attrs: {
			'aria-label': 'Action log scrubber — drag to time-travel',
			'aria-valuemin': 0,
			role: 'slider',
			tabindex: 0,
		},
		children: [
			el('div', { attrs: { 'aria-hidden': 'true' }, className: 'fe-devtools-timeline__line' }),
			dotsElement,
		],
		className: 'fe-devtools-timeline__strip',
		on: {
			keydown: (event) => {
				const next = scrubIndexForKey(
					(event as KeyboardEvent).key,
					devtools.currentIndex,
					entries.length,
				);

				// `null` means a key this control does not own — let the browser have it, so Tab still
				// moves focus out of the scrubber.
				if (next === null) {
					return;
				}
				event.preventDefault();
				commitTo(next);
			},
			pointercancel: () => {
				isDragging = false;
			},
			pointerdown: (event) => {
				const pointer = event as PointerEvent;

				pointer.preventDefault();
				stripElement.setPointerCapture(pointer.pointerId);
				isDragging = true;
				lastScrubIndex = indexAt(pointer.clientX);
				commitTo(lastScrubIndex);
			},
			pointermove: (event) => {
				if (!isDragging) {
					return;
				}
				const next = indexAt((event as PointerEvent).clientX);

				if (next !== lastScrubIndex) {
					lastScrubIndex = next;
					commitTo(next);
				}
			},
			pointerup: (event) => {
				if (!isDragging) {
					return;
				}
				isDragging = false;
				try {
					stripElement.releasePointerCapture((event as PointerEvent).pointerId);
				} catch {
					// Tolerated: the pointer can be gone already if the gesture ended off-window.
				}
			},
		},
	});

	const timelineElement = el('footer', {
		children: [stripElement, captionElement],
		className: 'fe-devtools-timeline',
	});

	const panelElement = el('section', {
		attrs: { 'aria-label': 'Devtools action log' },
		children: [
			el('header', {
				children: [
					el('div', {
						children: [
							el('h2', {
								children: [
									'Devtools ',
									el('span', { className: 'fe-devtools-panel__title-sep', text: '·' }),
									' Action Log',
								],
								className: 'fe-devtools-panel__title',
							}),
							iconButton({
								className: 'fe-devtools-panel__close',
								label: 'Close devtools',
								onClick: () => {
									isOpen = false;
									update();
								},
								paths: ['M18 6 6 18M6 6l12 12'],
							}),
						],
						className: 'fe-devtools-panel__header-top',
					}),
					metaElement,
				],
				className: 'fe-devtools-panel__header',
			}),
			logElement,
			timelineElement,
		],
		className: 'fe-devtools-panel',
	});

	/**
	 * Repaint everything from the engine.
	 *
	 * @remarks
	 * A full rebuild of the rows rather than a diff, deliberately: the log is capped by its LRU and a
	 * panel that is closed most of the time does not need reconciliation. The active row is scrolled
	 * into view a frame later, once it exists at its new position.
	 */
	function update(): void {
		setHidden(panelElement, !isOpen);
		toggleButton.setAttribute('aria-pressed', String(isOpen));
		toggleButton.setAttribute('aria-label', isOpen ? 'Hide devtools' : 'Show devtools');
		toggleButton.setAttribute(
			'title',
			isOpen ? 'Hide devtools' : 'Show devtools (action log + time-travel)',
		);
		undoButton.disabled = !devtools.canUndo;
		redoButton.disabled = !devtools.canRedo;

		if (!isOpen) {
			return;
		}
		entries = devtools.actionLog.toArray().map(normalizeEntry);

		const cursor = devtools.currentIndex;

		metaElement.textContent = `${String(entries.length)} ${entries.length === 1 ? 'action' : 'actions'} · at step #${String(cursor + 1)}`;
		logElement.replaceChildren(
			...(entries.length === 0
				? [
					el('div', {
						className: 'fe-devtools-log__empty',
						text: 'No actions yet. Interact with a filter to record one.',
					}),
				]
				: entries.map((entry, index) =>
					logRow(entry, index === cursor, () => {
						commitTo(index);
					}),
				)),
		);
		dotsElement.replaceChildren(
			...entries.map((_entry, index) =>
				el('span', {
					attrs: { 'aria-hidden': 'true' },
					className: `fe-devtools-dot${index === cursor ? ' fe-devtools-dot--active' : ''}`,
				}),
			),
		);
		stripElement.setAttribute('aria-valuemax', String(Math.max(0, entries.length - 1)));
		stripElement.setAttribute('aria-valuenow', String(cursor));
		timelineElement.classList.toggle('fe-devtools-timeline--empty', entries.length === 0);
		setHidden(captionElement, entries.length === 0);

		requestAnimationFrame(() => {
			logElement
				.querySelector<HTMLElement>('[aria-current="true"]')
				?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		});
	}

	// The keyboard shortcuts are writes too, so they take the same guard and busy mark as the buttons.
	const detachKeyboard = attachUndoRedoKeyboard({
		redo: () => {
			if (devtools.canRedo) {
				markBusy?.();
				devtools.redo();
			}
		},
		undo: () => {
			if (devtools.canUndo) {
				markBusy?.();
				devtools.undo();
			}
		},
	});

	update();

	return {
		dispose: detachKeyboard,
		// These three are one cluster, but stepping and inspecting are different jobs — hence the rule.
		headerControls: [
			undoButton,
			redoButton,
			el('span', { attrs: { 'aria-hidden': 'true' }, className: 'fe-icon-button-divider' }),
			toggleButton,
		],
		panelElement,
		update,
	};
}
