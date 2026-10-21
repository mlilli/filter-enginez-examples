/**
 * Tests for `<FilterCollapse />` — the filter sidebar card and its small-viewport disclosure.
 *
 * @remarks
 * jsdom render via `createElement` (keeps this a `.test.ts` off the jsx-a11y lint surface). Covers
 * both layouts: at the breakpoint and up (no button, panel always shown) and below it (the "Filters" /
 * "Hide filters" button, `aria-expanded`, `aria-controls`, and the region's `hidden` attribute). The
 * case that earns the component its place is the last one: a panel's local state survives a close and
 * a reopen, because the region is hidden rather than unmounted.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { FilterCollapse } from './FilterCollapse.js';

afterEach(cleanup);

/** A stand-in panel holding local state, so a remount would be visible as a reset count. */
const CountingPanel = (): React.ReactElement => {
	const [count, setCount] = useState(0);

	return createElement(
		'button',
		{
			onClick: () => {
				setCount((previous) => previous + 1);
			},
			type: 'button',
		},
		`clicked ${count}`,
	);
};

/**
 * Render the collapse around the counting panel.
 *
 * @param isCollapsible - Whether the viewport is below the breakpoint.
 * @returns The rendered container.
 */
function renderCollapse(isCollapsible: boolean): HTMLElement {
	return render(createElement(FilterCollapse, { children: createElement(CountingPanel), isCollapsible })).container;
}

/**
 * The panel region.
 *
 * @param container - The rendered container.
 * @returns The `.fe-filter-collapse` element.
 */
function region(container: HTMLElement): HTMLElement {
	const element = container.querySelector<HTMLElement>('.fe-filter-collapse');

	expect(element).not.toBeNull();

	return element as HTMLElement;
}

describe('FilterCollapse', () => {
	it('renders the sidebar card with the panel always shown and no button at the breakpoint and up', () => {
		const container = renderCollapse(false);

		expect(container.querySelector('aside.fe-books-app__sidebar')).not.toBeNull();
		expect(screen.queryByRole('button', { name: /filters/iu })).toBeNull();
		expect(region(container).hidden).toBe(false);
		expect(screen.getByRole('button', { name: 'clicked 0' })).toBeTruthy();
	});

	it('starts collapsed below the breakpoint, behind a "Filters" disclosure that names its region', () => {
		const container = renderCollapse(true);
		const toggle = screen.getByRole('button', { name: 'Filters' });

		expect(toggle.className).toBe('fe-books-app__filters-toggle');
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(toggle.getAttribute('aria-controls')).toBe(region(container).id);
		expect(region(container).id).not.toBe('');
		expect(region(container).hidden).toBe(true);
		// Hidden, but still in the DOM: the panel is never unmounted.
		expect(region(container).textContent).toBe('clicked 0');
	});

	it('opens to "Hide filters" and closes again', () => {
		const container = renderCollapse(true);

		fireEvent.click(screen.getByRole('button', { name: 'Filters' }));

		const toggle = screen.getByRole('button', { name: 'Hide filters' });

		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(region(container).hidden).toBe(false);

		fireEvent.click(toggle);

		expect(screen.getByRole('button', { name: 'Filters' }).getAttribute('aria-expanded')).toBe('false');
		expect(region(container).hidden).toBe(true);
	});

	it("keeps the panel's local state across a close and a reopen", () => {
		const container = renderCollapse(true);

		fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
		fireEvent.click(screen.getByRole('button', { name: 'clicked 0' }));
		fireEvent.click(screen.getByRole('button', { name: 'Hide filters' }));

		expect(region(container).textContent).toBe('clicked 1');

		fireEvent.click(screen.getByRole('button', { name: 'Filters' }));

		expect(screen.getByRole('button', { name: 'clicked 1' })).toBeTruthy();
	});
});
