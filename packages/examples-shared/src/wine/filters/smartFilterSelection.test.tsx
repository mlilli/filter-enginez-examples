/**
 * Tests for `smartFilterSelection`: the panel-level smart-filter selection and the
 * `leaveExpressionMode` step every facet section runs before it commits.
 *
 * @remarks
 * The preset row's own behavior is pinned by `SmartFilterPresets.test.tsx`, and the panel-level
 * handshake (a facet click dropping a lit preset) by `WineFilterPanel.test.tsx`. This file covers what
 * neither reaches: the hooks outside a panel, and `leaveExpressionMode` driven directly.
 */

import { createFilterEngine } from '@filter-enginez/core';
import { type Wine, wines } from '@filter-enginez/mock-data/wine';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildSmartFilterExpression } from '../smartFilters.js';
import {
	SmartFilterSelectionContext,
	useLeaveExpressionMode,
	useSmartFilterSelection,
	useSmartFilterSelectionState,
} from './smartFilterSelection.js';

// No auto-cleanup in this workspace (no `globals: true`), so trees would otherwise accumulate.
afterEach(cleanup);

/** A small deterministic slice; the selection only needs an engine to derive from. */
const CORPUS: readonly Wine[] = wines.slice(0, 50);

/**
 * Render the panel-level selection hook over a real engine.
 *
 * @returns The engine core and the hook's live result.
 */
function renderSelection(): {
	readonly core: ReturnType<typeof createFilterEngine<Wine>>;
	readonly result: { readonly current: ReturnType<typeof useSmartFilterSelectionState> };
} {
	const core = createFilterEngine<Wine>({ sourceData: CORPUS });
	const engine = createSignalsEngine(core);
	const { result } = renderHook(() => useSmartFilterSelectionState(), {
		wrapper: ({ children }) => <FilterEngineProvider engine={engine}>{children}</FilterEngineProvider>,
	});

	return { core, result };
}

describe('useSmartFilterSelectionState', () => {
	it('derives the lit presets from the engine expression', () => {
		const { core, result } = renderSelection();

		expect(result.current.selectedIds).toEqual([]);

		act(() => {
			core.setExpression(buildSmartFilterExpression(['cellar-picks']));
		});
		expect(result.current.selectedIds).toEqual(['cellar-picks']);
	});

	it('leaveExpressionMode turns the presets off and leaves expression mode', () => {
		const { core, result } = renderSelection();

		act(() => {
			core.setExpression(buildSmartFilterExpression(['bold-reds']));
		});
		act(() => {
			result.current.leaveExpressionMode();
		});

		expect(result.current.selectedIds).toEqual([]);
		expect(core.getExpression()).toBeNull();
	});

	it('leaveExpressionMode writes nothing when no preset is lit', () => {
		const { core, result } = renderSelection();
		const setExpression = vi.spyOn(core, 'setExpression');

		act(() => {
			result.current.leaveExpressionMode();
		});

		expect(setExpression).not.toHaveBeenCalled();
	});
});

describe('outside <WineFilterPanel>', () => {
	it('useLeaveExpressionMode answers a no-op, since there is no preset to leave', () => {
		const { result } = renderHook(() => useLeaveExpressionMode());

		expect(result.current()).toBeUndefined();
	});

	it('useSmartFilterSelection throws, naming the panel that provides it', () => {
		expect(() => renderHook(() => useSmartFilterSelection())).toThrow('inside <WineFilterPanel>');
	});

	it('useSmartFilterSelection returns the provided selection inside one', () => {
		const provided = { leaveExpressionMode: vi.fn(), paintSelection: vi.fn(), selectedIds: ['pinot-any']};
		const { result } = renderHook(() => useSmartFilterSelection(), {
			wrapper: ({ children }) => <SmartFilterSelectionContext value={provided}>{children}</SmartFilterSelectionContext>,
		});

		expect(result.current).toBe(provided);
	});
});
