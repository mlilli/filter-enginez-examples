/**
 * Tests for `<fe-number-field>` — and specifically for the two values it must refuse to emit.
 *
 * @remarks
 * This spec exists because of a rule this repo learned the hard way: **a component with no spec is
 * invisible to every gate that runs without a browser.** `ng build`, `ngc` and `ng test` all pass on a
 * standalone component nothing renders, so its first execution would otherwise be in front of a
 * browser that cannot report back.
 *
 * The behavior worth pinning is what the field does NOT do. It commits on `change`, not `input`, and
 * it drops anything that does not parse — and both of those look like omissions rather than decisions
 * when you read the template.
 *
 * These run through Angular's own `ng test` (Vitest runner) rather than the root Vitest config,
 * because component specs need the AOT template compile step first.
 *
 * @packageDocumentation
 */

import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { NumberFieldComponent } from './number-field.component.js';

/** Host that drives the component under test. */
@Component({
	imports: [NumberFieldComponent],
	template: `
		<fe-number-field
			fieldLabel="Points comparison threshold"
			[max]="100"
			[min]="80"
			[value]="value()"
			(valueChange)="committed.set($event)"
		/>
	`,
})
class HostComponent {
	/** The value the field displays. */
	public readonly value = signal<number>(90);
	/** The last committed value, or `null` when nothing has been emitted. */
	public readonly committed = signal<number | null>(null);
}

describe('<fe-number-field>', () => {
	let fixture: ComponentFixture<HostComponent>;
	let host: HostComponent;

	/**
	 * The rendered input.
	 *
	 * @returns The element.
	 */
	function input(): HTMLInputElement {
		return fixture.nativeElement.querySelector('input') as HTMLInputElement;
	}

	/**
	 * Type into the field without committing, then optionally commit.
	 *
	 * @param raw - The raw text to place in the box.
	 * @param shouldCommit - Whether to dispatch `change` afterwards.
	 */
	function type(raw: string, shouldCommit: boolean): void {
		const element = input();

		element.value = raw;
		element.dispatchEvent(new Event('input'));

		if (shouldCommit) {
			element.dispatchEvent(new Event('change'));
		}
		fixture.detectChanges();
	}

	beforeEach(async () => {
		await TestBed.configureTestingModule({ imports: [HostComponent]}).compileComponents();
		fixture = TestBed.createComponent(HostComponent);
		host = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('renders the bound value and its accessible name', () => {
		expect(input().value).toBe('90');
		expect(input().getAttribute('aria-label')).toBe('Points comparison threshold');
		expect(input().getAttribute('min')).toBe('80');
		expect(input().getAttribute('max')).toBe('100');
	});

	it('does NOT commit while typing', () => {
		// The reason this is a rule: typing "95" passes through "9" first. Committing per keystroke
		// would fire a filter for scores above nine and briefly show the whole corpus — and on wine's
		// worker tier each intermediate value is a full Comlink round trip against 150k records.
		type('9', false);

		expect(host.committed()).toBeNull();
	});

	it('commits the parsed number on change', () => {
		type('95', true);

		expect(host.committed()).toBe(95);
	});

	it('ignores an emptied field rather than coercing it to zero', () => {
		// `Number('')` is 0, which would silently become a real threshold the moment someone cleared the
		// box to retype. A points filter of ">= 0" looks exactly like no filter while being a live rule.
		type('', true);

		expect(host.committed()).toBeNull();
	});

	it('ignores a non-numeric value', () => {
		type('abc', true);

		expect(host.committed()).toBeNull();
	});
});
