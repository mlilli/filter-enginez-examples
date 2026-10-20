/**
 * Tests for the page-error screen's words.
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';

import { PAGE_ERROR_HOME_HREF, PAGE_ERROR_UNKNOWN_DETAIL, pageErrorDetail } from './core.js';

describe('pageErrorDetail', () => {
	it('shows an error’s own message', () => {
		expect(pageErrorDetail(new TypeError('Failed to fetch dynamically imported module: /assets/wine.js'))).toBe(
			'Failed to fetch dynamically imported module: /assets/wine.js',
		);
	});

	it('shows a thrown string as it is', () => {
		expect(pageErrorDetail('resolver failed')).toBe('resolver failed');
	});

	it.each([
		['an error with no message', new Error('')],
		['an error whose message is blank', new Error('   ')],
		['an empty string', ''],
		['a thrown object', { code: 500 }],
		['undefined', undefined],
	])('falls back to a generic line for %s', (_name, error) => {
		expect(pageErrorDetail(error)).toBe(PAGE_ERROR_UNKNOWN_DETAIL);
	});
});

describe('the start-page link', () => {
	it('goes to the app’s root, which every app serves', () => {
		expect(PAGE_ERROR_HOME_HREF).toBe('/');
	});
});
