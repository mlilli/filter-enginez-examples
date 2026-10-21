/**
 * Tests for `<NumberField />` — the numeric input that commits on change (blur / Enter / a spinner
 * step), never per keystroke, and never emits `NaN`.
 *
 * @remarks
 * jsdom render via `createElement`. `<input type="number">` reports as an ARIA `spinbutton`. The
 * reflected `min` / `max` / `step` DOM properties are asserted directly (no jest-dom matchers, to
 * match the package's test convention).
 *
 * The events are the ones a browser sends: a keystroke is an `input` event (`fireEvent.input`), and
 * a settled value is a `change` event (`fireEvent.change`), which a spinner step or leaving an edited
 * field fires.
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

	it('commits nothing per keystroke', () => {
		const onChange = vi.fn();

		render(createElement(NumberField, { ariaLabel: 'Points threshold', onChange, value: 90 }));
		fireEvent.input(field(), { target: { value: '9' }});
		fireEvent.input(field(), { target: { value: '95' }});

		expect(onChange).not.toHaveBeenCalled();
		expect(field().value).toBe('95');
	});

	it('commits the typed number on blur', () => {
		const onChange = vi.fn();

		render(createElement(NumberField, { ariaLabel: 'Points threshold', onChange, value: 90 }));
		fireEvent.input(field(), { target: { value: '95' }});
		fireEvent.blur(field());

		expect(onChange.mock.calls).toEqual([[95]]);
	});

	it('commits on Enter once, not again on the change and blur that follow', () => {
		const onChange = vi.fn();

		render(createElement(NumberField, { ariaLabel: 'Points threshold', onChange, value: 90 }));
		fireEvent.input(field(), { target: { value: '95' }});
		fireEvent.keyDown(field(), { key: 'Enter' });
		fireEvent.change(field(), { target: { value: '95' }});
		fireEvent.blur(field());

		expect(onChange.mock.calls).toEqual([[95]]);
	});

	it('commits on the native change event a spinner step fires', () => {
		const onChange = vi.fn();

		render(createElement(NumberField, { ariaLabel: 'Points threshold', onChange, value: 90 }));
		fireEvent.change(field(), { target: { value: '91' }});

		expect(onChange.mock.calls).toEqual([[91]]);
	});

	it('ignores keys other than Enter', () => {
		const onChange = vi.fn();

		render(createElement(NumberField, { ariaLabel: 'Points threshold', onChange, value: 90 }));
		fireEvent.input(field(), { target: { value: '95' }});
		fireEvent.keyDown(field(), { key: 'a' });

		expect(onChange).not.toHaveBeenCalled();
	});

	it('writes nothing when the field is left unchanged', () => {
		const onChange = vi.fn();

		render(createElement(NumberField, { ariaLabel: 'Points threshold', onChange, value: 90 }));
		fireEvent.blur(field());

		expect(onChange).not.toHaveBeenCalled();
	});

	it('puts the committed value back for a blank or unparseable entry instead of emitting NaN', () => {
		const onChange = vi.fn();

		render(createElement(NumberField, { ariaLabel: 'Points threshold', onChange, value: 90 }));
		fireEvent.input(field(), { target: { value: '' }});
		fireEvent.blur(field());

		expect(onChange).not.toHaveBeenCalled();
		expect(field().value).toBe('90');
	});

	it('adopts a value changed from outside', () => {
		const onChange = vi.fn();
		const { rerender } = render(createElement(NumberField, { ariaLabel: 'Points threshold', onChange, value: 90 }));

		rerender(createElement(NumberField, { ariaLabel: 'Points threshold', onChange, value: 85 }));

		expect(field().value).toBe('85');

		// The adopted value counts as committed: leaving the field writes nothing.
		fireEvent.blur(field());
		expect(onChange).not.toHaveBeenCalled();
	});

	it('stops listening for the native change event once unmounted', () => {
		const onChange = vi.fn();
		const { unmount } = render(createElement(NumberField, { ariaLabel: 'Points threshold', onChange, value: 90 }));
		const input = field();

		unmount();
		fireEvent.change(input, { target: { value: '91' }});

		expect(onChange).not.toHaveBeenCalled();
	});
});
