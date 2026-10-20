/**
 * Tests for the page-error screen: one main landmark, the shared words, and a link the router leaves
 * to the browser.
 *
 * @packageDocumentation
 */

import {
	PAGE_ERROR_HINT,
	PAGE_ERROR_HOME_HREF,
	PAGE_ERROR_HOME_LABEL,
	PAGE_ERROR_TITLE,
	PAGE_ERROR_UNKNOWN_DETAIL,
} from '@filter-enginez/examples-shared/page-error-core';
import { describe, expect, it } from 'vitest';

import { createPageErrorScreen } from './pageErrorScreen.js';

describe('createPageErrorScreen', () => {
	it('is one main landmark around an alert card carrying the shared words and the error’s message', () => {
		const screen = createPageErrorScreen(new Error('chunk failed'));
		const card = screen.querySelector('[role="alert"]');

		expect(screen.tagName).toBe('MAIN');
		expect(screen.className).toBe('fe-page-error');
		expect(screen.querySelectorAll('main')).toHaveLength(0);
		expect(card?.className).toBe('fe-page-error__card');
		expect([...(card?.querySelectorAll('p') ?? [])].map((line) => line.textContent)).toEqual([PAGE_ERROR_TITLE, 'chunk failed', PAGE_ERROR_HINT]);
	});

	it('falls back to the shared line for a failure with no message', () => {
		expect(createPageErrorScreen(undefined).querySelector('.fe-page-error__detail')?.textContent).toBe(PAGE_ERROR_UNKNOWN_DETAIL);
	});

	it('links to the start page with a full page load, which the router does not intercept', () => {
		const link = createPageErrorScreen(new Error('x')).querySelector('a');

		expect(link?.getAttribute('href')).toBe(PAGE_ERROR_HOME_HREF);
		expect(link?.textContent).toBe(PAGE_ERROR_HOME_LABEL);
		// The router hands any anchor with a `target` back to the browser.
		expect(link?.getAttribute('target')).toBe('_self');
	});
});
