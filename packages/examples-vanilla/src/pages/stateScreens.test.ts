/**
 * Every screen a route shows before, or instead of, its booted view has exactly one main landmark,
 * holding what the screen says.
 *
 * @remarks
 * The screens: the books, bare-core books and real-estate boot captions, and `/wine-server`'s boot
 * loader and offline notice. (`/wine`'s boot screen and failure are built by `wine/bootScreen.ts`,
 * whose own suite pins their landmark.) An accessibility audit often runs while one of them is up, and
 * a page with no `<main>` fails it however good the booted view is; the booted views carry theirs in
 * the app shell.
 *
 * The boots are replaced with promises the case settles, or never settles: what is under test is the
 * markup each state renders, not the engines.
 *
 * @packageDocumentation
 */

import type * as Core from '@filter-enginez/core';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The boots the pages call, each replaced by a case. */
const boots = vi.hoisted(() => ({
	books: vi.fn<() => Promise<never>>(),
	realEstate: vi.fn<() => Promise<never>>(),
	wineServer: vi.fn<() => Promise<never>>(),
}));

/** A boot that never settles: the page stays on its boot screen. */
const pending = async (): Promise<never> => new Promise<never>(() => undefined);

vi.mock('@filter-enginez/core', async (importOriginal) => ({
	...(await importOriginal<typeof Core>()),
	// The bare-core route's one wait before it builds its engine.
	initializeBitmapAcceleration: pending,
}));
vi.mock('@filter-enginez/examples-shared/books-core', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	bootBooksEngine: boots.books,
}));
vi.mock('@filter-enginez/examples-shared/real-estate-core', () => ({
	bootRealEstateEngine: boots.realEstate,
	getRealEstateBootProgressSnapshot: () => null,
	subscribeRealEstateBootProgress: () => () => undefined,
}));
vi.mock('@filter-enginez/examples-shared/wine-server-core', () => ({
	bootWineServerEngine: boots.wineServer,
	SERVER_WINE_TIER_LABEL: '',
}));

const { renderBooksPage } = await import('./booksPage.js');
const { renderBooksRawPage } = await import('./booksRawPage.js');
const { renderRealEstatePage } = await import('./realEstatePage.js');
const { renderWineServerPage } = await import('./wineServerPage.js');

/** The route container each case renders into. */
let container: HTMLElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.replaceChildren(container);
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	document.body.replaceChildren();
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

/**
 * The one main landmark the route rendered.
 *
 * @returns It.
 * @throws When there is none, or more than one.
 */
function onlyMain(): HTMLElement {
	const mains = container.querySelectorAll<HTMLElement>('main, [role="main"]');

	expect(mains).toHaveLength(1);

	return mains[0] as HTMLElement;
}

describe('booting', () => {
	it('/books holds its boot caption in one main landmark', () => {
		boots.books.mockImplementation(pending);
		void renderBooksPage(container);

		expect(onlyMain().querySelector('.fe-boot-caption')).not.toBeNull();
	});

	it('/books-raw holds its boot caption in one main landmark', () => {
		void renderBooksRawPage(container);

		expect(onlyMain().querySelector('.fe-boot-caption')?.textContent).toBe('Building the bare engine…');
	});

	it('/real-estate holds its boot caption in one main landmark', () => {
		boots.realEstate.mockImplementation(pending);
		void renderRealEstatePage(container);

		expect(onlyMain().querySelector('.fe-boot-caption')?.textContent).not.toBe('');
	});

	it('/wine-server holds its loader and caption in one main landmark while it connects', () => {
		boots.wineServer.mockImplementation(pending);
		void renderWineServerPage(container);

		expect(onlyMain().querySelector('.fe-boot-caption')?.textContent).toBe('Fetching corpus from the filter API');
	});
});

describe('an unreachable server', () => {
	it('/wine-server shows the offline notice in one main landmark', async () => {
		boots.wineServer.mockRejectedValue(new Error('fetch failed'));
		const teardown = await renderWineServerPage(container);

		expect(onlyMain().querySelector('h1')?.textContent).toBe('The filter API is not running');
		teardown();
	});
});
