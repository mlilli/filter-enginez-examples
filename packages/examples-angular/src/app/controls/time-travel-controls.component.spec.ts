/**
 * Tests for `<fe-time-travel-controls>` — that every step it takes marks the busy tracker first.
 *
 * @remarks
 * An undo over a large corpus costs what the filter it reverses cost, so the computing indicator must
 * light before the step, whether the step came from a button or from the keyboard shortcut the
 * buttons advertise. A shortcut with nothing to step to writes nothing, so it must mark nothing: a
 * mark with no change behind it is never settled.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideEngineBusy, provideFilterEngine } from '@filter-enginez/angular-rxjs';
import { InSetRule } from '@filter-enginez/core';
import { buildBooksEngine } from '@filter-enginez/examples-shared/books-core';
import {
	createEngineBusyStream,
	createRxJsEngine,
	type EngineBusyStream,
	type RxJsEngine,
} from '@filter-enginez/reactive-rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TimeTravelControlsComponent } from './time-travel-controls.component.js';

/** Two books, enough for a rule to change something. */
const FIXTURE_BOOKS: readonly Book[] = [
	{ genre: 'fantasy', id: 'b0', title: 'One' },
	{ genre: 'mystery', id: 'b1', title: 'Two' },
] as readonly unknown[] as readonly Book[];

describe('<fe-time-travel-controls>', () => {
	let busy: EngineBusyStream;
	let engine: RxJsEngine<Book>;
	let fixture: ComponentFixture<TimeTravelControlsComponent>;

	/**
	 * Press Ctrl+Z (or Ctrl+Shift+Z) on the page.
	 *
	 * @param isShifted - Whether Shift is held, which makes it redo.
	 */
	const pressUndoShortcut = (isShifted: boolean): void => {
		document.body.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true, key: isShifted ? 'Z' : 'z', shiftKey: isShifted }),
		);
		fixture.detectChanges();
	};

	/** Settle the tracker, as a page's settle effect does after a change lands. */
	const settle = (): void => {
		busy.markResolvedAtLeast(busy.captureCurrentVersion());
	};

	beforeEach(async () => {
		engine = createRxJsEngine(buildBooksEngine(FIXTURE_BOOKS));
		busy = createEngineBusyStream();

		await TestBed.configureTestingModule({
			imports: [TimeTravelControlsComponent],
			providers: [provideEngineBusy(busy), provideFilterEngine(engine)],
		}).compileComponents();

		fixture = TestBed.createComponent(TimeTravelControlsComponent);
		fixture.componentRef.setInput('isDevtoolsOpen', false);
		fixture.detectChanges();
	});

	afterEach(() => {
		fixture.destroy();
		busy.dispose();
	});

	it('marks busy before a keyboard undo, and the undo happens', () => {
		engine.core.addRule('genre', new InSetRule<string>('genre', ['fantasy']));
		fixture.detectChanges();

		pressUndoShortcut(false);

		expect(busy.getIsBusy()).toBe(true);
		expect(engine.core.getRules().has('genre')).toBe(false);

		settle();
		pressUndoShortcut(true);

		expect(busy.getIsBusy()).toBe(true);
		expect(engine.core.getRules().has('genre')).toBe(true);
	});

	it('marks busy before a button undo', () => {
		engine.core.addRule('genre', new InSetRule<string>('genre', ['fantasy']));
		fixture.detectChanges();

		(fixture.nativeElement.querySelector('button[aria-label="Undo (Cmd/Ctrl+Z)"]') as HTMLButtonElement).click();

		expect(busy.getIsBusy()).toBe(true);
		expect(engine.core.getRules().has('genre')).toBe(false);
	});

	it('marks nothing for a shortcut with nothing to step to', () => {
		pressUndoShortcut(false);
		pressUndoShortcut(true);

		expect(busy.getIsBusy()).toBe(false);
	});
});
