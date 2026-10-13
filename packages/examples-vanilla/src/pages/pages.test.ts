/**
 * Render tests for the framework-less About + 404 pages.
 *
 * @remarks
 * Parity with the Vue `AboutPage.test.ts` / `NotFoundPage.test.ts` and the SvelteKit equivalents: the
 * copy and content model are shared, so these assert that the hand-built DOM presents them correctly
 * and that the 404's dead-end chips actually toggle.
 *
 * The heavy benchmark workload is mocked so mounting the About page never loads the wine corpus.
 * `IntersectionObserver` is absent in jsdom, which both the scroll-spy and the figures' in-view gating
 * guard against — so a clean render here also proves those guards work.
 *
 * @packageDocumentation
 */

import type * as AboutCore from '@filter-enginez/examples-shared/about-core';

import { ABOUT_SECTIONS } from '@filter-enginez/examples-shared/about-core';
import { NOT_FOUND_CHIPS, NOT_FOUND_COPY } from '@filter-enginez/examples-shared/notfound-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@filter-enginez/examples-shared/about-core', async (importActual) => {
	const actual = await importActual<typeof AboutCore>();

	return {
		...actual,
		loadWineCorpus: async (): Promise<readonly unknown[]> => {
			await Promise.resolve();

			return [];
		},
		measureConfig: async (): Promise<{ resultCount: number; samples: number[] }> => {
			await Promise.resolve();

			return { resultCount: 0, samples: []};
		},
	};
});

// Imported AFTER the mock so the embedded widget picks up the stubbed workload.
const { renderAboutPage } = await import('./aboutPage.js');
const { renderNotFoundPage } = await import('./notFoundPage.js');

/** A fresh detached container per test. */
function makeContainer(): HTMLElement {
	const container = document.createElement('div');

	document.body.append(container);

	return container;
}

beforeEach(() => {
	document.body.replaceChildren();
});

describe('About page', () => {
	it('renders the hero, every algorithm band title, and the act-two divider', () => {
		const container = makeContainer();

		renderAboutPage(container);

		expect(container.textContent).toContain('How the engine works');
		for (const section of ABOUT_SECTIONS) {
			expect(container.textContent).toContain(section.title);
		}
		expect(container.textContent).toContain('Beyond filtering');
	});

	it('renders one figure per section (role=img)', () => {
		const container = makeContainer();

		renderAboutPage(container);

		expect(container.querySelectorAll('.fe-about__figure [role="img"]')).toHaveLength(ABOUT_SECTIONS.length);
	});

	it('mounts the live benchmark widget with its three acceleration toggles', () => {
		const container = makeContainer();

		renderAboutPage(container);

		expect(container.querySelector('.fe-bench')).not.toBeNull();
		expect(container.querySelectorAll('[role="switch"]')).toHaveLength(3);
	});

	it('tears down cleanly', () => {
		const container = makeContainer();
		const teardown = renderAboutPage(container);

		expect(() => {
			teardown();
		}).not.toThrow();
	});
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
