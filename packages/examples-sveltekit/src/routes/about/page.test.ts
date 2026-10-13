/**
 * Render test for the SvelteKit About page — parity with the React `AboutPage.test.tsx`.
 *
 * @remarks
 * Confirms the hero, every algorithm band title (from the shared `about-core` content), the act-two
 * divider, and all eight figures (`role="img"`) mount. The figures' `use:inView` action + the
 * scroll-spy both guard `IntersectionObserver` (absent in jsdom), so the page renders its completed
 * static frame without throwing.
 *
 * @packageDocumentation
 */

import { ABOUT_SECTIONS } from '@filter-enginez/examples-shared/about-core';
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';

import AboutPage from './+page.svelte';

afterEach(cleanup);

describe('SvelteKit About page', () => {
	it('renders the hero, every algorithm band title, and the act-two divider', () => {
		const { container } = render(AboutPage);

		expect(container.textContent).toContain('How the engine works');
		for (const section of ABOUT_SECTIONS) {
			expect(container.textContent).toContain(section.title);
		}
		expect(container.textContent).toContain('Beyond filtering');
	});

	it('renders one figure per section (role=img)', () => {
		const { container } = render(AboutPage);

		expect(container.querySelectorAll('[role="img"]')).toHaveLength(ABOUT_SECTIONS.length);
	});
});
