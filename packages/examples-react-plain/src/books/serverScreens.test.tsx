/**
 * `/books-server`'s connecting and offline screens each have exactly one main landmark, holding what
 * the screen says.
 *
 * @remarks
 * An accessibility audit can run while either is up, and a page with no `<main>` fails it however good
 * the connected app is. The dataset routes' boot screens are checked in `routes/DatasetRoute.test.tsx`.
 *
 * @packageDocumentation
 */

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The server engine's boot, replaced so a case decides whether the server answers. */
const bootBooksServerEngine = vi.hoisted(() => vi.fn<() => Promise<never>>());

vi.mock('@filter-enginez/examples-shared/books-server-core', () => ({ bootBooksServerEngine }));

const { ServerConnecting } = await import('./ServerConnecting.js');
const { BooksServerRoute } = await import('./BooksServerRoute.js');

afterEach(() => {
	// No `globals: true`, so Testing Library registers no auto-cleanup.
	cleanup();
	vi.restoreAllMocks();
});

/**
 * The one main landmark on screen.
 *
 * @returns It.
 * @throws When there is none, or more than one.
 */
function onlyMain(): HTMLElement {
	const mains = screen.getAllByRole('main');

	expect(mains).toHaveLength(1);

	return mains[0] as HTMLElement;
}

describe('/books-server', () => {
	it('holds the connecting loader in one main landmark', () => {
		render(<ServerConnecting />);

		expect(within(onlyMain()).getByLabelText('Connecting to the filter server')).toBeDefined();
	});

	it('shows the connecting loader in one main landmark while the server engine boots', () => {
		bootBooksServerEngine.mockReturnValue(new Promise<never>(() => undefined));
		render(<BooksServerRoute />);

		expect(within(onlyMain()).getByLabelText('Connecting to the filter server')).toBeDefined();
	});

	it('shows an unreachable server in one main landmark', async () => {
		bootBooksServerEngine.mockRejectedValue(new Error('fetch failed'));
		render(<BooksServerRoute />);

		await waitFor(() => {
			expect(screen.getByText("Can't reach the filter server")).toBeDefined();
		});
		expect(within(onlyMain()).getByText('fetch failed')).toBeDefined();
	});
});
