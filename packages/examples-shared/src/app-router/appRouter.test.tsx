/**
 * Tests for the router the React apps mount: it routes, the head follows the route, and a page that
 * fails to load or render shows the page-error screen, one main landmark, until the visitor moves on.
 *
 * @packageDocumentation
 */

import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { lazy } from 'react';
import { Link, type RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PAGE_ERROR_HINT, PAGE_ERROR_HOME_HREF, PAGE_ERROR_TITLE, PAGE_ERROR_UNKNOWN_DETAIL } from '../page-error/core.js';
import { type PageMeta } from '../page-meta/pageMeta.js';
import { AppRouter } from './AppRouter.js';

/**
 * Indexable metadata named after its path.
 *
 * @param pathname - The path.
 * @returns The metadata.
 */
function metaFor(pathname: string): PageMeta {
	return { canonicalUrl: `https://example.test${pathname}`, description: pathname, title: `Title ${pathname}` };
}

/**
 * A page that throws while it renders.
 *
 * @returns Never.
 * @throws Always.
 */
const BrokenPage = (): never => {
	throw new Error('the page broke');
};

/**
 * A page that throws something that is not an `Error`.
 *
 * @returns Never.
 * @throws Always, `undefined`.
 */
const ThrowsNothingPage = (): never => {
	// eslint-disable-next-line @typescript-eslint/only-throw-error -- the case under test: anything can be thrown.
	throw undefined;
};

/** A page whose code does not arrive, as when a deploy replaced the chunk an open tab asks for. */
const UnloadablePage = lazy(async () => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/gone.js')));

/** The routes under test: a hub, a page with a filter link, and three pages that fail. */
const ROUTES: RouteObject[] = [
	{
		element: (
			<nav>
				<Link to="/books">Books</Link>
			</nav>
		),
		path: '/',
	},
	{
		element: (
			<>
				<p>Books page</p>
				<Link to="/books?f=x">Filter the books</Link>
			</>
		),
		path: '/books',
	},
	{ element: <BrokenPage />, path: '/broken' },
	{ element: <ThrowsNothingPage />, path: '/nothing' },
	{ element: <UnloadablePage />, path: '/unloadable' },
];

/** Let every settled promise's callbacks run, inside `act` so React commits what they cause. */
async function flush(): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => {
			setTimeout(resolve, 0);
		});
	});
}

/**
 * Mount the router at a path.
 *
 * @param path - Where the visit starts.
 * @param pageMeta - The head's resolver.
 */
async function openAt(path: string, pageMeta: (pathname: string) => PageMeta = metaFor): Promise<void> {
	window.history.replaceState(null, '', path);
	render(<AppRouter pageMeta={pageMeta} routes={ROUTES} />);
	await flush();
}

/**
 * Go back in history, as the browser's back button does.
 */
async function goBack(): Promise<void> {
	await act(async () => {
		window.history.back();
		await new Promise((resolve) => {
			window.addEventListener('popstate', resolve, { once: true });
		});
	});
	await flush();
}

beforeEach(() => {
	// React reports every error a boundary catches; the failures here are the point of the tests.
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	cleanup();
	document.head.replaceChildren();
	document.title = '';
	vi.restoreAllMocks();
});

describe('AppRouter', () => {
	it('renders the route at the current location', async () => {
		await openAt('/books');

		expect(screen.getByText('Books page')).toBeDefined();
	});

	it('writes each route’s head, and again only when the path changes', async () => {
		const pageMeta = vi.fn(metaFor);

		await openAt('/', pageMeta);
		expect(document.title).toBe('Title /');

		fireEvent.click(screen.getByRole('link', { name: 'Books' }));
		await flush();
		expect(screen.getByText('Books page')).toBeDefined();
		expect(document.title).toBe('Title /books');
		expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://example.test/books');

		// A filter state in the query is the same page: nothing new to write.
		fireEvent.click(screen.getByRole('link', { name: 'Filter the books' }));
		await flush();
		expect(window.location.search).toBe('?f=x');
		expect(pageMeta.mock.calls.map(([pathname]) => pathname)).toEqual(['/', '/books']);

		await goBack();
		await goBack();
		expect(document.title).toBe('Title /');
		expect(pageMeta.mock.calls.map(([pathname]) => pathname)).toEqual(['/', '/books', '/']);
	});
});

describe('a page that fails', () => {
	it('shows the page-error screen, one main landmark around an alert, for a page that throws', async () => {
		await openAt('/broken');

		const mains = screen.getAllByRole('main');
		const alert = within(mains[0] as HTMLElement).getByRole('alert');

		expect(mains).toHaveLength(1);
		expect(within(alert).getByText(PAGE_ERROR_TITLE)).toBeDefined();
		expect(within(alert).getByText('the page broke')).toBeDefined();
		expect(within(alert).getByText(PAGE_ERROR_HINT)).toBeDefined();
		expect(within(alert).getByRole('link').getAttribute('href')).toBe(PAGE_ERROR_HOME_HREF);
	});

	it('shows it for a page whose code does not load, naming what failed', async () => {
		await openAt('/unloadable');

		expect(screen.getAllByRole('main')).toHaveLength(1);
		expect(screen.getByText('Failed to fetch dynamically imported module: /assets/gone.js')).toBeDefined();
	});

	it('shows it for a page that throws something other than an error', async () => {
		await openAt('/nothing');

		expect(screen.getByText(PAGE_ERROR_TITLE)).toBeDefined();
		expect(screen.getByText(PAGE_ERROR_UNKNOWN_DETAIL)).toBeDefined();
	});

	it('still writes the failed route’s head', async () => {
		await openAt('/broken');

		expect(document.title).toBe('Title /broken');
	});

	it('clears the failure once the visitor moves to another path', async () => {
		await openAt('/');
		await act(async () => {
			window.history.pushState(null, '', '/broken');
			window.dispatchEvent(new PopStateEvent('popstate'));
			await Promise.resolve();
		});
		await flush();
		expect(screen.getByText(PAGE_ERROR_TITLE)).toBeDefined();

		await goBack();

		expect(screen.queryByText(PAGE_ERROR_TITLE)).toBeNull();
		expect(screen.getByRole('link', { name: 'Books' })).toBeDefined();
	});
});
