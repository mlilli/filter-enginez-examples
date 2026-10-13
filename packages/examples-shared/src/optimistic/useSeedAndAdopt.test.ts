/**
 * Tests for `useSeedAndAdopt` — the seed-and-adopt local state behind every optimistically painted
 * filter control.
 *
 * @remarks
 * The cases pin the contract a `useEffect` that copied the engine's value into local state would have
 * (seed, hold an optimistic paint, adopt an external change, keep a local value the engine merely
 * echoes) plus the one thing such an effect cannot do: commit an adopted value in the same pass as the
 * change, with no stale frame in between.
 */

import { act, renderHook } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { describe, expect, it } from 'vitest';

import { useSeedAndAdopt } from './useSeedAndAdopt.js';

/** Order-insensitive member equality — the comparison the chip and checkbox panels pass. */
function haveSameMembers(local: readonly string[], committed: readonly string[]): boolean {
	return local.length === committed.length && local.every((value) => committed.includes(value));
}

/** A shared empty selection, as the panels use, so the committed value is stable while unchanged. */
const EMPTY: readonly string[] = [];

describe('useSeedAndAdopt', () => {
	it('seeds the local value from the committed one', () => {
		const committed = ['red'];
		const { result } = renderHook(() => useSeedAndAdopt<readonly string[]>(committed, haveSameMembers));

		expect(result.current[0]).toBe(committed);
	});

	it('holds an optimistic paint while the committed value is unchanged', () => {
		const { rerender, result } = renderHook(
			({ committed }) => useSeedAndAdopt<readonly string[]>(committed, haveSameMembers),
			{ initialProps: { committed: EMPTY }},
		);

		act(() => {
			result.current[1](['red']);
		});
		rerender({ committed: EMPTY });

		expect(result.current[0]).toEqual(['red']);
	});

	it('adopts a committed value that changed from outside', () => {
		const { rerender, result } = renderHook(
			({ committed }) => useSeedAndAdopt<readonly string[]>(committed, haveSameMembers),
			{ initialProps: { committed: ['red', 'white'] as readonly string[] }},
		);

		// A clear-all: the engine's value drops back to the shared empty selection.
		rerender({ committed: EMPTY });

		expect(result.current[0]).toBe(EMPTY);
	});

	it('keeps the local value when the engine echoes an equivalent one', () => {
		const { rerender, result } = renderHook(
			({ committed }) => useSeedAndAdopt<readonly string[]>(committed, haveSameMembers),
			{ initialProps: { committed: EMPTY }},
		);
		const painted = ['red', 'white'];

		act(() => {
			result.current[1](painted);
		});
		// The engine confirms the same members as a new array, in a different order.
		rerender({ committed: ['white', 'red']});

		expect(result.current[0]).toBe(painted);
	});

	it('commits the adopted value in the same pass as the change, with no stale frame', () => {
		// What reached the screen, recorded once per commit. An effect-based adoption would commit
		// `[1, 2]` here: one frame of the stale value, then the effect's correction.
		const committedFrames: number[] = [];
		const { rerender } = renderHook(
			({ committed }) => {
				const [local] = useSeedAndAdopt(committed);

				useLayoutEffect(() => {
					committedFrames.push(local);
				});

				return local;
			},
			{ initialProps: { committed: 1 }},
		);

		committedFrames.length = 0;
		rerender({ committed: 2 });

		expect(committedFrames).toEqual([2]);
	});

	it('defaults to Object.is, so a different primitive is always adopted', () => {
		const { rerender, result } = renderHook(({ committed }) => useSeedAndAdopt(committed), {
			initialProps: { committed: 3 },
		});

		act(() => {
			result.current[1](7);
		});
		rerender({ committed: 4 });

		expect(result.current[0]).toBe(4);
	});
});
