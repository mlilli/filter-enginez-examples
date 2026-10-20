/**
 * `smartFilterSelection` — the wine panel's lit smart-filter presets, held once for the whole panel.
 *
 * @remarks
 * **Panel state, not preset-row state.** Two parts of the panel need the same selection: the preset
 * row, which lights its chips from it, and every manual facet section, which drops the preset before
 * it commits (see {@link SmartFilterSelection.leaveExpressionMode}). So `<WineFilterPanel>` owns it
 * and hands it down through {@link SmartFilterSelectionContext}. That is the same split as the
 * SvelteKit, Vue and Angular panels, which each hold `activePresets` in the panel and pass it to both
 * their preset component and their sections.
 *
 * **The selection derives from the engine's expression, through `useSeedAndAdopt`.** The lit presets
 * are `deriveSelectedPresetIds(expression)`, re-read whenever the expression signal changes: a `?f`
 * restore, Back / Forward, devtools time travel, the results header's "Clear all".
 *
 * Deriving matters most at mount. `<FilterEngineUrlSync>` restores `?f` in an effect, and effects run
 * only after the whole tree has rendered, so the panel renders BEFORE the restore whenever the two
 * mount together: a value read once at mount is always the pre-restore one. On the worker tier the
 * expression then lands a round trip later still. Either way the chips light when it arrives.
 *
 * **A click paints at once and never flickers.** On the worker tier the expression signal updates a
 * round trip AFTER the write, so the preset row paints the local selection first, in the order the
 * engine's echo will derive it in. When the echo lands it is member-for-member equal, and
 * `useSeedAndAdopt` keeps the local value instead of replacing it.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { useExpression, useFilterEngine } from '@filter-enginez/react-signals';
import { createContext, use, useCallback, useMemo } from 'react';

import { useSeedAndAdopt } from '../../optimistic/useSeedAndAdopt.js';
import { deriveSelectedPresetIds } from '../smartFilters.js';
import { exitExpressionMode } from '../wine-domain/commit.js';
import { EMPTY_SELECTION, sameSelection } from './filterConfig.js';

/** The panel's smart-filter selection, and the two ways the panel changes it. */
export interface SmartFilterSelection {
	/** The lit preset ids, in `WINE_SMART_FILTERS` order. */
	readonly selectedIds: readonly string[];
	/**
	 * Paint a selection ahead of the engine's echo.
	 *
	 * @remarks
	 * Paint only: the caller writes the engine itself, through `commitSmartFilterSelection`.
	 */
	readonly paintSelection: (presetIds: readonly string[]) => void;
	/**
	 * Drop any active preset, because a manual facet is about to commit.
	 *
	 * @remarks
	 * Called by every facet section before its own write. The engine refuses a flat rule while an
	 * expression is set, and the facet sections are locked (`inert`) only once the engine's MODE says
	 * expression; on the worker tier that lands a round trip after the preset click, so a keystroke in
	 * between would otherwise reach a section the engine is about to ignore. A no-op when no preset is
	 * lit, so a slider drag on a flat-map panel puts nothing on the action log.
	 */
	readonly leaveExpressionMode: () => void;
}

/**
 * The panel's selection, provided by `<WineFilterPanel>`.
 *
 * @remarks
 * `null` outside a panel. A facet section rendered on its own has no preset to leave, so
 * {@link useLeaveExpressionMode} answers a no-op there; the preset row, which cannot work without
 * the selection, throws instead (see {@link useSmartFilterSelection}).
 */
export const SmartFilterSelectionContext = createContext<SmartFilterSelection | null>(null);

/** What a facet section calls outside a panel, where there is no preset to leave. */
const NO_PRESET_TO_LEAVE = (): void => undefined;

/**
 * Hold the panel's smart-filter selection. Called once, by `<WineFilterPanel>`.
 *
 * @returns The selection to provide through {@link SmartFilterSelectionContext}.
 */
export function useSmartFilterSelectionState(): SmartFilterSelection {
	const engine = useFilterEngine<Wine>();
	const expression = useExpression();
	// Memoized on the expression so the derived ids keep their identity until the expression changes:
	// `useSeedAndAdopt` treats a new array as a new commit.
	const committedIds = useMemo(() => deriveSelectedPresetIds(expression), [expression]);
	const [selectedIds, setSelectedIds] = useSeedAndAdopt<readonly string[]>(committedIds, sameSelection);

	const leaveExpressionMode = useCallback((): void => {
		if (selectedIds.length === 0) {
			return;
		}
		setSelectedIds(EMPTY_SELECTION);
		exitExpressionMode(engine);
	}, [engine, selectedIds, setSelectedIds]);

	return useMemo<SmartFilterSelection>(
		() => ({ leaveExpressionMode, paintSelection: setSelectedIds, selectedIds }),
		[leaveExpressionMode, selectedIds, setSelectedIds],
	);
}

/**
 * Read the panel's smart-filter selection.
 *
 * @returns The selection `<WineFilterPanel>` provides.
 * @throws Error when rendered outside `<WineFilterPanel>`, which owns the selection.
 */
export function useSmartFilterSelection(): SmartFilterSelection {
	const selection = use(SmartFilterSelectionContext);

	if (selection === null) {
		throw new Error('useSmartFilterSelection() must be called inside <WineFilterPanel>, which provides the selection.');
	}

	return selection;
}

/**
 * The step every facet section runs before it commits: drop any active preset.
 *
 * @returns The panel's `leaveExpressionMode`, or a no-op outside a panel.
 */
export function useLeaveExpressionMode(): () => void {
	return use(SmartFilterSelectionContext)?.leaveExpressionMode ?? NO_PRESET_TO_LEAVE;
}
