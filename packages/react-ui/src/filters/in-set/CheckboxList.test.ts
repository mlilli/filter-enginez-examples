/**
 * Tests for `<CheckboxList />` — the high-cardinality InSet filter (vertical checkbox column).
 *
 * @remarks
 * jsdom render via `createElement`. Shares the exclusion-matrix branch shape with
 * `<ChipToggleGroup />` (see that suite) — the difference exercised here is the native-checkbox
 * toggle path, the `maxHeight` scroll cap, and that CheckboxList titles ONLY the unavailable rows
 * (available/selected rows carry no title, unlike the chip variant).
 */

import { cleanup, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExclusionMap } from '../../shared/exclusion.js';

import { CheckboxList } from './CheckboxList.js';

afterEach(cleanup);

/** Options in render order: available-selected, would-be-empty, no-exclusion-data, available-unselected. */
const OPTIONS = ['red', 'white', 'rose', 'orange'] as const;

/** Exclusion data for three of the four options ('rose' is intentionally absent). */
const EXCLUSION: ExclusionMap = new Map([
	['orange', { projectedCount: 7, wouldBeEmpty: false }],
	['red', { projectedCount: 12, wouldBeEmpty: false }],
	['white', { projectedCount: 0, wouldBeEmpty: true }],
]);

/** Render the standard fixture and return the container + rows in option order. */
function renderRows(overrides: Record<string, unknown> = {}): { container: HTMLElement; rows: HTMLElement[] } {
	const { container } = render(
		createElement(CheckboxList, {
			exclusion: EXCLUSION,
			onToggle: vi.fn(),
			options: OPTIONS,
			selected: ['red'],
			showCount: true,
			...overrides,
		}),
	);

	return { container, rows: [...container.querySelectorAll<HTMLElement>('.fe-checkbox-list__row')]};
}

/** Pull the native checkbox out of a row. */
function boxOf(row: HTMLElement | undefined): HTMLInputElement | null {
	return row?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null;
}

describe('CheckboxList', () => {
	it('defaults the scroll cap to 16rem and honors a maxHeight override', () => {
		const { container } = renderRows();

		expect(container.querySelector('.fe-checkbox-list')?.getAttribute('style')).toContain('max-height: 16rem;');

		cleanup();
		const { container: overridden } = renderRows({ maxHeight: '20rem' });

		expect(overridden.querySelector('.fe-checkbox-list')?.getAttribute('style')).toContain('max-height: 20rem;');
	});

	it('marks + checks the selected row with no badge', () => {
		const { rows } = renderRows();

		expect(rows[0]?.className).toContain('fe-checkbox-list__row--selected');
		expect(boxOf(rows[0])?.checked).toBe(true);
		expect(rows[0]?.querySelector('.fe-checkbox-list__count')).toBeNull();
	});

	it('disables and subdues a would-be-empty row, with an unavailable badge + title', () => {
		const { rows } = renderRows();

		expect(rows[1]?.className).toContain('fe-checkbox-list__row--unavailable');
		expect(boxOf(rows[1])?.disabled).toBe(true);
		expect(rows[1]?.querySelector('.fe-checkbox-list__count')?.className).toContain(
			'fe-checkbox-list__count--unavailable',
		);
		expect(rows[1]?.getAttribute('title')).toBe('No matches for white given your other filters');
	});

	it('renders a plain row (no badge, no title) when there is no exclusion datum', () => {
		const { rows } = renderRows();

		expect(rows[2]?.className).toBe('fe-checkbox-list__row');
		expect(boxOf(rows[2])?.disabled).toBe(false);
		expect(rows[2]?.querySelector('.fe-checkbox-list__count')).toBeNull();
		expect(rows[2]?.getAttribute('title')).toBeNull();
	});

	it('badges an available, unselected row with the projected count and no title', () => {
		const { rows } = renderRows();

		expect(rows[3]?.querySelector('.fe-checkbox-list__count')?.textContent).toBe('7');
		expect(rows[3]?.getAttribute('title')).toBeNull();
	});

	it('toggles selected + available rows on change and disables the would-be-empty row', () => {
		const onToggle = vi.fn();
		const { rows } = renderRows({ onToggle });

		fireEvent.click(boxOf(rows[0]) as HTMLInputElement); // selected → still clickable
		fireEvent.click(boxOf(rows[3]) as HTMLInputElement); // available → clickable

		expect(onToggle.mock.calls).toEqual([['red'], ['orange']]);
		// The would-be-empty row is disabled — the real click-suppression guarantee. (We assert the
		// `disabled` contract rather than a click no-op: jsdom, unlike a real browser, still dispatches
		// click/change on a disabled input, so a fireEvent.click there would test jsdom, not the component.)
		expect(boxOf(rows[1])?.disabled).toBe(true);
	});

	it('keeps a selected row clickable even when adding it would empty the results', () => {
		const onToggle = vi.fn();
		const { rows } = renderRows({ onToggle, selected: ['white']});

		expect(boxOf(rows[1])?.disabled).toBe(false);
		fireEvent.click(boxOf(rows[1]) as HTMLInputElement);

		expect(onToggle).toHaveBeenCalledWith('white');
	});

	it('renders plain rows with no badges when exclusion + showCount are omitted', () => {
		const { container } = render(
			createElement(CheckboxList, { onToggle: vi.fn(), options: OPTIONS, selected: []}),
		);

		expect(container.querySelector('.fe-checkbox-list__count')).toBeNull();
		expect([...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].some((box) => box.disabled)).toBe(
			false,
		);
	});
});
