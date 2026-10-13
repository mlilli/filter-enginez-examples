/**
 * Tests for `<FilterDrawer />` — the mobile off-canvas filter panel.
 *
 * @remarks
 * jsdom render via `createElement` (keeps this a `.test.ts` off the jsx-a11y lint surface). Covers:
 * the closed → renders-nothing branch, the open dialog semantics (role / aria-modal / accessible
 * name + the `ariaLabel` override), all three dismissal paths (Escape, scrim click, close button),
 * focus-move-in on open + focus-restore on close, the `Tab` / `Shift+Tab` wrap-around trap (both
 * edges + the pass-through middle), and the non-Tab/non-Escape key no-op. The default `title`
 * ("Filters") is exercised by omitting the prop.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FilterDrawer, type FilterDrawerProps } from './FilterDrawer.js';

afterEach(cleanup);

/** A small body with two focusable controls so the focus-trap edges are addressable. */
function body(): ReturnType<typeof createElement> {
	return createElement(
		'div',
		null,
		createElement('button', { type: 'button' }, 'first'),
		createElement('input', { 'aria-label': 'query', type: 'text' }),
	);
}

/** Render the drawer with sensible defaults, overridable per test. */
function renderDrawer(overrides: Partial<FilterDrawerProps> = {}): { onClose: ReturnType<typeof vi.fn> } {
	const onClose = vi.fn();

	render(
		createElement(FilterDrawer, { children: body(), isOpen: true, onClose, ...overrides }),
	);

	return { onClose };
}

describe('FilterDrawer', () => {
	it('renders nothing when closed', () => {
		render(createElement(FilterDrawer, { children: body(), isOpen: false, onClose: vi.fn() }));

		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('renders a modal dialog named by the default title when open', () => {
		renderDrawer();
		const dialog = screen.getByRole('dialog');

		expect(dialog.getAttribute('aria-modal')).toBe('true');
		expect(dialog.getAttribute('aria-label')).toBe('Filters');
		expect(screen.getByText('Filters')).toBeTruthy();
	});

	it('honors an explicit title and ariaLabel override', () => {
		renderDrawer({ ariaLabel: 'Wine filters', title: 'Refine' });
		const dialog = screen.getByRole('dialog');

		expect(dialog.getAttribute('aria-label')).toBe('Wine filters');
		expect(screen.getByText('Refine')).toBeTruthy();
	});

	it('closes on the close button', () => {
		const { onClose } = renderDrawer();

		fireEvent.click(screen.getByRole('button', { name: 'Close filters' }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('closes on a scrim click', () => {
		const { onClose } = renderDrawer();
		// The scrim is an aria-hidden pointer affordance — addressable only by class, not by role.
		const scrim = document.querySelector('.fe-filter-drawer__scrim');

		expect(scrim).not.toBeNull();
		fireEvent.click(scrim as Element);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('closes on Escape', () => {
		const { onClose } = renderDrawer();

		fireEvent.keyDown(document, { key: 'Escape' });
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('moves focus into the panel on open', () => {
		renderDrawer();

		expect(document.activeElement).toBe(document.querySelector('.fe-filter-drawer__panel'));
	});

	it('restores focus to the trigger when it closes', () => {
		const trigger = document.createElement('button');

		document.body.appendChild(trigger);
		trigger.focus();
		expect(document.activeElement).toBe(trigger);

		const { rerender } = render(
			createElement(FilterDrawer, { children: body(), isOpen: true, onClose: vi.fn() }),
		);

		expect(document.activeElement).not.toBe(trigger);
		rerender(createElement(FilterDrawer, { children: body(), isOpen: false, onClose: vi.fn() }));
		expect(document.activeElement).toBe(trigger);

		trigger.remove();
	});

	it('wraps focus from the last element back to the first on Tab', () => {
		renderDrawer();
		const focusable = [...document.querySelectorAll<HTMLElement>('.fe-filter-drawer__panel button, .fe-filter-drawer__panel input')];
		const last = focusable[focusable.length - 1] as HTMLElement;
		const first = focusable[0] as HTMLElement;

		last.focus();
		fireEvent.keyDown(document, { key: 'Tab' });
		expect(document.activeElement).toBe(first);
	});

	it('wraps focus from the first element to the last on Shift+Tab', () => {
		renderDrawer();
		const focusable = [...document.querySelectorAll<HTMLElement>('.fe-filter-drawer__panel button, .fe-filter-drawer__panel input')];
		const first = focusable[0] as HTMLElement;
		const last = focusable[focusable.length - 1] as HTMLElement;

		first.focus();
		fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
		expect(document.activeElement).toBe(last);
	});

	it('leaves focus untouched when Tab is pressed mid-list', () => {
		renderDrawer();
		// Focus order is [header ×, body button, body input]; the body button is a true middle
		// element — neither the first nor the last focusable — so neither wrap arm fires.
		const middle = screen.getByRole('button', { name: 'first' });

		middle.focus();
		fireEvent.keyDown(document, { key: 'Tab' });
		// The trap only intervenes at the edges; the browser's native Tab (which jsdom doesn't
		// simulate) would move focus, so here activeElement is unchanged.
		expect(document.activeElement).toBe(middle);
	});

	it('ignores keys other than Tab and Escape', () => {
		const { onClose } = renderDrawer();
		const panel = document.querySelector('.fe-filter-drawer__panel');

		fireEvent.keyDown(document, { key: 'a' });
		expect(onClose).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(panel);
	});

	it('keeps children mounted (hidden, no dialog) when closed with keepMounted', () => {
		render(
			createElement(FilterDrawer, { children: body(), isOpen: false, keepMounted: true, onClose: vi.fn() }),
		);

		// No dialog semantics while closed, but the body + its children stay in the DOM.
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(document.querySelector('.fe-filter-drawer--closed')).not.toBeNull();
		expect(document.querySelector('.fe-filter-drawer__body')).not.toBeNull();
		expect(screen.getByRole('button', { name: 'first' })).toBeTruthy();
		// The dismissal chrome (scrim + header ×) is not rendered while closed.
		expect(document.querySelector('.fe-filter-drawer__scrim')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Close filters' })).toBeNull();
	});

	it('does not remount the children when toggled open → closed → open with keepMounted', () => {
		let mountCount = 0;
		const Probe = (): ReturnType<typeof createElement> => {
			useEffect(() => {
				mountCount += 1;
			}, []);

			return createElement('span', { 'data-testid': 'probe' }, 'probe');
		};
		const drawer = (isOpen: boolean): ReturnType<typeof createElement> =>
			createElement(FilterDrawer, { children: createElement(Probe), isOpen, keepMounted: true, onClose: vi.fn() });

		const { rerender } = render(drawer(true));

		expect(mountCount).toBe(1);
		rerender(drawer(false));
		expect(screen.getByTestId('probe')).toBeTruthy();
		rerender(drawer(true));
		// A single mount across the whole open → closed → open cycle — the stable keys held the
		// children in place, so the engine-busy resolver they drive is never stranded.
		expect(mountCount).toBe(1);
	});
});
