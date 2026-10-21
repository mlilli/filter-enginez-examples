/**
 * Tests that `<fe-wine-page>` shows its boot screen and its boot failure each as one main landmark.
 *
 * @remarks
 * An accessibility audit often runs while the 150,000 wines are still being generated, and a page
 * with no `<main>` fails it however good the booted view is; the booted view carries its own. The
 * page's store is replaced with one whose signals the test sets, so no worker or engine is involved:
 * what is under test is the markup each state renders. The failure screen is the one every app shows:
 * `BOOT_FAILURE_COPY.wine`'s title, the error and the hint inside a `role="alert"` within the `<main>`,
 * followed by this app's own way to boot the main-thread tier.
 *
 * @packageDocumentation
 */

import { provideZonelessChangeDetection, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { BOOT_FAILURE_COPY } from '@filter-enginez/examples-shared/boot-caption';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WineBootStore } from '../wine/wine-boot-store.js';
import { WinePageComponent } from './wine-page.component.js';

/** The part of the boot store the page reads before the engine is ready, with signals a test sets. */
const store = {
	boot: async (): Promise<void> => Promise.resolve(),
	dispose: (): void => undefined,
	error: signal<string | null>(null),
	isReady: (): boolean => false,
	progress: signal(null),
};

let fixture: ComponentFixture<WinePageComponent>;

beforeEach(() => {
	store.error.set(null);
	TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()]});
	TestBed.overrideComponent(WinePageComponent, { set: { providers: [{ provide: WineBootStore, useValue: store }]}});
	fixture = TestBed.createComponent(WinePageComponent);
	fixture.detectChanges();
});

afterEach(() => {
	fixture.destroy();
});

/**
 * The one main landmark the page rendered.
 *
 * @returns It.
 * @throws When there is none, or more than one.
 */
function onlyMain(): HTMLElement {
	const mains = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('main, [role="main"]');

	expect(mains).toHaveLength(1);

	return mains[0] as HTMLElement;
}

describe('<fe-wine-page>', () => {
	it('holds the loader and its caption in one main landmark while the engine boots', () => {
		const main = onlyMain();

		expect(main.querySelector('fe-brain-synapse')).not.toBeNull();
		expect(main.querySelector('.fe-boot-caption')).not.toBeNull();
	});

	it('shows a failed boot in one main landmark', () => {
		store.error.set('the worker died');
		fixture.detectChanges();

		expect(onlyMain().textContent).toContain('the worker died');
	});

	it('words the failure from BOOT_FAILURE_COPY inside an alert, then names the main-thread switch', () => {
		store.error.set('the worker died');
		fixture.detectChanges();

		const alert = onlyMain().querySelector('[role="alert"]');
		const text = alert?.textContent ?? '';

		expect(onlyMain().getAttribute('role')).toBeNull();
		expect(alert?.querySelector('.fe-boot-error__title')?.textContent).toBe(BOOT_FAILURE_COPY.wine.title);
		expect(text).toContain('the worker died');
		expect(text).toContain(BOOT_FAILURE_COPY.wine.hint);
		expect(text).toContain('WINE_DATASET_SIZE');
		expect(text.indexOf(BOOT_FAILURE_COPY.wine.hint)).toBeLessThan(text.indexOf('WINE_DATASET_SIZE'));
	});
});
