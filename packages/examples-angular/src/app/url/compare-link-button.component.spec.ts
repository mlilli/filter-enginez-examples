/**
 * Tests for `<fe-compare-link-button>`.
 *
 * @remarks
 * A render test. This component sits in the header of every Angular dataset route, so a throw at
 * render fails each of those routes' e2e suites while `/compare`, the landing hub and the 404 stay
 * green — and `ng build` and `ngc` stay clean, because neither RENDERS it. This does.
 *
 * The point generalizes past this component: a standalone component with no spec is invisible to
 * every gate short of the e2e suite, so its first execution is in front of a browser that
 * cannot report back. `ng build` proves it compiles; only a render proves it runs.
 *
 * @packageDocumentation
 */

import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { compareButtonTitle, compareEmptyHint } from '@filter-enginez/examples-shared/compare-core';
import { beforeEach, describe, expect, it } from 'vitest';

import { CompareLinkButtonComponent } from './compare-link-button.component.js';
import { serializedFilterState } from './url-state.js';

/** Host binding the dataset the way the three real call sites do — as a static attribute. */
@Component({
	imports: [CompareLinkButtonComponent],
	template: `<fe-compare-link-button dataset="books" />`,
})
class HostComponent {
	/** Present so the host has a member; the binding under test is static. */
	public readonly unused = signal(0);
}

describe('fe-compare-link-button', () => {
	let fixture: ComponentFixture<HostComponent>;

	beforeEach(async () => {
		// Module-level state, shared across tests exactly as it is across routes.
		serializedFilterState.set(null);
		await TestBed.configureTestingModule({ imports: [HostComponent]}).compileComponents();
		fixture = TestBed.createComponent(HostComponent);
	});

	/** The anchor under test. */
	function link(): HTMLAnchorElement {
		const element = fixture.nativeElement.querySelector('a.fe-compare-link');

		expect(element, 'the component rendered no anchor at all').not.toBeNull();

		return element as HTMLAnchorElement;
	}

	// `toContain` on the raw `textContent`, with no trim and no optional chain. Typed-lint rejects a
	// chain as unnecessary — `link()` returns a non-nullish `HTMLAnchorElement`, so it would guard
	// nothing — and a substring match does not care about the surrounding template whitespace.
	it('renders at all', () => {
		fixture.detectChanges();

		expect(link().textContent).toContain('Compare');
	});

	it('is inert, and says why, when there is no state', () => {
		fixture.detectChanges();

		expect(link().getAttribute('aria-disabled')).toBe('true');
		expect(link().getAttribute('aria-label')).toBe(compareEmptyHint('books'));
	});

	// Set-or-REMOVE. `aria-disabled="false"` is valid ARIA that both `ui-styles` and the e2e would
	// miss, since each selects on `[aria-disabled='true']`.
	it('drops the attribute entirely — never "false" — once there is state', () => {
		serializedFilterState.set('h~{"version":1,"rules":[]}');
		fixture.detectChanges();

		expect(link().getAttribute('aria-disabled')).toBeNull();
		expect(link().getAttribute('aria-label')).toBe(compareButtonTitle('books'));
	});

	it('carries the current state to an ABSOLUTE /compare url', () => {
		serializedFilterState.set('h~{"version":1,"rules":[]}');
		fixture.detectChanges();

		const href = new URL(link().href);

		expect(href.pathname).toBe('/compare');
		expect(href.searchParams.get('dataset')).toBe('books');
		expect(href.searchParams.get('f')).toBe('h~{"version":1,"rules":[]}');
	});

	it('offers a bare /compare when there is nothing to carry', () => {
		fixture.detectChanges();

		const href = new URL(link().href);

		expect(href.searchParams.get('dataset')).toBe('books');
		expect(href.searchParams.get('f')).toBeNull();
	});
});
