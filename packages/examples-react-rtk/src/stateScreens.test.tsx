/**
 * Every screen this app shows before, or instead of, a booted dataset has exactly one main landmark,
 * holding what the screen says.
 *
 * @remarks
 * The screens: a dataset route's boot screen (on its first frame, while the dataset code loads, and
 * while the engine boots) in both of its shapes — wine's hero loader and the inline caption books and
 * real estate boot behind — its failure screen, and `/books-server`'s connecting and offline screens.
 * The failure screen's words are `BOOT_FAILURE_COPY`'s, inside an element with `role="alert"` that
 * sits within the landmark rather than replacing it. An accessibility audit often runs while one of them is up — the 150,000-wine tier takes a
 * while to generate — and a page with no `<main>` fails it however good the booted app is.
 *
 * Each dataset's own loaded page carries its `<main>` in its markup and is driven by the end-to-end
 * suite; the React plain app's `routes/DatasetRoute.test.tsx` walks the same boot lifecycle in full.
 *
 * Rendered with `react-dom` directly: this package has no Testing Library, and the assertions need
 * nothing beyond a container and `act`.
 *
 * @packageDocumentation
 */

import { BOOKS_BOOT_IDLE_CAPTION, BOOT_FAILURE_COPY } from '@filter-enginez/examples-shared/boot-caption';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DatasetEntry, DatasetModule } from './datasets.js';

/** The server engine's boot, replaced so a case decides whether the server answers. */
const bootBooksServerEngine = vi.hoisted(() => vi.fn<() => Promise<never>>());

vi.mock('@filter-enginez/examples-shared/books-server-core', () => ({ bootBooksServerEngine }));

const { DatasetRoute } = await import('./routes/DatasetRoute.js');
const { ServerConnecting } = await import('./books-server/ServerConnecting.js');
const { BooksServerRoute } = await import('./books-server/BooksServerRoute.js');

/** The element each case renders into, attached to the document. */
let container: HTMLElement;
/** The React root rendering into it. */
let root: Root;

beforeEach(() => {
	// React's `act` warns, and does not flush, unless the environment says it supports it.
	Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
	container = document.createElement('div');
	document.body.append(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => {
		root.unmount();
	});
	container.remove();
	vi.restoreAllMocks();
});

/**
 * Render an element and let its effects, and the promises they start, run.
 *
 * @param element - The element.
 */
async function renderSettled(element: React.ReactElement): Promise<void> {
	await act(async () => {
		root.render(element);
		// A few turns: a dataset route awaits two dynamic imports before it boots.
		for (let turn = 0; turn < 10; turn++) {
			await Promise.resolve();
		}
	});
}

/**
 * A books dataset entry whose code loads as `load` says — the inline-caption boot shape.
 *
 * @param load - What loading the dataset's code does.
 * @returns The entry.
 */
function entryLoading(load: () => Promise<DatasetModule>): DatasetEntry {
	return {
		bootFailure: 'books',
		id: 'books',
		idleCaption: BOOKS_BOOT_IDLE_CAPTION,
		label: 'Books',
		load,
		recordNoun: 'books',
		tagline: 'a test dataset',
	};
}

/**
 * A wine dataset entry whose code loads as `load` says — the hero-loader boot shape.
 *
 * @param load - What loading the dataset's code does.
 * @returns The entry.
 */
function wineEntryLoading(load: () => Promise<DatasetModule>): DatasetEntry {
	return {
		bootFailure: 'wine',
		heroLoaderLabel: 'Loading wine reviews',
		id: 'wine',
		label: 'Wine reviews',
		load,
		recordNoun: 'bottles',
		tagline: 'a test dataset',
	};
}

/** A load that never settles: the route stays on its boot screen. */
const pendingLoad = async (): Promise<never> => new Promise<never>(() => undefined);

/**
 * The one main landmark rendered.
 *
 * @returns It.
 * @throws When there is none, or more than one.
 */
function onlyMain(): HTMLElement {
	const mains = [...container.querySelectorAll<HTMLElement>('main, [role="main"]')];

	expect(mains).toHaveLength(1);

	return mains[0] as HTMLElement;
}

describe('a dataset route', () => {
	it('holds the inline caption, and no hero loader, in one main landmark while books code loads', async () => {
		await renderSettled(<DatasetRoute entry={entryLoading(pendingLoad)} />);

		expect(onlyMain().querySelector('.fe-boot-caption--inline')?.textContent).toBe(BOOKS_BOOT_IDLE_CAPTION);
		expect(onlyMain().querySelector('.fe-boot-loader')).toBeNull();
	});

	it('keeps the inline caption in one main landmark while the books engine boots', async () => {
		const bootAndWire = vi.fn(async () => new Promise<never>(() => undefined));

		await renderSettled(<DatasetRoute entry={entryLoading(async () => Promise.resolve({ bootAndWire, Component: () => null }))} />);
		await vi.waitFor(() => {
			expect(bootAndWire).toHaveBeenCalledOnce();
		});

		expect(onlyMain().querySelector('.fe-boot-caption--inline')?.textContent).toBe(BOOKS_BOOT_IDLE_CAPTION);
	});

	it('holds the wine hero loader and its caption in one main landmark', async () => {
		await renderSettled(<DatasetRoute entry={wineEntryLoading(pendingLoad)} />);

		expect(onlyMain().querySelector('[aria-label="Loading wine reviews"]')).not.toBeNull();
		expect(onlyMain().querySelector('.fe-boot-caption--hero')?.textContent).toBe('Spinning up worker thread');
	});

	it("shows a failed boot as the dataset's shared failure copy, in an alert inside one main landmark", async () => {
		await renderSettled(<DatasetRoute entry={entryLoading(async () => Promise.reject(new Error('corpus fetch returned 503')))} />);

		const alert = onlyMain().querySelector('[role="alert"]');

		expect(alert?.textContent).toContain(BOOT_FAILURE_COPY.books.title);
		expect(alert?.textContent).toContain('corpus fetch returned 503');
		expect(alert?.textContent).toContain(BOOT_FAILURE_COPY.books.hint);
		expect(alert?.querySelector('code')).toBeNull();
	});

	it("follows wine's failure hint with this build's main-thread tier setting", async () => {
		await renderSettled(<DatasetRoute entry={wineEntryLoading(async () => Promise.reject(new Error('worker failed to start')))} />);

		const alert = onlyMain().querySelector('[role="alert"]');

		expect(alert?.textContent).toContain(BOOT_FAILURE_COPY.wine.title);
		expect(alert?.textContent).toContain(BOOT_FAILURE_COPY.wine.hint);
		expect(alert?.textContent).toContain(
			'Set VITE_WINE_TIER=default to boot the 10,000-wine default tier on the main thread instead.',
		);
		expect(alert?.querySelector('code')?.textContent).toBe('VITE_WINE_TIER=default');
	});
});

describe('/books-server', () => {
	it('holds the connecting loader in one main landmark', async () => {
		await renderSettled(<ServerConnecting />);

		expect(onlyMain().querySelector('[aria-label="Connecting to the filter server"]')).not.toBeNull();
	});

	it('shows the connecting loader in one main landmark while the server engine boots', async () => {
		bootBooksServerEngine.mockReturnValue(new Promise<never>(() => undefined));
		await renderSettled(<BooksServerRoute />);

		expect(onlyMain().querySelector('[aria-label="Connecting to the filter server"]')).not.toBeNull();
	});

	it('shows an unreachable server in one main landmark', async () => {
		bootBooksServerEngine.mockRejectedValue(new Error('fetch failed'));
		await renderSettled(<BooksServerRoute />);

		expect(onlyMain().textContent).toContain("Can't reach the filter server");
		expect(onlyMain().textContent).toContain('fetch failed');
	});
});
