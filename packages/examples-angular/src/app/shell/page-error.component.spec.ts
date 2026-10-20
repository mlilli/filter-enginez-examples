/**
 * Tests for `<fe-page-error>`: one main landmark around an alert card, with the shared words, the
 * error's message and a full-load link to the start page.
 *
 * @packageDocumentation
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	PAGE_ERROR_HINT,
	PAGE_ERROR_HOME_HREF,
	PAGE_ERROR_HOME_LABEL,
	PAGE_ERROR_TITLE,
	PAGE_ERROR_UNKNOWN_DETAIL,
} from '@filter-enginez/examples-shared/page-error-core';
import { beforeEach, describe, expect, it } from 'vitest';

import { PageErrorComponent } from './page-error.component.js';

/**
 * Render the screen for a failure.
 *
 * @param error - What failed.
 * @returns The rendered host element.
 */
function renderScreen(error: unknown): HTMLElement {
	const fixture = TestBed.createComponent(PageErrorComponent);

	fixture.componentRef.setInput('error', error);
	fixture.detectChanges();

	return fixture.nativeElement as HTMLElement;
}

beforeEach(() => {
	TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()]});
});

describe('<fe-page-error>', () => {
	it('is one main landmark around an alert card with the shared words and the error’s message', () => {
		const host = renderScreen(new Error('chunk failed'));
		const card = host.querySelector('main.fe-page-error > .fe-page-error__card[role="alert"]');

		expect(host.querySelectorAll('main')).toHaveLength(1);
		expect([...(card?.querySelectorAll('p') ?? [])].map((line) => line.textContent.trim())).toEqual([
			PAGE_ERROR_TITLE,
			'chunk failed',
			PAGE_ERROR_HINT,
		]);
	});

	it('falls back to the shared line for a failure with no message', () => {
		expect(renderScreen(undefined).querySelector('.fe-page-error__detail')?.textContent.trim()).toBe(PAGE_ERROR_UNKNOWN_DETAIL);
	});

	it('links to the start page with a plain anchor, which loads the page again', () => {
		const link = renderScreen(new Error('x')).querySelector('a.fe-page-error__link');

		expect(link?.getAttribute('href')).toBe(PAGE_ERROR_HOME_HREF);
		expect(link?.textContent.trim()).toBe(PAGE_ERROR_HOME_LABEL);
	});
});
