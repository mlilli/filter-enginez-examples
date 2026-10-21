/**
 * `<DevtoolsPanelView />` — the dumb, controlled view for the devtools action-log surface: a
 * header, a scrollable color-coded row list, and a drag-scrubbable timeline.
 *
 * @remarks
 * All engine coupling — the action-log subscription, the optimistic cursor, `jumpTo`, and the
 * wire-entry→`DevtoolsLogEntry` normalization — lives in the app container. This component renders
 * from a plain `DevtoolsLogEntry[]` + a controlled `activeCursor` and emits three intent callbacks:
 *
 *   - `onJump(idx)` — a row was clicked (commit a time-travel).
 *   - `onScrub(idx)` — the timeline is mid-drag (optimistic preview only; no engine call).
 *   - `onCommit(idx)` — the timeline drag was released / a key committed (commit a time-travel).
 *
 * The container maps `onScrub` to its optimistic-cursor setter and `onJump`/`onCommit` to the
 * engine jump, so this view stays fully presentational.
 *
 * Styling is the `fe-devtools-*` classes in `@filter-enginez/ui-styles`. This is a browser-only
 * package, so DOM affordances (pointer capture, `requestAnimationFrame` auto-scroll) are fair game.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useRef } from 'react';

/**
 * One action-log row's display data — a presentation-only projection of the engine's action-log
 * entry (sync `ActionLogEntry` or worker `WireActionLogEntry`), produced by the container.
 */
export interface DevtoolsLogEntry {
	/** Canonical action type, e.g. `RULE_ADDED` / `RULE_REMOVED` (drives the color + short label). */
	readonly type: string;
	/** Epoch milliseconds, rendered as `HH:MM:SS`. */
	readonly timestamp: number;
	/** Human-friendly one-line summary, e.g. `<price>`. */
	readonly summary: string;
	/** Optional originating surface (`worker` / `main`), carried from the log entry's metadata; not rendered. */
	readonly source?: string;
}

/**
 * Props for `<DevtoolsPanelView />`.
 */
export interface DevtoolsPanelViewProps {
	/** The action log, oldest-first. */
	readonly entries: readonly DevtoolsLogEntry[];
	/** Currently-active (optimistic) cursor index — the highlighted row + timeline dot. */
	readonly activeCursor: number;
	/** When true, the row list + timeline dim and stop accepting input (engine round-trip in flight). */
	readonly isComputing: boolean;
	/** A row was clicked — commit a jump to `idx`. */
	readonly onJump: (idx: number) => void;
	/** The timeline is mid-drag — optimistic preview to `idx`, no engine call. */
	readonly onScrub: (idx: number) => void;
	/** The timeline drag released (or a key committed) — commit a jump to `idx`. */
	readonly onCommit: (idx: number) => void;
	/** The close affordance was activated. */
	readonly onClose: () => void;
}

/**
 * The devtools panel view — header + row list + timeline.
 */
export const DevtoolsPanelView = (props: DevtoolsPanelViewProps): React.ReactElement => {
	const { activeCursor, entries, isComputing, onClose, onCommit, onJump, onScrub } = props;

	return (
		<section aria-label="Devtools action log" className="fe-devtools-panel">
			<PanelHeader entries={entries} activeCursor={activeCursor} onClose={onClose} />
			<RowList entries={entries} activeCursor={activeCursor} isComputing={isComputing} onJump={onJump} />
			<TimelineScrubber
				entries={entries}
				activeCursor={activeCursor}
				isComputing={isComputing}
				onScrub={onScrub}
				onCommit={onCommit}
			/>
		</section>
	);
};

/**
 * Panel header — `DEVTOOLS · ACTION LOG` heading, close button, and the "N actions · at step #M"
 * meta line.
 *
 * @internal
 */
const PanelHeader = ({
	activeCursor,
	entries,
	onClose,
}: {
	readonly activeCursor: number;
	readonly entries: readonly DevtoolsLogEntry[];
	readonly onClose: () => void;
}): React.ReactElement => {
	return (
		<header className="fe-devtools-panel__header">
			<div className="fe-devtools-panel__header-top">
				<h2 className="fe-devtools-panel__title">
					Devtools <span className="fe-devtools-panel__title-sep">·</span> Action Log
				</h2>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close devtools"
					className="fe-devtools-panel__close"
				>
					<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
						<path d="M18 6 6 18M6 6l12 12" />
					</svg>
				</button>
			</div>
			<div className="fe-devtools-panel__meta">
				{entries.length} {entries.length === 1 ? 'action' : 'actions'}
				<span className="fe-devtools-panel__meta-sep">·</span>{' '}
				at step <span className="fe-devtools-panel__step">#{activeCursor + 1}</span>
			</div>
		</header>
	);
};

/**
 * Scrollable list of action rows. Dimmed + locked while `isComputing`. Auto-scrolls the active
 * row into view on every cursor change (covers click-to-jump, scrub commit, keyboard undo/redo,
 * and fresh actions appended off-screen).
 *
 * @internal
 */
const RowList = ({
	activeCursor,
	entries,
	isComputing,
	onJump,
}: {
	readonly activeCursor: number;
	readonly entries: readonly DevtoolsLogEntry[];
	readonly isComputing: boolean;
	readonly onJump: (idx: number) => void;
}): React.ReactElement => {
	const scrollRef = useRef<HTMLDivElement | null>(null);

	// Re-query `[aria-current="true"]` each effect rather than holding a row ref — the list churns
	// with `entries`. Defer to the next frame so layout has reflowed after the attribute flipped;
	// `block: 'nearest'` keeps the cursor visible without always recentering.
	useEffect(() => {
		const scroller = scrollRef.current;

		/* v8 ignore next 3 -- defensive: scrollRef is always attached after mount, so scroller is never null */
		if (scroller === null) {
			return undefined;
		}
		const rafHandle = window.requestAnimationFrame(() => {
			const activeRow = scroller.querySelector<HTMLElement>('[aria-current="true"]');

			if (activeRow === null) {
				return;
			}
			activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		});

		return () => {
			window.cancelAnimationFrame(rafHandle);
		};
	}, [activeCursor, entries.length]);

	return (
		<div
			ref={scrollRef}
			className={`fe-devtools-log${isComputing ? ' fe-devtools-log--computing' : ''}`}
		>
			{entries.length === 0
				? <div className="fe-devtools-log__empty">No actions yet. Interact with a filter to record one.</div>
				: entries.map((entry, idx) => (
					<LogRow
						key={`${entry.timestamp}-${entry.type}-${entry.summary}`}
						entry={entry}
						isActive={idx === activeCursor}
						onJump={() => onJump(idx)}
					/>
				))}
		</div>
	);
};

/**
 * Single action row — timestamp, color-coded action type, summary, jump marker. A real `<button>`
 * for keyboard focus + Enter/Space activation.
 *
 * @internal
 */
const LogRow = ({
	entry,
	isActive,
	onJump,
}: {
	readonly entry: DevtoolsLogEntry;
	readonly isActive: boolean;
	readonly onJump: () => void;
}): React.ReactElement => {
	const time = formatTime(entry.timestamp);
	const shortType = ACTION_TYPE_SHORT[entry.type] ?? entry.type.toLowerCase();
	const typeModifier = typeModifierForActionType(entry.type);

	return (
		<button
			type="button"
			onClick={onJump}
			aria-label={`Jump to action ${shortType} at ${time}`}
			aria-current={isActive ? 'true' : undefined}
			className={`fe-devtools-row${isActive ? ' fe-devtools-row--active' : ''}`}
		>
			<span className="fe-devtools-row__time">{time}</span>
			<span className={`fe-devtools-row__type fe-devtools-row__type--${typeModifier}`}>{shortType}</span>
			<span className="fe-devtools-row__summary" title={entry.summary}>{entry.summary}</span>
			<span aria-hidden="true" className="fe-devtools-row__marker">{isActive ? '●' : '→'}</span>
		</button>
	);
};

/**
 * Bottom timeline — a single pointer-capture strip implementing drag-to-scrub. Pointer-down
 * latches + snaps to nearest index (optimistic), pointer-move re-snaps, pointer-up commits.
 * Arrow / Home / End scrub via the keyboard (each keystroke is an atomic commit).
 *
 * @internal
 */
const TimelineScrubber = ({
	activeCursor,
	entries,
	isComputing,
	onCommit,
	onScrub,
}: {
	readonly activeCursor: number;
	readonly entries: readonly DevtoolsLogEntry[];
	readonly isComputing: boolean;
	readonly onCommit: (idx: number) => void;
	readonly onScrub: (idx: number) => void;
}): React.ReactElement => {
	const stripRef = useRef<HTMLDivElement | null>(null);
	const draggingRef = useRef(false);
	const lastScrubIdxRef = useRef(activeCursor);

	// Map clientX → nearest action index: linear interpolation across the strip's usable width
	// (minus the 6px inset that aligns the end dots with the line ends), clamped + rounded.
	const indexFromPointer = useCallback((clientX: number): number => {
		const strip = stripRef.current;

		/* v8 ignore next 3 -- defensive: stripRef is attached whenever a pointer handler can fire (the strip renders only when entries.length > 0) */
		if (strip === null) {
			return 0;
		}
		const rect = strip.getBoundingClientRect();
		const usableWidth = rect.width - 12;

		if (usableWidth <= 0) {
			return 0;
		}
		const offsetX = Math.max(0, Math.min(usableWidth, clientX - rect.left - 6));

		if (entries.length === 1) {
			return 0;
		}
		const ratio = offsetX / usableWidth;

		return Math.round(ratio * (entries.length - 1));
	}, [entries.length]);

	const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
		if (isComputing) {
			return;
		}
		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		draggingRef.current = true;
		const idx = indexFromPointer(event.clientX);

		lastScrubIdxRef.current = idx;
		onScrub(idx);
	}, [indexFromPointer, isComputing, onScrub]);

	const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
		if (!draggingRef.current) {
			return;
		}
		const idx = indexFromPointer(event.clientX);

		if (idx !== lastScrubIdxRef.current) {
			lastScrubIdxRef.current = idx;
			onScrub(idx);
		}
	}, [indexFromPointer, onScrub]);

	const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
		if (!draggingRef.current) {
			return;
		}
		draggingRef.current = false;
		try {
			event.currentTarget.releasePointerCapture(event.pointerId);
		} catch { /* tolerate */ }
		onCommit(lastScrubIdxRef.current);
	}, [onCommit]);

	const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>): void => {
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			const next = Math.max(0, activeCursor - 1);

			onScrub(next);
			onCommit(next);
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			const next = Math.min(entries.length - 1, activeCursor + 1);

			onScrub(next);
			onCommit(next);
		} else if (event.key === 'Home') {
			event.preventDefault();
			onScrub(0);
			onCommit(0);
		} else if (event.key === 'End') {
			event.preventDefault();
			onScrub(entries.length - 1);
			onCommit(entries.length - 1);
		}
	}, [activeCursor, entries.length, onScrub, onCommit]);

	if (entries.length === 0) {
		return (
			<footer className="fe-devtools-timeline fe-devtools-timeline--empty">
				scrub timeline · click an action to jump
			</footer>
		);
	}

	return (
		<footer className={`fe-devtools-timeline${isComputing ? ' fe-devtools-timeline--computing' : ''}`}>
			<div
				ref={stripRef}
				role="slider"
				aria-label="Action log scrubber — drag to time-travel"
				aria-valuemin={0}
				aria-valuemax={entries.length - 1}
				aria-valuenow={activeCursor}
				tabIndex={0}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onPointerCancel={handlePointerUp}
				onKeyDown={handleKeyDown}
				className="fe-devtools-timeline__strip"
			>
				<div aria-hidden="true" className="fe-devtools-timeline__line" />
				<div className="fe-devtools-timeline__dots">
					{entries.map((entry, idx) => (
						<TimelineDot key={`${entry.timestamp}-${entry.type}-${entry.summary}`} isActive={idx === activeCursor} />
					))}
				</div>
			</div>
			<div className="fe-devtools-timeline__caption">
				scrub timeline <span className="fe-devtools-timeline__caption-sep">·</span>{' '}
				click an action to jump
			</div>
		</footer>
	);
};

/**
 * Single timeline dot. Active dot gets a ring + larger size + brighter glow. Pointer events are
 * disabled — the parent strip owns drag/click via the `indexFromPointer` math.
 *
 * @internal
 */
const TimelineDot = ({ isActive }: { readonly isActive: boolean }): React.ReactElement => {
	return <span aria-hidden="true" className={`fe-devtools-dot${isActive ? ' fe-devtools-dot--active' : ''}`} />;
};

/**
 * Map an action type to its row color modifier: destructive ops `danger`, additive ops `added`,
 * everything else `neutral`.
 *
 * @internal
 */
function typeModifierForActionType(type: string): 'added' | 'danger' | 'neutral' {
	if (type === 'RULE_REMOVED' || type === 'GROUP_REMOVED' || type === 'RULES_CLEARED' || type === 'RESET' || type === 'WORKING_SET_RESET') {
		return 'danger';
	}
	if (type === 'RULE_ADDED' || type === 'GROUP_ADDED') {
		return 'added';
	}

	return 'neutral';
}

/**
 * Format a timestamp as `HH:MM:SS`.
 *
 * @internal
 */
function formatTime(ts: number): string {
	const d = new Date(ts);
	const h = String(d.getHours()).padStart(2, '0');
	const m = String(d.getMinutes()).padStart(2, '0');
	const s = String(d.getSeconds()).padStart(2, '0');

	return `${h}:${m}:${s}`;
}

/**
 * Short labels for the action-type column — matches the design-system preview's voice.
 *
 * @internal
 */
const ACTION_TYPE_SHORT: Record<string, string> = {
	EXPRESSION_SET: 'setExpression',
	GROUP_ADDED: 'addGroup',
	GROUP_REMOVED: 'removeGroup',
	RESET: 'reset',
	RULE_ADDED: 'addRule',
	RULE_CHANGED: 'changeRule',
	RULE_REMOVED: 'removeRule',
	RULES_CLEARED: 'clearRules',
	SOURCE_DATA_SET: 'setSourceData',
	WORKING_SET_RESET: 'resetWorkingSet',
	WORKING_SET_SET: 'setWorkingSet',
};
