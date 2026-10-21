/**
 * Tests for `<fe-section-header>` — the heading every panel section is found by.
 *
 * @remarks
 * The e2e parity cases address a section by its heading's exact text (`panelSection` in
 * `tests/e2e/parityProbes.ts`), read untrimmed as a browser locator reads it. Angular keeps one space
 * for every line break beside an interpolation, so a template that spreads the heading over several
 * lines renders ` Color ` and no section is found. These pin the text to the label alone, and the note
 * to its own line beneath it.
 *
 * @packageDocumentation
 */

import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { SectionHeaderComponent } from './section-header.component.js';

/** Host that drives the component under test. */
@Component({
	imports: [SectionHeaderComponent],
	template: `<fe-section-header [label]="label()" [note]="note()" />`,
})
class HostComponent {
	/** The section's name. */
	public readonly label = signal('Color');
	/** The optional second line. */
	public readonly note = signal<string | undefined>(undefined);
}

describe('SectionHeaderComponent', () => {
	let fixture: ComponentFixture<HostComponent>;
	let host: HostComponent;

	/** The rendered heading; throws when there is none, so a missing heading fails loudly. */
	const heading = (): HTMLHeadingElement => {
		const found = (fixture.nativeElement as HTMLElement).querySelector<HTMLHeadingElement>('h3.fe-filter-section-label');

		if (found === null) {
			throw new Error('no fe-filter-section-label heading rendered');
		}

		return found;
	};

	beforeEach(async () => {
		await TestBed.configureTestingModule({ imports: [HostComponent]}).compileComponents();
		fixture = TestBed.createComponent(HostComponent);
		host = fixture.componentInstance;
		fixture.detectChanges();
	});

	it('renders exactly the label, with no whitespace around it', () => {
		expect(heading().textContent).toBe('Color');
	});

	it('puts a note on its own line, directly after the label', () => {
		host.note.set('(expression mode)');
		fixture.detectChanges();

		expect(heading().textContent).toBe('Color(expression mode)');
		expect(heading().querySelector('br')).not.toBeNull();
		expect(heading().querySelector('.fe-filter-section-label__note')?.textContent).toBe('(expression mode)');
	});

	it('renders no note line for an empty note', () => {
		host.note.set('');
		fixture.detectChanges();

		expect(heading().querySelector('br')).toBeNull();
		expect(heading().textContent).toBe('Color');
	});
});
