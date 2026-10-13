/**
 * Tests for the debounced typeahead binding.
 *
 * @remarks
 * Fake timers throughout: the debounce is the whole point, and a real 250ms wait per case would make
 * this the slowest file in the package while testing the same thing less precisely.
 *
 * **The subtle behavior is the echo check, and it is worth stating plainly.** When the hook commits a
 * query, the engine's rule changes, the parent re-renders, and `ruleQuery` comes back holding the
 * value the hook just sent. That is indistinguishable in shape from an EXTERNAL change (a clear-all,
 * a reset) — and the two need opposite handling. Adopting an echo yanks the input back to whatever
 * was committed, discarding characters typed in the meantime; ignoring a genuine external change
 * leaves the box showing a filter that is no longer applied. `lastCommittedRef` is what tells them
 * apart, so both directions are tested here.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTypeaheadSearch } from './useTypeaheadSearch.js';

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

/** The full query every case types toward. */
const QUERY = 'merlot';

/** A prefix of {@link QUERY}, derived rather than written out so no half-word literals appear here. */
function prefix(length: number): string {
	return QUERY.slice(0, length);
}

/** Advance past the default debounce window. */
function settle(ms = 300): void {
	act(() => {
		vi.advanceTimersByTime(ms);
	});
}

describe('mirrored value', () => {
	it('starts from the rule query', () => {
		const { result } = renderHook(() => useTypeaheadSearch({ commit: vi.fn(), ruleQuery: 'merlot' }));

		expect(result.current.value).toBe('merlot');
	});

	it('updates on every keystroke, without waiting for the debounce', () => {
		// The input is controlled by this value. Debouncing the DISPLAY as well as the commit would
		// make typing feel broken — characters would appear a quarter-second late.
		const { result } = renderHook(() => useTypeaheadSearch({ commit: vi.fn(), ruleQuery: '' }));

		act(() => {
			result.current.onChange('me');
		});

		expect(result.current.value).toBe('me');
	});
});

describe('debounced commit', () => {
	it('does not commit until the pause elapses', () => {
		const commit = vi.fn();
		const { result } = renderHook(() => useTypeaheadSearch({ commit, ruleQuery: '' }));

		act(() => {
			result.current.onChange('merlot');
		});

		expect(commit).not.toHaveBeenCalled();

		settle();

		expect(commit).toHaveBeenCalledWith('merlot');
	});

	it('coalesces a burst of keystrokes into ONE commit', () => {
		// The reason the hook exists. Six keystrokes against a 130k-record engine is six full filter
		// passes; the user only ever wanted the last one.
		const commit = vi.fn();
		const { result } = renderHook(() => useTypeaheadSearch({ commit, ruleQuery: '' }));

		for (let length = 1; length <= QUERY.length; length += 1) {
			act(() => {
				result.current.onChange(prefix(length));
			});
			act(() => {
				vi.advanceTimersByTime(50);
			});
		}
		settle();

		expect(commit).toHaveBeenCalledTimes(1);
		expect(commit).toHaveBeenCalledWith('merlot');
	});

	it('honors a custom debounce window', () => {
		const commit = vi.fn();
		const { result } = renderHook(() => useTypeaheadSearch({ commit, debounceMs: 1000, ruleQuery: '' }));

		act(() => {
			result.current.onChange('merlot');
		});
		act(() => {
			vi.advanceTimersByTime(300);
		});

		expect(commit).not.toHaveBeenCalled();

		act(() => {
			vi.advanceTimersByTime(700);
		});

		expect(commit).toHaveBeenCalledWith('merlot');
	});
});

describe('immediate flush', () => {
	it('commits at once and cancels the pending debounce', () => {
		// Blur / Enter / clear. The cancel matters as much as the flush: without it the timer would
		// fire afterwards and commit a second time.
		const commit = vi.fn();
		const { result } = renderHook(() => useTypeaheadSearch({ commit, ruleQuery: '' }));

		act(() => {
			result.current.onChange('merlot');
		});
		act(() => {
			result.current.onCommit('merlot');
		});

		expect(commit).toHaveBeenCalledTimes(1);

		settle();

		expect(commit).toHaveBeenCalledTimes(1);
	});

	it('flushes a newer value without the stale pending one landing afterwards', () => {
		// The case that makes the explicit cancel load-bearing, and the one I nearly missed.
		//
		// When the flushed value EQUALS the pending one, the dedup guard alone swallows the late timer,
		// so removing `clearTimer()` from `onCommit` looks harmless. It is not: type a prefix, pause
		// into the debounce, then blur having typed the whole word. Without the cancel, the stale timer
		// fires afterwards with the PREFIX — a different value, so dedup lets it through, and the engine
		// ends up filtering on the prefix while the input reads the full word. The user sees results
		// that do not match the box they are looking at.
		const commit = vi.fn();
		const { result } = renderHook(() => useTypeaheadSearch({ commit, ruleQuery: '' }));

		act(() => {
			result.current.onChange(prefix(4));
		});
		act(() => {
			result.current.onCommit(QUERY);
		});

		expect(commit).toHaveBeenCalledWith(QUERY);

		settle();

		expect(commit).toHaveBeenCalledTimes(1);
		expect(commit).not.toHaveBeenCalledWith(prefix(4));
	});
});

describe('trimming and deduplication', () => {
	it('commits the trimmed query', () => {
		const commit = vi.fn();
		const { result } = renderHook(() => useTypeaheadSearch({ commit, ruleQuery: '' }));

		act(() => {
			result.current.onCommit('  merlot  ');
		});

		expect(commit).toHaveBeenCalledWith('merlot');
	});

	it('does not commit a value that only differs by whitespace', () => {
		// Trailing-space keystrokes are common. Re-committing an identical trimmed query would rebuild
		// the rule and re-run the whole filter for no change at all.
		const commit = vi.fn();
		const { result } = renderHook(() => useTypeaheadSearch({ commit, ruleQuery: 'merlot' }));

		act(() => {
			result.current.onCommit('merlot ');
		});

		expect(commit).not.toHaveBeenCalled();
	});

	it('does not re-commit the same query twice', () => {
		const commit = vi.fn();
		const { result } = renderHook(() => useTypeaheadSearch({ commit, ruleQuery: '' }));

		act(() => {
			result.current.onCommit('merlot');
		});
		act(() => {
			result.current.onCommit('merlot');
		});

		expect(commit).toHaveBeenCalledTimes(1);
	});

	it('commits an empty query — clearing IS a change', () => {
		// The clear button's path. Deduping this away would leave the filter applied with an empty box.
		const commit = vi.fn();
		const { result } = renderHook(() => useTypeaheadSearch({ commit, ruleQuery: 'merlot' }));

		act(() => {
			result.current.onCommit('');
		});

		expect(commit).toHaveBeenCalledWith('');
	});
});

describe('external re-sync versus our own echo', () => {
	it('adopts a genuine external change', () => {
		// Clear-all elsewhere in the panel. The box must empty, or it shows a filter that is gone.
		const { rerender, result } = renderHook(
			({ ruleQuery }) => useTypeaheadSearch({ commit: vi.fn(), ruleQuery }),
			{ initialProps: { ruleQuery: 'merlot' }},
		);

		rerender({ ruleQuery: '' });

		expect(result.current.value).toBe('');
	});

	it('does NOT clobber in-flight typing when the rule echoes our own commit', () => {
		// The case the ref exists for. The user commits a prefix, keeps typing the rest, and THEN the
		// parent re-renders with that prefix — our own value coming back around. Adopting it would
		// snap the input back to the prefix and eat the characters typed since.
		const commit = vi.fn();
		const { rerender, result } = renderHook(
			({ ruleQuery }) => useTypeaheadSearch({ commit, ruleQuery }),
			{ initialProps: { ruleQuery: '' }},
		);

		act(() => {
			result.current.onCommit(prefix(4));
		});
		act(() => {
			result.current.onChange(QUERY);
		});

		rerender({ ruleQuery: prefix(4) });

		expect(result.current.value).toBe(QUERY);
	});

	it('adopts an external change that arrives after a commit', () => {
		// The echo check must not latch: once our value has come back, a LATER genuine change still
		// has to win, or clear-all stops working for the rest of the session.
		const commit = vi.fn();
		const { rerender, result } = renderHook(
			({ ruleQuery }) => useTypeaheadSearch({ commit, ruleQuery }),
			{ initialProps: { ruleQuery: '' }},
		);

		act(() => {
			result.current.onCommit('merlot');
		});
		rerender({ ruleQuery: 'merlot' });
		rerender({ ruleQuery: '' });

		expect(result.current.value).toBe('');
	});
});

describe('teardown', () => {
	it('cancels a pending debounce on unmount', () => {
		// A timer firing into a torn-down tree commits to an engine the route no longer shows, and in
		// React's dev build surfaces as a state-update-on-unmounted warning.
		const commit = vi.fn();
		const { result, unmount } = renderHook(() => useTypeaheadSearch({ commit, ruleQuery: '' }));

		act(() => {
			result.current.onChange('merlot');
		});
		unmount();
		settle();

		expect(commit).not.toHaveBeenCalled();
	});
});
