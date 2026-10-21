/**
 * Tests for `<ChipToggleGroup />` — the exclusion-aware chip toggle set for InSet filters.
 *
 * @remarks
 * jsdom render via `createElement`. Chips are queried positionally from
 * `.fe-chip` (options render in the order given), which sidesteps accessible-name ambiguity
 * once count badges concatenate into the button text.
 */

import { cleanup, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ExclusionMap } from '../../shared/exclusion.js';

import { ChipToggleGroup } from './ChipToggleGroup.js';

afterEach(cleanup);

/** Options in render order: available-selected, would-be-empty, no-exclusion-data, available-unselected. */
const OPTIONS = ['red', 'white', 'rose', 'orange'] as const;

/** Exclusion data for three of the four options ('rose' is intentionally absent). */
const EXCLUSION: ExclusionMap = new Map([
	['orange', { projectedCount: 7, wouldBeEmpty: false }],
	['red', { projectedCount: 12, wouldBeEmpty: false }],
	['white', { projectedCount: 0, wouldBeEmpty: true }],
]);

/** Render the standard fixture and return the chip buttons in option order. */
function renderChips(overrides: Record<string, unknown> = {}): HTMLButtonElement[] {
	const { container } = render(
		createElement(ChipToggleGroup, {
			exclusion: EXCLUSION,
			onToggle: vi.fn(),
			options: OPTIONS,
			selected: ['red'],
			showCount: true,
			...overrides,
		}),
	);

	return [...container.querySelectorAll<HTMLButtonElement>('.fe-chip')];
}

describe('ChipToggleGroup', () => {
	it('caps and scrolls the group only when asked to', () => {
		const { container: plain } = render(createElement(ChipToggleGroup, { onToggle: vi.fn(), options: OPTIONS, selected: []}));

		expect(plain.querySelector('.fe-chip-toggle')?.className).toBe('fe-chip-toggle');

		cleanup();
		const { container: capped } = render(createElement(ChipToggleGroup, { onToggle: vi.fn(), options: OPTIONS, scrollable: true, selected: []}));

		expect(capped.querySelector('.fe-chip-toggle')?.className).toBe('fe-chip-toggle fe-chip-toggle--capped');
	});

	it('marks the selected chip and leaves it enabled (no badge on a selected chip)', () => {
		const [red] = renderChips();

		expect(red?.className).toContain('fe-chip--selected');
		expect(red?.disabled).toBe(false);
		expect(red?.querySelector('.fe-chip__count')).toBeNull();
		expect(red?.getAttribute('title')).toBe('12 would match');
	});

	it('announces its pressed state to assistive technology, not only in the class', () => {
		// **The case above asserts only the VISUAL half** (`fe-chip--selected`). Without
		// `aria-pressed` a screen-reader user would be told nothing about which facets are active —
		// in books, wine and real estate, across both React apps.
		//
		// Nothing else here would see that: the class assertion is satisfied without the attribute,
		// and axe has no rule that knows a styled `<button>` is a toggle.
		//
		// Asserted on EVERY chip, not just the selected one: `aria-pressed="false"` is the half that
		// makes the state meaningful. A chip with the attribute only when pressed announces nothing
		// when it is off, which is the same silence in a different shape.
		const [red, white, rose, orange] = renderChips();

		expect(red?.getAttribute('aria-pressed')).toBe('true');
		expect(white?.getAttribute('aria-pressed')).toBe('false');
		expect(rose?.getAttribute('aria-pressed')).toBe('false');
		expect(orange?.getAttribute('aria-pressed')).toBe('false');
	});

	it('disables and subdues a would-be-empty chip, with an unavailable badge + title', () => {
		const white = renderChips()[1];

		expect(white?.className).toContain('fe-chip--unavailable');
		expect(white?.disabled).toBe(true);
		expect(white?.querySelector('.fe-chip__count')?.className).toContain('fe-chip__count--unavailable');
		expect(white?.getAttribute('title')).toBe('No matches for white given your other filters');
	});

	it('renders a plain chip with no badge and no title when there is no exclusion datum', () => {
		const rose = renderChips()[2];

		expect(rose?.className).toBe('fe-chip');
		expect(rose?.disabled).toBe(false);
		expect(rose?.querySelector('.fe-chip__count')).toBeNull();
		expect(rose?.getAttribute('title')).toBeNull();
	});

	it('shows a projected-count badge + "would match" title on an available, unselected chip', () => {
		const orange = renderChips()[3];

		expect(orange?.querySelector('.fe-chip__count')?.textContent).toBe('(7)');
		expect(orange?.querySelector('.fe-chip__count')?.className).not.toContain('--unavailable');
		expect(orange?.getAttribute('title')).toBe('7 would match');
	});

	it('toggles selected and available chips on click, but a disabled chip cannot fire', () => {
		const onToggle = vi.fn();
		const [red, white, , orange] = renderChips({ onToggle });

		fireEvent.click(red as HTMLButtonElement); // selected → still clickable (escape hatch)
		fireEvent.click(orange as HTMLButtonElement); // available → clickable
		fireEvent.click(white as HTMLButtonElement); // disabled → no-op

		expect(onToggle.mock.calls).toEqual([['red'], ['orange']]);
	});

	it('keeps a selected chip clickable even when adding it would empty the results', () => {
		const onToggle = vi.fn();
		// 'white' is would-be-empty AND selected → isUnavailable is false → stays enabled.
		const white = renderChips({ onToggle, selected: ['white']})[1];

		expect(white?.disabled).toBe(false);
		fireEvent.click(white as HTMLButtonElement);

		expect(onToggle).toHaveBeenCalledWith('white');
	});

	it('applies a custom formatLabel and falls back to identity by default', () => {
		const [redCustom] = renderChips({ formatLabel: (value: string) => value.toUpperCase() });

		expect(redCustom?.textContent).toContain('RED');

		// No exclusion / showCount / formatLabel → identity labels, no badges, nothing disabled.
		const { container } = render(
			createElement(ChipToggleGroup, { onToggle: vi.fn(), options: OPTIONS, selected: []}),
		);
		const plainChips = [...container.querySelectorAll<HTMLButtonElement>('.fe-chip')];

		expect(plainChips[0]?.textContent).toBe('red');
		expect(plainChips.some((chip) => chip.disabled)).toBe(false);
		expect(container.querySelector('.fe-chip__count')).toBeNull();
	});
});
