/**
 * Tests for `<SearchInput />` — the stateless search field with commit-on-blur/Enter and a
 * conditional clear-X.
 *
 * @remarks
 * jsdom render via `createElement`. `onChange` fires per keystroke; `onCommit` fires on blur,
 * Enter, and clear. The keyboard paths call `blur()` on the field, so the focus assertions
 * focus the input first, then check `document.activeElement` moved off it. Every commit path is
 * also exercised once with `onCommit` omitted to cover the `onCommit?.(…)` optional-call no-op.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SearchInput } from './SearchInput.js';

afterEach(cleanup);

/** The lone search field (role `searchbox` for `<input type="search">`). */
function field(): HTMLInputElement {
	return screen.getByRole('searchbox');
}

describe('SearchInput', () => {
	it('fires onChange per keystroke with the typed value', () => {
		const onChange = vi.fn();

		render(createElement(SearchInput, { ariaLabel: 'Search', onChange, value: '' }));
		fireEvent.change(field(), { target: { value: 'pinot' }});

		expect(onChange).toHaveBeenCalledWith('pinot');
	});

	it('commits the current value on blur', () => {
		const onCommit = vi.fn();

		render(createElement(SearchInput, { ariaLabel: 'Search', onChange: vi.fn(), onCommit, value: 'merlot' }));
		fireEvent.blur(field());

		expect(onCommit).toHaveBeenCalledWith('merlot');
	});

	it('commits and blurs on Enter', () => {
		const onCommit = vi.fn();

		render(createElement(SearchInput, { ariaLabel: 'Search', onChange: vi.fn(), onCommit, value: 'syrah' }));
		const input = field();

		input.focus();
		expect(document.activeElement).toBe(input);
		fireEvent.keyDown(input, { key: 'Enter' });

		expect(onCommit).toHaveBeenCalledWith('syrah');
		expect(document.activeElement).not.toBe(input);
	});

	it('blurs on Escape (the blur handler re-commits the already-current value — a harmless no-op for a controlled field)', () => {
		const onCommit = vi.fn();

		render(createElement(SearchInput, { ariaLabel: 'Search', onChange: vi.fn(), onCommit, value: 'gamay' }));
		const input = field();

		input.focus();
		fireEvent.keyDown(input, { key: 'Escape' });

		// Escape's only job is to drop focus; because the field is fully controlled there is no
		// local edit to revert, and the resulting blur commits the unchanged value.
		expect(document.activeElement).not.toBe(input);
		expect(onCommit).toHaveBeenCalledWith('gamay');
	});

	it('ignores keys other than Enter/Escape — no commit, no blur', () => {
		const onCommit = vi.fn();

		render(createElement(SearchInput, { ariaLabel: 'Search', onChange: vi.fn(), onCommit, value: 'grenache' }));
		const input = field();

		input.focus();
		fireEvent.keyDown(input, { key: 'a' });

		expect(onCommit).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(input);
	});

	it('hides the clear-X when empty and shows it once there is text', () => {
		const { rerender } = render(createElement(SearchInput, { ariaLabel: 'Search', onChange: vi.fn(), value: '' }));

		expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();

		rerender(createElement(SearchInput, { ariaLabel: 'Search', onChange: vi.fn(), value: 'x' }));
		expect(screen.getByRole('button', { name: 'Clear search' })).not.toBeNull();
	});

	it('clears the mirror and commits empty when the clear-X is clicked', () => {
		const onChange = vi.fn();
		const onCommit = vi.fn();

		render(createElement(SearchInput, { ariaLabel: 'Search', onChange, onCommit, value: 'zinfandel' }));
		fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

		expect(onChange).toHaveBeenCalledWith('');
		expect(onCommit).toHaveBeenCalledWith('');
	});

	it('no-ops the optional onCommit on every commit path when it is omitted', () => {
		const onChange = vi.fn();

		render(createElement(SearchInput, { ariaLabel: 'Search', onChange, value: 'chablis' }));
		const input = field();

		input.focus();
		// None of these should throw despite onCommit being undefined.
		fireEvent.keyDown(input, { key: 'Enter' });
		fireEvent.blur(input);
		fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

		// The clear path still drives the required onChange.
		expect(onChange).toHaveBeenCalledWith('');
	});
});
