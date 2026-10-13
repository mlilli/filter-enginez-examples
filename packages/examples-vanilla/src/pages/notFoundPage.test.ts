/**
 * Render tests for the framework-less 404 page.
 *
 * @remarks
 * Parity with the Vue `NotFoundPage.test.ts` and the SvelteKit equivalent: the copy is shared, so
 * these assert that the hand-built DOM presents it correctly and that the dead-end chips actually
 * toggle.
 *
 * @packageDocumentation
 */

import { NOT_FOUND_CHIPS, NOT_FOUND_COPY } from '@filter-enginez/examples-shared/notfound-core';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderNotFoundPage } from './notFoundPage.js';

/** A fresh detached container per test. */
function makeContainer(): HTMLElement {
	const container = document.createElement('div');

	document.body.append(container);

	return container;
}

beforeEach(() => {
	document.body.replaceChildren();
});

describe('404 page', () => {
	it('renders the pinned-zero count, heading, dead-end chips, and CTA home', () => {
		const container = makeContainer();

		renderNotFoundPage(container);

		expect(container.querySelector('.fe-notfound__count')?.textContent).toBe(NOT_FOUND_COPY.count);
		expect(container.textContent).toContain(NOT_FOUND_COPY.heading);
		expect(container.querySelectorAll('.fe-notfound__chip')).toHaveLength(NOT_FOUND_CHIPS.length);
		expect(container.querySelector('.fe-notfound__cta')?.getAttribute('href')).toBe('/');
	});

	it('toggling a dead-end chip presses it without moving the count off zero', () => {
		const container = makeContainer();

		renderNotFoundPage(container);

		const chip = container.querySelector<HTMLElement>('.fe-notfound__chip');

		if (chip === null) {
			throw new Error('expected at least one dead-end chip');
		}
		expect(chip.getAttribute('aria-pressed')).toBe('false');

		chip.click();

		// The row is rebuilt on toggle, so re-query rather than holding the stale node.
		const pressed = container.querySelector<HTMLElement>('.fe-notfound__chip');

		expect(pressed?.getAttribute('aria-pressed')).toBe('true');
		// The joke: the count never leaves zero no matter what you toggle.
		expect(container.querySelector('.fe-notfound__count')?.textContent).toBe('0');
	});
});
