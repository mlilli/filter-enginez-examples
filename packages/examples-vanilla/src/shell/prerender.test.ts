/**
 * `appendBootScreen`: a route's boot screen shows, unless a prerendered snapshot stands in for it.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { appendBootScreen } from './prerender.js';

afterEach(() => {
	document.body.replaceChildren();
});

describe('appendBootScreen', () => {
	it('shows the boot screen when no snapshot is up', () => {
		const container = document.createElement('div');
		const screen = document.createElement('main');

		appendBootScreen(container, screen);

		expect(container.firstChild).toBe(screen);
	});

	it('leaves the container empty while a snapshot stands in for the boot screen', () => {
		const layer = document.createElement('div');
		const container = document.createElement('div');

		layer.id = 'fe-prerender';
		document.body.append(layer);
		appendBootScreen(container, document.createElement('main'));

		expect(container.childElementCount).toBe(0);
	});
});
