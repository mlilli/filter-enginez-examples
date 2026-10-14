/**
 * Tests for the app shell's mobile filter drawer — scoped to the `.fe-filter-collapse` contract.
 *
 * @remarks
 * ### Why this file is narrow on purpose
 *
 * The rest of `createAppShell` is markup that all six verticals render and `tests/e2e` drives in a
 * real browser; asserting it here would duplicate that while coupling to the chrome the apps exist
 * to vary. What it is NOT is markup: the `hidden` write inside `syncPanelVisibility` is the repo's
 * only implementation of the `.fe-filter-collapse` exception, it is a DECISION, and this file is its
 * instrument.
 *
 * ### The exception, and the two ways to get it wrong
 *
 * `ui-styles` authors `.fe-filter-collapse:not([hidden])` deliberately (see the 17-line comment at
 * that block). An unconditional `display` would beat the `hidden` attribute — which is only a UA
 * rule — so the wrapper MUST be driven by `toggleAttribute('hidden', …)`, and it must NOT use this
 * app's `setHidden()`, whose inline `display` is the opposite convention for the opposite reason.
 *
 * Substituting `setHidden` here sets `display: none` and then, when cleared, leaves the wrapper a
 * plain block — severing the flex height chain from the aside's `max-height` down to
 * `.fe-filter-panel__scroller`, so the scroller never bounds and the bottom filter sections become
 * unreachable. That is the unbounded-scroller failure, arrived at from the other side. Hence the
 * assertions below come in pairs: the attribute present/absent AND the inline `display` untouched.
 * The mutant fails both, and either one alone would be a coincidence away from passing.
 *
 * The third failure mode is losing the class outright: without it the wrapper is a plain block and
 * the same height chain breaks.
 *
 * @packageDocumentation
 */

import { appHeaderSubtitle } from '@filter-enginez/examples-shared/app-header-core';
import { el } from '@filter-enginez/examples-shared/dom';
import { describe, expect, it } from 'vitest';

import { type DesktopBreakpoint } from '../viewport/desktopBreakpoint.js';
import { type AppShell, createAppShell } from './appShell.js';

/** The three states the drawer can be in, as the shell sees them. */
interface BreakpointState {
	readonly isDesktop: boolean;
	readonly isFilterOpen: boolean;
}

/**
 * A directly-settable stand-in for {@link DesktopBreakpoint}.
 *
 * @remarks
 * The real tracker reads `matchMedia`, which jsdom does not implement — it would pin every test to
 * its desktop fallback, i.e. to exactly one of the three states worth checking. `shouldShowPanel`
 * mirrors the real implementation's `isDesktop || isFilterOpen` rather than being independently
 * settable, so a test cannot describe a combination the tracker cannot produce.
 *
 * @param state - The initial breakpoint + drawer state.
 * @returns The fake plus a setter for driving it between `syncPanelVisibility()` calls.
 */
function fakeBreakpoint(state: BreakpointState): {
	breakpoint: DesktopBreakpoint;
	set: (next: BreakpointState) => void;
} {
	let current = state;

	return {
		breakpoint: {
			dispose: () => undefined,
			isDesktop: () => current.isDesktop,
			isFilterOpen: () => current.isFilterOpen,
			shouldShowPanel: () => current.isDesktop || current.isFilterOpen,
			subscribe: () => () => undefined,
			toggleFilters: () => {
				current = { ...current, isFilterOpen: !current.isFilterOpen };
			},
		},
		set: (next) => {
			current = next;
		},
	};
}

/**
 * Mount a shell over a recognizable panel.
 *
 * @param state - The breakpoint state to boot in.
 * @returns The shell, its drawer readers, and the state setter.
 */
function mountShell(state: BreakpointState) {
	const { breakpoint, set } = fakeBreakpoint(state);
	const panelElement = el('div', { className: 'fe-filter-panel', text: 'PANEL' });
	const shell: AppShell = createAppShell({
		breakpoint,
		footnote: 'reactive-signals',
		layout: 'books',
		panelElement,
		resultsGridElement: el('div', { className: 'fe-result-grid' }),
		resultsHeaderElement: el('div', { className: 'fe-results-header' }),
		subtitle: appHeaderSubtitle('Books', 'vanilla', 'signals'),
	});

	const collapse = shell.element.querySelector<HTMLElement>('.fe-filter-collapse');

	if (collapse === null) {
		throw new Error('the panel must be wrapped in .fe-filter-collapse — without the class the height chain breaks');
	}

	return {
		collapse,
		panelElement,
		set,
		shell,
		toggle: shell.element.querySelector<HTMLElement>('.fe-books-app__filters-toggle'),
	};
}

describe('the .fe-filter-collapse wrapper', () => {
	it('wraps the panel in the class the height chain depends on', () => {
		const { collapse, panelElement } = mountShell({ isDesktop: true, isFilterOpen: true });

		expect(collapse.firstElementChild).toBe(panelElement);
	});

	it('is visible on desktop by ATTRIBUTE, with no inline display written', () => {
		const { collapse } = mountShell({ isDesktop: true, isFilterOpen: true });

		expect(collapse.hasAttribute('hidden')).toBe(false);
		// The mutant (`setHidden(collapse, …)`) leaves `display: ''` here too — which is why the
		// hidden case below is the half that separates them, and why both cases are kept.
		expect(collapse.style.display).toBe('');
	});

	it('hides the closed mobile drawer by ATTRIBUTE, never by inline display', () => {
		// The mutation this file exists for. `setHidden` would give `display: 'none'` and no
		// attribute; both assertions invert, and the result is an unbounded panel scroller.
		const { collapse } = mountShell({ isDesktop: false, isFilterOpen: false });

		expect(collapse.hasAttribute('hidden')).toBe(true);
		expect(collapse.style.display).toBe('');
	});

	it('reveals it again when the drawer opens, still without an inline display', () => {
		const { collapse, set, shell } = mountShell({ isDesktop: false, isFilterOpen: false });

		set({ isDesktop: false, isFilterOpen: true });
		shell.syncPanelVisibility();

		expect(collapse.hasAttribute('hidden')).toBe(false);
		expect(collapse.style.display).toBe('');
	});

	it('re-hides it when a resize drops below the breakpoint with the drawer closed', () => {
		// Crossing back is the path the real tracker takes on rotate, and the one where a
		// write-only-on-hide implementation would leave the wrapper stuck open.
		const { collapse, set, shell } = mountShell({ isDesktop: true, isFilterOpen: true });

		expect(collapse.hasAttribute('hidden')).toBe(false);

		set({ isDesktop: false, isFilterOpen: false });
		shell.syncPanelVisibility();

		expect(collapse.hasAttribute('hidden')).toBe(true);
	});
});

describe('the filters toggle', () => {
	it('is display-hidden on desktop — an inline display, which is correct HERE', () => {
		// The contrast is the point: the BUTTON is a plain `fe-*` element with an authored display,
		// so an inline style is the right instrument for it. Only the collapse wrapper is special.
		const { toggle } = mountShell({ isDesktop: true, isFilterOpen: true });

		expect(toggle?.style.display).toBe('none');
	});

	it('actually opens the drawer when clicked', () => {
		// Found by a coverage probe, and it is the gap worth being embarrassed about: the
		// two cases below assert what the button SAYS in each state, and nothing asserted that
		// pressing it does anything at all. A button wired to nothing passed both.
		//
		// The click must be the ONLY thing that moves the state. Setting `isFilterOpen` by hand here
		// and then asserting the drawer opened would pass over a toggle wired to nothing — the fake
		// implements `toggleFilters`, so letting the click drive it is what makes this fatal.
		const { collapse, shell, toggle } = mountShell({ isDesktop: false, isFilterOpen: false });

		expect(collapse.hasAttribute('hidden')).toBe(true);

		toggle?.click();
		// The real tracker notifies subscribers, which is what drives the repaint on the live route;
		// the fake has no subscribers, so the sync the subscriber would have done happens here.
		shell.syncPanelVisibility();

		expect(collapse.hasAttribute('hidden')).toBe(false);
		expect(toggle?.getAttribute('aria-expanded')).toBe('true');
	});

	it('announces the drawer state through aria-expanded and its label together', () => {
		// Two channels, deliberately: `aria-expanded` for a screen reader and the visible word for
		// everyone else. Fixing one and not the other is how a page says two different things.
		const { set, shell, toggle } = mountShell({ isDesktop: false, isFilterOpen: false });

		expect(toggle?.style.display).toBe('');
		expect(toggle?.getAttribute('aria-expanded')).toBe('false');
		expect(toggle?.textContent).toContain('Filters');

		set({ isDesktop: false, isFilterOpen: true });
		shell.syncPanelVisibility();

		expect(toggle?.getAttribute('aria-expanded')).toBe('true');
		expect(toggle?.textContent).toContain('Hide filters');
	});
});
