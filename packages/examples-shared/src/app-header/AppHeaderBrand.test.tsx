/**
 * Render test for `<AppHeaderBrand>` — the React apps' and the documentation's header brand.
 *
 * @remarks
 * jsdom serves the page from a loopback host, so the links resolve to the local site server, exactly
 * as they do on a developer's machine; the expected URLs are built from the same resolver rather than
 * restated, because the resolver has its own literal-pinning suite.
 *
 * @packageDocumentation
 */

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { HEADER_PAGE_LABELS } from './core.js';
import { ALL_DEMOS_LABEL, AppHeaderBrand, appHeaderLinks, AppVerticalContext, SITE_HOME_LABEL } from './index.js';

afterEach(cleanup);

/** The header's two landing-site links for the test page's location. */
const LINKS = appHeaderLinks(window.location);

describe('AppHeaderBrand', () => {
	it('links the logomark home, by name, and keeps the wordmark out of the tab order', () => {
		const { container } = render(
			<MemoryRouter>
				<AppHeaderBrand page="Wine" verticalId="sveltekit" tier="server" />
			</MemoryRouter>,
		);

		expect(screen.getByRole('link', { name: SITE_HOME_LABEL }).getAttribute('href')).toBe(LINKS.homeHref);

		const wordmark = container.querySelector('.fe-books-app__name');

		expect(wordmark?.getAttribute('href')).toBe(LINKS.homeHref);
		expect(wordmark?.getAttribute('tabindex')).toBe('-1');
		expect(wordmark?.getAttribute('aria-hidden')).toBe('true');
	});

	it('links the app name in the subtitle to the hub, keeping the subtitle text whole', () => {
		const { container } = render(
			<MemoryRouter initialEntries={['/wine']}>
				<AppHeaderBrand page="Wine" verticalId="sveltekit" tier="server" />
			</MemoryRouter>,
		);
		const hub = screen.getByRole('link', { name: 'SvelteKit dataset hub' });

		expect(hub.getAttribute('href')).toBe('/');
		expect(hub.textContent).toBe('SvelteKit');
		expect(hub.getAttribute('aria-current')).toBeNull();
		expect(container.querySelector('.fe-books-app__subtitle')?.textContent).toBe('Wine · SvelteKit (server)');
	});

	it('marks the hub link as the current page on the hub', () => {
		render(
			<MemoryRouter initialEntries={['/']}>
				<AppHeaderBrand page={HEADER_PAGE_LABELS.hub} verticalId="vue" />
			</MemoryRouter>,
		);

		expect(screen.getByRole('link', { name: 'Vue dataset hub' }).getAttribute('aria-current')).toBe('page');
	});

	it('offers "All demos" on the landing page’s demo list', () => {
		render(
			<MemoryRouter>
				<AppHeaderBrand page="Books" verticalId="react-rtk" />
			</MemoryRouter>,
		);

		expect(screen.getByRole('link', { name: ALL_DEMOS_LABEL }).getAttribute('href')).toBe(LINKS.allDemosHref);
	});

	it('reads the app from context when the page does not name it', () => {
		render(
			<AppVerticalContext value="react-plain">
				<MemoryRouter>
					<AppHeaderBrand page={HEADER_PAGE_LABELS.notFound} />
				</MemoryRouter>
			</AppVerticalContext>,
		);

		expect(screen.getByRole('link', { name: 'React plain dataset hub' })).toBeTruthy();
	});

	it('names the page alone, with no hub link, outside the six apps', () => {
		const { container } = render(
			<MemoryRouter>
				<AppHeaderBrand page={HEADER_PAGE_LABELS.docs} />
			</MemoryRouter>,
		);

		expect(container.querySelector('.fe-books-app__subtitle')?.textContent).toBe('Docs');
		expect(container.querySelector('.fe-books-app__hub')).toBeNull();
		expect(screen.getByRole('link', { name: SITE_HOME_LABEL })).toBeTruthy();
	});
});
