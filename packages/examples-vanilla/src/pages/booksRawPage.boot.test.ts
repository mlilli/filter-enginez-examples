/**
 * `/books-raw` when its bare engine cannot be built: the same boot-failure screen `/books` shows.
 *
 * @remarks
 * A second file beside `booksRawPage.test.ts`, which boots the real corpus: this one mocks
 * `buildBooksEngine` to throw, and a module mock applies to a whole file. The throw stands in for
 * any failure on the way to an engine (the dataset chunk not arriving, the acceleration not
 * installing): all of them leave through the same `catch`.
 *
 * @packageDocumentation
 */

import type * as BooksCore from '@filter-enginez/examples-shared/books-core';

import { BOOT_FAILURE_COPY } from '@filter-enginez/examples-shared/boot-caption';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@filter-enginez/examples-shared/books-core', async (importOriginal) => ({
	...(await importOriginal<typeof BooksCore>()),
	buildBooksEngine: (): never => {
		throw new Error('bare engine could not be built');
	},
}));

const { renderBooksRawPage } = await import('./booksRawPage.js');

/** The route container, fresh per case. */
let container: HTMLElement;

beforeEach(() => {
	container = document.createElement('div');
	document.body.replaceChildren(container);
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('the /books-raw page — a boot that fails', () => {
	it('replaces the boot caption with main > [role=alert]: the books title, the message, the hint', async () => {
		await expect(renderBooksRawPage(container)).resolves.toBeTypeOf('function');

		const alert = container.querySelector(':scope > main > [role="alert"]');
		const lines = [...(alert?.querySelectorAll('p') ?? [])].map((line) => line.textContent);

		expect(container.querySelector('.fe-boot-caption')).toBeNull();
		expect(lines).toEqual([
			BOOT_FAILURE_COPY.books.title,
			'bare engine could not be built',
			BOOT_FAILURE_COPY.books.hint,
		]);
		expect(console.error).toHaveBeenCalledWith('[books-raw] boot failed:', expect.any(Error));
	});

	it('still returns a teardown, which clears the failure screen on navigation', async () => {
		const teardown = await renderBooksRawPage(container);

		teardown();

		expect(container.childElementCount).toBe(0);
	});
});
