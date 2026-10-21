/**
 * `/books` when its engine cannot start: the shared boot-failure screen, not the router's page error.
 *
 * @remarks
 * The boot is mocked to reject, so every case here is about the moment after the boot caption: the
 * route must replace it with `BOOT_FAILURE_COPY.books` inside `main > [role=alert]`, as the other
 * five apps' books pages do, and still hand the router a teardown. A rejection that escaped the route
 * would reach the router's generic page-error screen instead, which says nothing about the engine.
 *
 * @packageDocumentation
 */

import type * as BooksCore from '@filter-enginez/examples-shared/books-core';

import { BOOT_FAILURE_COPY } from '@filter-enginez/examples-shared/boot-caption';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** What the mocked boot rejects with in the current case. */
let bootRejection: unknown = new Error('corpus fetch failed');

vi.mock('@filter-enginez/examples-shared/books-core', async (importOriginal) => ({
	...(await importOriginal<typeof BooksCore>()),
	bootBooksEngine: async (): Promise<never> => {
		await Promise.resolve();

		throw bootRejection;
	},
}));

const { renderBooksPage } = await import('./booksPage.js');

/** The route container, fresh per case. */
let container: HTMLElement;

beforeEach(() => {
	bootRejection = new Error('corpus fetch failed');
	container = document.createElement('div');
	document.body.replaceChildren(container);
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('the /books page — a boot that fails', () => {
	it('resolves rather than rejecting, so the router never paints its page-error screen', async () => {
		await expect(renderBooksPage(container)).resolves.toBeTypeOf('function');
		expect(container.querySelector('.fe-page-error')).toBeNull();
	});

	it('replaces the boot caption with main > [role=alert]: the books title, the message, the hint', async () => {
		await renderBooksPage(container);

		const alert = container.querySelector(':scope > main > [role="alert"]');
		const lines = [...(alert?.querySelectorAll('p') ?? [])].map((line) => line.textContent);

		expect(container.querySelector('.fe-boot-caption')).toBeNull();
		expect(lines).toEqual([BOOT_FAILURE_COPY.books.title, 'corpus fetch failed', BOOT_FAILURE_COPY.books.hint]);
		expect(console.error).toHaveBeenCalledWith('[books] boot failed:', expect.any(Error));
	});

	it('shows a rejection that is not an Error as its text', async () => {
		bootRejection = 'network down';
		await renderBooksPage(container);

		expect(container.querySelector('[role="alert"]')?.querySelectorAll('p')[1]?.textContent).toBe('network down');
	});

	it('still returns a teardown, which clears the failure screen on navigation', async () => {
		const teardown = await renderBooksPage(container);

		expect(container.querySelector('[role="alert"]')).not.toBeNull();

		teardown();

		expect(container.childElementCount).toBe(0);
	});
});
