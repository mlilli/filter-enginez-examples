/**
 * Tests for `<fe-chip-toggle-group>` — and specifically for the one rule that must never break.
 *
 * @remarks
 * Predictive-disable is the engine showing off, but it carries a trap: dimming a chip because
 * selecting it *would* empty the results is helpful, and dimming a chip that is ALREADY selected is a
 * dead end — the person has no way back out of a zero-result state. "A selected chip is never
 * unavailable" is therefore a correctness invariant, not a style preference, and it gets a test.
 *
 * These run through Angular's own `ng test` (Vitest runner) rather than the root Vitest config,
 * because component specs need the AOT template compile step first — the same reason the Vue and
 * SvelteKit apps self-test.
 *
 * @packageDocumentation
 */

import type { ExclusionMap } from '@filter-enginez/examples-shared/books-domain';

import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { ChipToggleGroupComponent } from './chip-toggle-group.component.js';

/** Host that drives the component under test. */
@Component({
	imports: [ChipToggleGroupComponent],
	template: `
		<fe-chip-toggle-group
			[options]="options()"
			[selected]="selected()"
			[exclusion]="exclusion()"
			[shouldShowCount]="shouldShowCount()"
			(toggled)="lastToggled.set($event)"
		/>
	`,
})
class HostComponent {
	/** Chip vocabulary. */
	public readonly options = signal<readonly string[]>(['fantasy', 'mystery', 'poetry']);
	/** Current selection. */
	public readonly selected = signal<readonly string[]>([]);
	/** Engine projection. */
	public readonly exclusion = signal<ExclusionMap | undefined>(undefined);
	/** Whether counts render. */
	public readonly shouldShowCount = signal(false);
	/** Captures the emitted toggle. */
	public readonly lastToggled = signal<string | null>(null);
}

/**
 * Build an exclusion map marking the named options as would-be-empty.
 *
 * @param emptyOptions - Options whose selection would yield zero results.
 * @returns A projection map shaped like the engine's.
 */
function exclusionFor(emptyOptions: readonly string[]): ExclusionMap {
	return new Map(
		['fantasy', 'mystery', 'poetry'].map((option) => [
			option,
			{ projectedCount: emptyOptions.includes(option) ? 0 : 42, wouldBeEmpty: emptyOptions.includes(option) },
		]),
	);
}

describe('ChipToggleGroupComponent', () => {
	let fixture: ComponentFixture<HostComponent>;
	let host: HostComponent;

	/** Every `<button>` the group rendered, in order. */
	const buttons = (): HTMLButtonElement[] =>
		Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button'));

	beforeEach(async () => {
		await TestBed.configureTestingModule({ imports: [HostComponent]}).compileComponents();
		fixture = TestBed.createComponent(HostComponent);
		host = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('renders one chip per option', () => {
		expect(buttons()).toHaveLength(3);
		expect(buttons().map((button) => button.textContent.trim())).toEqual([
			'fantasy',
			'mystery',
			'poetry',
		]);
	});

	it('marks selected chips pressed', () => {
		host.selected.set(['mystery']);
		fixture.detectChanges();

		expect(buttons()[1]?.getAttribute('aria-pressed')).toBe('true');
		expect(buttons()[0]?.getAttribute('aria-pressed')).toBe('false');
	});

	it('disables a chip whose selection would empty the results', () => {
		host.exclusion.set(exclusionFor(['poetry']));
		fixture.detectChanges();

		expect(buttons()[2]?.disabled).toBe(true);
		expect(buttons()[2]?.classList.contains('fe-chip--unavailable')).toBe(true);
		expect(buttons()[0]?.disabled).toBe(false);
	});

	it('NEVER disables a chip that is already selected, even when the projection says empty', () => {
		// The invariant. Without it, selecting your way into a zero-result state is a one-way door:
		// the projection reports "selecting this would be empty" for an already-selected chip, and
		// disabling it would remove the only control that could undo the situation.
		host.selected.set(['poetry']);
		host.exclusion.set(exclusionFor(['poetry']));
		fixture.detectChanges();

		expect(buttons()[2]?.disabled).toBe(false);
		expect(buttons()[2]?.classList.contains('fe-chip--unavailable')).toBe(false);
	});

	it('emits the clicked option without mutating anything itself', () => {
		buttons()[1]?.click();

		expect(host.lastToggled()).toBe('mystery');
		// The parent owns the set arithmetic — the component is a pure control.
		expect(host.selected()).toEqual([]);
	});

	it('explains a dimmed chip on hover', () => {
		host.exclusion.set(exclusionFor(['poetry']));
		fixture.detectChanges();

		expect(buttons()[2]?.getAttribute('title')).toBe(
			'No matches for poetry given your other filters',
		);
	});

	it('shows projected counts only for unselected chips when asked', () => {
		host.shouldShowCount.set(true);
		host.selected.set(['fantasy']);
		host.exclusion.set(exclusionFor([]));
		fixture.detectChanges();

		expect(buttons()[0]?.textContent).not.toContain('42');
		expect(buttons()[1]?.textContent).toContain('42');
	});

	it('renders a chip\'s text as its label then its badge, with no whitespace around or between them', () => {
		// Read untrimmed, as a browser locator reads it. The e2e cases find a chip by a pattern anchored
		// at its value (`/^poetry/`), which a leading space from the template's line breaks defeats.
		host.shouldShowCount.set(true);
		host.selected.set(['fantasy']);
		host.exclusion.set(exclusionFor([]));
		fixture.detectChanges();

		expect(buttons().map((button) => button.textContent)).toEqual(['fantasy', 'mystery(42)', 'poetry(42)']);
	});
});
