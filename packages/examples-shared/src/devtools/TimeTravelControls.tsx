/**
 * `<TimeTravelControls />` — the header cluster: undo, redo, and the devtools toggle.
 *
 * @remarks
 * **These are the engine's own devtools, not Redux's.** `engine.core.devtools` is an LRU action log
 * plus a time-travel cursor living in `@filter-enginez/core` — no store library involved, which is why
 * the Redux-free React app carries the identical surface and why every other vertical can too. The
 * separate `ReduxDevtoolsBridge` in core pipes the same log to the browser EXTENSION over JSON-RPC;
 * that is an optional export channel, not the mechanism behind this panel.
 *
 * Undo / redo live in the page header rather than inside the devtools panel, deliberately: they are
 * ordinary editing affordances that a user reaches for after a misclick, and burying them behind a
 * developer surface makes the common case require the rare one. The panel is the timeline; these are
 * the two steps either side of the cursor.
 *
 * Both buttons are always rendered and disabled when there is nothing to step to — see
 * {@link HeaderIconButton} for why disabled beats absent here.
 *
 * @packageDocumentation
 */

import { useFilterEngine } from '@filter-enginez/react-signals';
import { useUndoRedoKeyboard } from '@filter-enginez/react-signals/keyboard';
import { useCallback } from 'react';

import { HeaderIconButton } from './HeaderIconButton.js';

/**
 * Props for {@link TimeTravelControls}.
 */
export interface TimeTravelControlsProps {
	/** Edge length for each button. 36 on desktop, 44 on touch. */
	readonly controlSizePx: number;
	/** Whether the devtools panel is currently open — drives the toggle's pressed state. */
	readonly isDevtoolsOpen: boolean;
	/**
	 * Bump the dataset's user-action version, so the computing indicator lights on the same frame.
	 *
	 * @remarks
	 * A prop because the busy tracker is per-dataset. Undo and redo are engine mutations like any
	 * other — an undo over 130k rows takes exactly as long as the filter it reverses, and skipping this
	 * makes the app look frozen for the duration rather than busy.
	 */
	readonly markBusy: () => void;
	/** Flip the panel open or closed. */
	readonly onToggleDevtools: () => void;
}

/**
 * Undo / redo / devtools-toggle, reading the engine's time-travel cursor from context.
 */
export const TimeTravelControls = (props: TimeTravelControlsProps): React.ReactElement => {
	const { controlSizePx, isDevtoolsOpen, markBusy, onToggleDevtools } = props;
	const engine = useFilterEngine();
	const devtools = engine.core.devtools;

	// Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z / Cmd/Ctrl+Y (redo), wired HERE rather than per app so
	// the label these buttons carry is true wherever the cluster renders — wine, books and real estate
	// alike.
	//
	// The binding gates on focus — keystrokes inside <input>/<textarea>/[contenteditable] pass through
	// so the browser's native undo owns those. Otherwise it routes to `devtools.undo()` / `.redo()`,
	// which on the worker-backed adapter dispatch through the shim's `bumpAfterTimeTravel` so every
	// mirror and the panel update in lockstep.
	useUndoRedoKeyboard(engine);


	const handleUndo = useCallback((): void => {
		if (!devtools.canUndo) {
			return;
		}
		markBusy();
		devtools.undo();
	}, [devtools, markBusy]);

	const handleRedo = useCallback((): void => {
		if (!devtools.canRedo) {
			return;
		}
		markBusy();
		devtools.redo();
	}, [devtools, markBusy]);

	return (
		<>
			<HeaderIconButton
				label="Undo (Cmd/Ctrl+Z)"
				onClick={handleUndo}
				disabled={!devtools.canUndo}
				sizePx={controlSizePx}
			>
				<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
					<path d="M9 14 4 9l5-5" />
					<path d="M4 9h11a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4h-3" />
				</svg>
			</HeaderIconButton>
			<HeaderIconButton
				label="Redo (Cmd/Ctrl+Shift+Z)"
				onClick={handleRedo}
				disabled={!devtools.canRedo}
				sizePx={controlSizePx}
			>
				<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
					<path d="m15 14 5-5-5-5" />
					<path d="M20 9H9a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h3" />
				</svg>
			</HeaderIconButton>

			{/* Divider — these three are one cluster, but stepping and inspecting are different jobs. */}
			<span style={{ background: 'var(--gray-4)', height: '20px', margin: '0 4px', width: '1px' }} />

			{/* The toggle is CYAN when open, per the dual-accent contract: it names a surface you are
			    looking at (identity), not work the engine is doing (which would be phosphor). */}
			<button
				type="button"
				onClick={onToggleDevtools}
				aria-pressed={isDevtoolsOpen}
				aria-label={isDevtoolsOpen ? 'Hide devtools' : 'Show devtools'}
				title={isDevtoolsOpen ? 'Hide devtools' : 'Show devtools (action log + time-travel)'}
				className="inline-flex items-center justify-center transition-colors"
				style={{
					background: isDevtoolsOpen ? 'rgba(34, 211, 238, 0.10)' : 'var(--gray-2)',
					border: `1px solid ${isDevtoolsOpen ? 'var(--accent)' : 'var(--gray-4)'}`,
					borderRadius: 'var(--radius-md)',
					color: isDevtoolsOpen ? 'var(--accent)' : 'var(--gray-8)',
					cursor: 'pointer',
					height: `${String(controlSizePx)}px`,
					padding: 0,
					width: `${String(controlSizePx)}px`,
				}}
			>
				{/* A terminal prompt, `>_` — the most legible eight-pixel shorthand for "developer
				    surface" available, and it needs no text label beside it. */}
				<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
					<path d="m5 8 4 4-4 4" />
					<path d="M13 16h6" />
				</svg>
			</button>
		</>
	);
};
