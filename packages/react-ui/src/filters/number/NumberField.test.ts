/**
 * Tests for `<NumberField />` — the stateless numeric input that swallows blank / unparseable edits
 * rather than emitting `NaN`.
 *
 * @remarks
 * jsdom render via `createElement`. `<input type="number">` reports as an ARIA `spinbutton`. The
 * reflected `min` / `max` / `step` DOM properties are asserted directly (no jest-dom matchers, to
 * match the package's test convention).
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NumberField } from './NumberField.js';

afterEach(cleanup);

/** The lone number input (role `spinbutton`). */
function field(): HTMLInputElement {
	return screen.getByRole('spinbutton');
}

describe('NumberField', () => {
	it('reflects the current value and applies min / max / step', () => {
		render(createElement(NumberField, { ariaLabel: 'Points threshold', max: 100, min: 80, onChange: vi.fn(), step: 2, value: 90 }));
		const input = field();

		expect(input.value).toBe('90');
		expect(input.min).toBe('80');
		expect(input.max).toBe('100');
		expect(input.step).toBe('2');
	});

	it('defaults step to 1 when none is supplied', () => {
		render(createElement(NumberField, { ariaLabel: 'Points threshold', onChange: vi.fn(), value: 5 }));

		expect(field().step).toBe('1');
	});

	it('emits the parsed number on a valid edit', () => {
		const onChange = vi.fn();

		render(createElement(NumberField, { ariaLabel: 'Points threshold', onChange, value: 90 }));
		fireEvent.change(field(), { target: { value: '95' }});

		expect(onChange).toHaveBeenCalledWith(95);
	});

	it('swallows blank and unparseable edits instead of emitting NaN', () => {
		const onChange = vi.fn();

		render(createElement(NumberField, { ariaLabel: 'Points threshold', onChange, value: 90 }));
		fireEvent.change(field(), { target: { value: '' }});
		fireEvent.change(field(), { target: { value: 'abc' }});

		expect(onChange).not.toHaveBeenCalled();
	});
});
