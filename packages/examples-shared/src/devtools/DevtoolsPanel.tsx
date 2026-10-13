/**
 * `<DevtoolsPanel />` — the engine's action log and time-travel timeline, as an inline card.
 *
 * @remarks
 * **This is core's devtools, not Redux's.** The panel reads `engine.core.devtools.actionLog` and
 * `.currentIndex`, and time-travels with `.jumpTo()`. All three live in `@filter-enginez/core`
 * alongside `TimeTravel`, `Replay` and `Diff` — no store library anywhere in the path. That is why the
 * Redux-free React app has always carried the identical surface, and it is the reason this can be
 * ported to Svelte, Vue, Angular and the vanilla app: only the VIEW is React.
 *
 * (Core's separate `ReduxDevtoolsBridge` pipes the same log to the Redux DevTools browser extension
 * over JSON-RPC. That is an optional export channel and has nothing to do with this component.)
 *
 * ### Container / view split
 *
 * All presentation — the header, the color-coded rows, the drag-scrubbable timeline, the dots — is in
 * the engine-free `<DevtoolsPanelView />` in `@filter-enginez/react-ui`. This container keeps only the
 * engine-coupled concerns: the subscription and the optimistic cursor. `normalizeEntry` lives in
 * `./devtools-core`, shared with the non-React ports — see that module's docblock.
 *
 * ### Dataset-agnostic by parameter, not by luck
 *
 * Busy state arrives as props, so the same component serves books, wine and real estate — each app
 * shell passing its own dataset's tracker. Nothing else in it is dataset-specific.
 *
 * ### The optimistic cursor
 *
 * Clicking a timeline row tints it active immediately rather than waiting for the engine round trip;
 * the engine cursor catches up a beat later and re-syncs. Without it the timeline feels broken on the
 * worker tier, where the jump is a message round trip — the user clicks, nothing moves, they click
 * again. Re-syncing on every external change is what makes keyboard undo / redo move the cursor too.
 *
 * @packageDocumentation
 */

import { useFilterEngine, useLastChange } from '@filter-enginez/react-signals';
import { DevtoolsPanelView } from '@filter-enginez/react-ui';
import { useCallback } from 'react';

import { useSeedAndAdopt } from '../optimistic/useSeedAndAdopt.js';
import { commitFilterMutation } from '../scheduling/index.js';
import { normalizeEntry } from './devtoolsCore.js';

/**
 * Props for {@link DevtoolsPanel}.
 */
export interface DevtoolsPanelProps {
	/**
	 * Whether the engine is mid-recompute — dims the panel and blocks jumps.
	 *
	 * @remarks
	 * A prop rather than a hook call, because the busy tracker is per-dataset. The app shell already
	 * holds the right one; making the panel choose would mean the panel knowing which dataset it is in,
	 * which is exactly the coupling this slice exists to drop.
	 */
	readonly isComputing: boolean;
	/** Bump the dataset's user-action version. Called before a jump, so the indicator lights at once. */
	readonly markBusy: () => void;
	/** Called when the user dismisses the panel. */
	readonly onClose: () => void;
	/** Whether the panel is currently visible. Toggled from the page header. */
	readonly open: boolean;
}

/**
 * The devtools container — wires the engine action log + time-travel to the presentational view.
 */
export const DevtoolsPanel = (props: DevtoolsPanelProps): React.ReactElement | null => {
	const { isComputing, markBusy, onClose, open: isOpen } = props;
	const engine = useFilterEngine();

	// Re-render when the log grows. The value is unused; the SUBSCRIPTION is the point.
	useLastChange();

	const devtools = engine.core.devtools;
	const rawEntries = devtools.actionLog.toArray() as readonly unknown[];
	const entries = rawEntries.map(normalizeEntry);
	const engineCursor = devtools.currentIndex;

	// Seeded from the engine cursor and re-adopted whenever it moves (a jump landing, keyboard undo /
	// redo); in between, a click or a scrub paints ahead of it.
	const [optimisticCursor, setOptimisticCursor] = useSeedAndAdopt(engineCursor);

	const handleJump = useCallback((idx: number): void => {
		if (isComputing) {
			return;
		}
		// Paint the cursor, then the busy state, then the jump — each its own frame, the same
		// interaction order every filter handler uses.
		commitFilterMutation({
			callEngine: () => devtools.jumpTo(idx),
			markBusy,
			paintOptimisticUi: () => setOptimisticCursor(idx),
		});
	}, [devtools, isComputing, markBusy, setOptimisticCursor]);

	// Inline mount — render nothing when closed, so a closed panel costs no subscription-driven DOM.
	if (!isOpen) {
		return null;
	}

	return (
		<DevtoolsPanelView
			entries={entries}
			activeCursor={optimisticCursor}
			isComputing={isComputing}
			onJump={handleJump}
			onScrub={setOptimisticCursor}
			onCommit={handleJump}
			onClose={onClose}
		/>
	);
};

// ─── Engine-shape-coupled normalization (stays in the container) ──────────────
