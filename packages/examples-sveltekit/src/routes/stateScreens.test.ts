/**
 * Every screen a route shows before, or instead of, its booted view has exactly one main landmark,
 * holding what the screen says.
 *
 * @remarks
 * The screens: the books and real-estate boot captions, the wine boot loader (which `/wine-server`
 * shows too while it connects), the wine, books and real-estate boot failures (each saying the
 * shared `BOOT_FAILURE_COPY` words around the error's own message), the two server routes'
 * server-rendered fallbacks (their no-JavaScript page, and what stays up while the live engine
 * connects or after it fails), and the error page (the not-found page for a 404, the page-error
 * screen for anything else). An accessibility audit often runs while one of
 * them is up — the 150,000-wine tier takes a while to generate — and a page with no `<main>` fails it
 * however good the booted view is. Each booted view carries its own `<main>` in its markup.
 *
 * The boots are replaced with promises the case settles, or never settles: what is under test is the
 * markup each state renders, not the engines.
 *
 * @packageDocumentation
 */

import { BOOT_FAILURE_COPY } from '@filter-enginez/examples-shared/boot-caption';
import { PAGE_ERROR_HINT, PAGE_ERROR_TITLE } from '@filter-enginez/examples-shared/page-error-core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resetTestPage, showTestPageError } from '../../test/appStores.js';
import BooksServerFallback from '../lib/books/BooksServerFallback.svelte';
import WineBootScreen from '../lib/wine/WineBootScreen.svelte';
import WineServerFallback from '../lib/wine/WineServerFallback.svelte';

/** The boots the routes call, each replaced by a case. */
const boots = vi.hoisted(() => ({
	books: vi.fn<() => Promise<never>>(),
	realEstate: vi.fn<() => Promise<never>>(),
	wine: vi.fn<() => Promise<never>>(),
}));

/** A boot that never settles: the route stays on its boot screen. */
const pending = async (): Promise<never> => new Promise<never>(() => undefined);

vi.mock('@filter-enginez/examples-shared/books-core', () => ({ bootBooksEngine: boots.books }));
vi.mock('@filter-enginez/examples-shared/real-estate-core', () => ({
	bootRealEstateEngine: boots.realEstate,
	subscribeRealEstateBootProgress: () => () => undefined,
}));
vi.mock('@filter-enginez/examples-shared/wine-core', () => ({
	bootWineEngine: boots.wine,
	describeWineCorpusTier: () => '',
	subscribeWineBootProgress: () => () => undefined,
}));
vi.mock('@filter-enginez/examples-shared/wine-worker-spawn', () => ({ spawnWineWorker: () => undefined }));

const { default: BooksPage } = await import('./books/+page.svelte');
const { default: RealEstatePage } = await import('./real-estate/+page.svelte');
const { default: WinePage } = await import('./wine/+page.svelte');
const { default: ErrorPage } = await import('./+error.svelte');

afterEach(() => {
	// Not automatic in this app's vitest setup.
	cleanup();
	resetTestPage();
	vi.clearAllMocks();
});

/**
 * The one main landmark on screen.
 *
 * @returns It.
 * @throws When there is none, or more than one.
 */
function onlyMain(): HTMLElement {
	// `getAllByRole` throws when there is none, so the first is always there.
	const [main, ...others] = screen.getAllByRole('main');

	expect(others).toEqual([]);

	return main;
}

/**
 * The page's banners: every `<header>` outside sectioning content and `<main>`, which is what makes a
 * header a page banner (HTML-AAM). Read from the DOM because Testing Library gives every `<header>`
 * the banner role wherever it sits.
 *
 * @returns The banner elements.
 */
function pageBanners(): readonly HTMLElement[] {
	return [...document.querySelectorAll<HTMLElement>('header')].filter((header) => (header.parentElement?.closest('article, aside, main, nav, section') ?? null) === null);
}

describe('booting', () => {
	it('/books holds its boot caption in one main landmark', () => {
		boots.books.mockImplementation(pending);
		render(BooksPage);

		expect(onlyMain().querySelector('.fe-boot-caption')).not.toBeNull();
	});

	it('/real-estate holds its boot caption in one main landmark', () => {
		boots.realEstate.mockImplementation(pending);
		render(RealEstatePage);

		expect(onlyMain().querySelector('.fe-boot-caption')).not.toBeNull();
	});

	it('/wine holds its loader and caption in one main landmark', async () => {
		boots.wine.mockImplementation(pending);
		render(WinePage);

		await waitFor(() => {
			expect(boots.wine).toHaveBeenCalledOnce();
		});
		expect(within(onlyMain()).getByLabelText('Loading wine reviews')).toBeDefined();
	});

	it('the wine loader is one main landmark on its own, as /wine-server shows it while it connects', () => {
		render(WineBootScreen, { idleCaption: 'Connecting to the filter server', progress: null });

		expect(within(onlyMain()).getByText('Connecting to the filter server')).toBeDefined();
	});
});

describe('a failed boot', () => {
	it('/wine shows the failure in one main landmark', async () => {
		boots.wine.mockRejectedValue(new Error('the worker died'));
		render(WinePage);

		await waitFor(() => {
			expect(screen.getByRole('alert')).toBeDefined();
		});
		const alert = within(onlyMain()).getByRole('alert');

		expect(within(alert).getByText('the worker died')).toBeDefined();
		expect(within(alert).getByText(BOOT_FAILURE_COPY.wine.title)).toBeDefined();
		expect(alert.textContent).toContain(BOOT_FAILURE_COPY.wine.hint);
		expect(alert.textContent.replace(/\s+/gu, ' ')).toContain(
			'Set VITE_WINE_TIER=default to boot the 10,000-wine default tier on the main thread instead.',
		);
	});

	it('/books shows the failure in one main landmark, rather than its caption forever', async () => {
		boots.books.mockRejectedValue(new Error('corpus fetch returned 500'));
		render(BooksPage);

		await waitFor(() => {
			expect(screen.getByRole('alert')).toBeDefined();
		});
		const alert = within(onlyMain()).getByRole('alert');

		expect(within(alert).getByText(BOOT_FAILURE_COPY.books.title)).toBeDefined();
		expect(within(alert).getByText('corpus fetch returned 500')).toBeDefined();
		expect(alert.textContent).toContain(BOOT_FAILURE_COPY.books.hint);
		expect(document.querySelector('.fe-boot-caption')).toBeNull();
	});

	it('/real-estate shows the failure in one main landmark', async () => {
		boots.realEstate.mockRejectedValue(new Error('corpus fetch returned 503'));
		render(RealEstatePage);

		await waitFor(() => {
			expect(screen.getByRole('alert')).toBeDefined();
		});
		const alert = within(onlyMain()).getByRole('alert');

		expect(within(alert).getByText('corpus fetch returned 503')).toBeDefined();
		expect(within(alert).getByText(BOOT_FAILURE_COPY['real-estate'].title)).toBeDefined();
		expect(alert.textContent).toContain(BOOT_FAILURE_COPY['real-estate'].hint);
	});
});

describe('the server routes’ fallbacks', () => {
	it.each([
		['connecting', true, null],
		['failed', false, 'fetch failed'],
		['without JavaScript', false, null],
	] as const)('/books-server puts its results in one main landmark, below one banner, %s', (_state, booting, bootError) => {
		render(BooksServerFallback, {
			applied: { genres: [], minRating: null, search: '' },
			bootError,
			booting,
			genres: ['fantasy'],
			matched: 0,
			sample: [],
			total: 10,
		});

		expect(onlyMain().querySelector('form')).not.toBeNull();
		expect(pageBanners()).toHaveLength(1);
	});

	it('/books-server says what every app says while it connects, and when the server is unreachable', () => {
		const props = {
			applied: { genres: [], minRating: null, search: '' },
			genres: ['fantasy'],
			matched: 0,
			sample: [],
			total: 10,
		};
		const connecting = render(BooksServerFallback, { ...props, bootError: null, booting: true });

		expect(onlyMain().textContent).toContain('Filtering on the Node server · fetching corpus + initial state');
		connecting.unmount();

		render(BooksServerFallback, { ...props, bootError: 'fetch failed', booting: false });
		const alert = within(onlyMain()).getByRole('alert');

		expect(within(alert).getByText('Can\'t reach the filter server')).toBeDefined();
		expect(within(alert).getByText('fetch failed')).toBeDefined();
		expect(alert.textContent.replace(/\s+/gu, ' ')).toMatch(/Start it with .+, then refresh\./u);
	});

	it.each([
		['connecting', true, null],
		['failed', false, 'fetch failed'],
		['without JavaScript', false, null],
	] as const)('/wine-server puts its results in one main landmark, below one banner, %s', (_state, booting, bootError) => {
		render(WineServerFallback, {
			applied: { colors: [], minPoints: null, search: '' },
			bootError,
			booting,
			colors: ['red'],
			matched: 0,
			sample: [],
			total: 10,
		});

		expect(onlyMain().querySelector('form')).not.toBeNull();
		expect(pageBanners()).toHaveLength(1);
	});
});

describe('the error page', () => {
	it('puts the not-found message in one main landmark', () => {
		window.history.replaceState(null, '', '/nope');
		showTestPageError(404, 'Not Found');
		render(ErrorPage);

		expect(onlyMain().classList.contains('fe-notfound')).toBe(true);
		expect(screen.queryByRole('alert')).toBeNull();
		window.history.replaceState(null, '', '/');
	});

	it('puts the page-error screen, not the not-found page, in one main landmark for a 500', () => {
		// A load that threw is not a missing address: the words every app shows when a page cannot
		// load, with the error's own message.
		window.history.replaceState(null, '', '/wine');
		showTestPageError(500, 'the load threw');
		render(ErrorPage);

		const main = onlyMain();
		const alert = within(main).getByRole('alert');

		expect(main.classList.contains('fe-notfound')).toBe(false);
		expect(within(alert).getByText(PAGE_ERROR_TITLE)).toBeDefined();
		expect(within(alert).getByText('the load threw')).toBeDefined();
		expect(within(alert).getByText(PAGE_ERROR_HINT)).toBeDefined();
		expect(within(alert).getByRole('link').getAttribute('href')).toBe('/');
		window.history.replaceState(null, '', '/');
	});
});
