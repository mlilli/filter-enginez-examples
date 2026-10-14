/**
 * Render test for `<LandingPage />` — the app hub at `/`.
 *
 * @remarks
 * The dataset registry is stubbed: this file is about the hub's own markup (the shared header above
 * the hero and the card per dataset), and the real registry would pull every dataset's boot code into
 * a test that never boots one.
 *
 * @packageDocumentation
 */

import { appHeaderLinks, HEADER_PAGE_LABELS, SITE_HOME_LABEL } from '@filter-enginez/examples-shared/app-header';
import { verticalSubtitle } from '@filter-enginez/examples-shared/verticals';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DatasetEntry } from '../datasets.js';

/**
 * The stub dataset's `load`, which the hub calls to prefetch the route's code.
 *
 * @remarks
 * `vi.hoisted` because `vi.mock`'s factory is hoisted above the imports and cannot close over an
 * ordinary `const`. It never resolves: the hub only starts the fetch and must not wait on it.
 */
const loadBooks = vi.hoisted(() => vi.fn(async () => new Promise<never>(() => undefined)));

vi.mock('../datasets.js', () => ({
	datasets: [
		{
			id: 'books',
			label: 'Books',
			load: loadBooks,
			recordNoun: 'books',
			tagline: 'A stub tagline.',
		} satisfies DatasetEntry,
	],
}));

const { LandingPage } = await import('./LandingPage.js');

// Explicit, because the root Vitest config does not set `globals: true`, so Testing Library never
// registers its own cleanup.
afterEach(() => {
	cleanup();
	loadBooks.mockClear();
});

/** Mount the hub at `/`, inside a router, since every link on it is a router link. */
function mountHub(): ReturnType<typeof render> {
	return render(
		<MemoryRouter initialEntries={['/']}>
			<LandingPage />
		</MemoryRouter>,
	);
}

/**
 * The page header.
 *
 * @remarks
 * Found by class, not by the `banner` role: Testing Library maps every `<header>` to `banner`, without
 * the browser's rule that a `<header>` inside `<main>` is not one, so the hero would match as well.
 *
 * @param container - The rendered hub.
 * @returns The header element.
 */
function pageHeader(container: HTMLElement): HTMLElement {
	const header = container.querySelector<HTMLElement>('header.fe-books-app__header');

	if (header === null) {
		throw new Error('expected the page header');
	}

	return header;
}

describe('LandingPage', () => {
	it('carries the shared header, naming the page and the app', () => {
		const { container } = mountHub();
		const header = pageHeader(container);

		expect(within(header).getByRole('link', { name: SITE_HOME_LABEL }).getAttribute('href')).toBe(
			appHeaderLinks(window.location).homeHref,
		);
		expect(container.querySelector('.fe-books-app__subtitle')?.textContent).toBe(
			verticalSubtitle(HEADER_PAGE_LABELS.hub, 'react-plain'),
		);
	});

	it('marks the hub link in the header as the current page', () => {
		const { container } = mountHub();
		const hub = within(pageHeader(container)).getByRole('link', { name: 'React plain dataset hub' });

		expect(hub.getAttribute('href')).toBe('/');
		expect(hub.getAttribute('aria-current')).toBe('page');
	});

	it('puts the page header first and the hero inside the main landmark', () => {
		// The hero is a `<header>` too; outside `<main>` a browser would expose it as a second banner
		// landmark beside the page header.
		const { container } = mountHub();

		expect(container.firstElementChild).toBe(pageHeader(container));
		expect(screen.getByRole('main').querySelector('header.fe-landing__hero')).not.toBeNull();
	});

	it('links a card to every dataset in the registry', () => {
		mountHub();

		expect(screen.getByRole('link', { name: 'Explore Books' }).getAttribute('href')).toBe('/books');
	});

	it('fetches nothing for a dataset until its card shows intent', () => {
		// The hub is the startup bundle; a dataset's code is not. Rendering the cards must not start a
		// single dataset fetch, or every visit pays for every dataset again.
		mountHub();

		expect(loadBooks).not.toHaveBeenCalled();
	});

	it('starts fetching a dataset route when its card is hovered', () => {
		mountHub();
		fireEvent.pointerEnter(screen.getByRole('link', { name: 'Explore Books' }));

		expect(loadBooks).toHaveBeenCalledTimes(1);
	});

	it('starts fetching a dataset route when its card is focused', () => {
		// Keyboard intent counts as much as a pointer's: tabbing to a card is the keyboard user's hover.
		mountHub();
		fireEvent.focus(screen.getByRole('link', { name: 'Explore Books' }));

		expect(loadBooks).toHaveBeenCalledTimes(1);
	});
});
