/**
 * Tests for `<SelectMenu />` — the stateless single-select dropdown with an optional placeholder
 * "off" / "any" option.
 *
 * @remarks
 * jsdom render via `createElement`. A native `<select>` reports as an ARIA `combobox`; its
 * `<option>`s report as `option`. Both placeholder branches (present / omitted) are exercised, plus
 * the `onChange` value pass-through and the `aria-label` accessible name.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SelectMenu, type SelectOption } from './SelectMenu.js';

afterEach(cleanup);

const OPTIONS: readonly SelectOption[] = [
	{ label: 'Red', value: 'red' },
	{ label: 'White', value: 'white' },
];

/** The lone select (role `combobox`). */
function select(): HTMLSelectElement {
	return screen.getByRole('combobox');
}

describe('SelectMenu', () => {
	it('renders every option and reflects the current value', () => {
		render(createElement(SelectMenu, { ariaLabel: 'Wine color', onChange: vi.fn(), options: OPTIONS, value: 'white' }));

		expect(screen.getAllByRole('option')).toHaveLength(2);
		expect(select().value).toBe('white');
	});

	it('exposes the aria-label as the accessible name', () => {
		render(createElement(SelectMenu, { ariaLabel: 'Wine color', onChange: vi.fn(), options: OPTIONS, value: '' }));

		expect(screen.getByRole('combobox', { name: 'Wine color' })).toBe(select());
	});

	it('renders a leading empty-value option when a placeholder is supplied', () => {
		render(createElement(SelectMenu, { ariaLabel: 'Wine color', onChange: vi.fn(), options: OPTIONS, placeholder: '— any color —', value: '' }));

		expect(screen.getAllByRole('option')).toHaveLength(3);
		expect(screen.getByRole('option', { name: '— any color —' }).getAttribute('value')).toBe('');
	});

	it('omits the placeholder option when none is supplied', () => {
		render(createElement(SelectMenu, { ariaLabel: 'Wine color', onChange: vi.fn(), options: OPTIONS, value: '' }));

		expect(screen.queryByRole('option', { name: '— any color —' })).toBeNull();
		expect(screen.getAllByRole('option')).toHaveLength(2);
	});

	it('fires onChange with the selected option value', () => {
		const onChange = vi.fn();

		render(createElement(SelectMenu, { ariaLabel: 'Wine color', onChange, options: OPTIONS, value: 'red' }));
		fireEvent.change(select(), { target: { value: 'white' }});

		expect(onChange).toHaveBeenCalledWith('white');
	});
});
