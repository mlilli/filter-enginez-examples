/**
 * Tests for `createNumberField` — and specifically for the values it must refuse to emit.
 *
 * @remarks
 * The behavior worth pinning is what this control does NOT do. It commits on `change`, not `input`,
 * and it drops anything that does not parse — and both look like omissions rather than decisions when
 * you read the source.
 *
 * The caret guard in `update` gets its own test for the same reason: an unconditional `input.value`
 * write is invisible in review and presents to a user as a keyboard that occasionally jumps the cursor
 * to the end mid-edit, which nobody reports as a bug in a render pass.
 *
 * @packageDocumentation
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createNumberField } from './numberField.js';

describe('createNumberField', () => {
	const onChange = vi.fn();

	/**
	 * Build a field and mount it, so focus and selection behave.
	 *
	 * @returns The control's input element.
	 */
	function mount(): HTMLInputElement {
		const control = createNumberField({
			fieldLabel: 'Points comparison threshold',
			max: 100,
			min: 80,
			onChange,
			step: 1,
		});

		document.body.append(control.element);
		control.update({ value: 90 });

		return control.element as HTMLInputElement;
	}

	/**
	 * Type into the field, then optionally commit.
	 *
	 * @param field - The input.
	 * @param raw - The raw text to place in the box.
	 * @param shouldCommit - Whether to dispatch `change` afterwards.
	 */
	function type(field: HTMLInputElement, raw: string, shouldCommit: boolean): void {
		field.value = raw;
		field.dispatchEvent(new Event('input'));

		if (shouldCommit) {
			field.dispatchEvent(new Event('change'));
		}
	}

	beforeEach(() => {
		onChange.mockClear();
		document.body.replaceChildren();
	});

	it('renders the bound value and its accessible name', () => {
		const field = mount();

		expect(field.value).toBe('90');
		expect(field.getAttribute('aria-label')).toBe('Points comparison threshold');
		expect(field.getAttribute('min')).toBe('80');
		expect(field.getAttribute('max')).toBe('100');
		expect(field.getAttribute('type')).toBe('number');
	});

	it('does NOT commit while typing', () => {
		// Typing "95" passes through "9" first. Committing per keystroke would filter for scores above
		// nine and briefly show the whole corpus — and on wine's worker tier each intermediate value is
		// a full Comlink round trip against 150k records.
		type(mount(), '9', false);

		expect(onChange).not.toHaveBeenCalled();
	});

	it('commits the parsed number on change', () => {
		type(mount(), '95', true);

		expect(onChange).toHaveBeenCalledWith(95);
	});

	it('ignores an emptied field rather than coercing it to zero', () => {
		// `Number('')` is 0, which would silently become a real threshold the moment someone cleared the
		// box to retype. A points filter of ">= 0" looks exactly like no filter while being a live rule.
		type(mount(), '', true);

		expect(onChange).not.toHaveBeenCalled();
	});

	it('ignores a non-numeric value', () => {
		type(mount(), 'abc', true);

		expect(onChange).not.toHaveBeenCalled();
	});

	it('does not re-write the input when an update repeats the displayed value', () => {
		// The guard in `update`. Assigning `input.value` resets the field's editing position even when
		// the string is identical, so an unconditional write during an unrelated re-render jumps the
		// caret mid-edit — invisible in review, and reported by users as a flaky keyboard rather than as
		// a bug in a render pass.
		//
		// Asserted on the WRITE rather than on the caret, because selection APIs
		// (`setSelectionRange` / `selectionStart`) throw `InvalidStateError` on `type="number"` — the
		// HTML spec restricts them to text, search, url, tel and password. The mechanism is what is
		// observable here, and it is the thing that would regress.
		const control = createNumberField({ fieldLabel: 'Threshold', onChange });
		const field = control.element as HTMLInputElement;

		document.body.append(field);
		control.update({ value: 90 });

		const writes = vi.fn();

		vi.spyOn(field, 'value', 'set').mockImplementation(writes);

		control.update({ value: 90 });
		expect(writes, 'an unchanged value was written back to the input').not.toHaveBeenCalled();

		control.update({ value: 95 });
		expect(writes).toHaveBeenCalledWith('95');
	});
});
