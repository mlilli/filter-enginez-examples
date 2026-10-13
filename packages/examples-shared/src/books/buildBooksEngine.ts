/**
 * `buildBooksEngine` — construct a books `FilterEngine` from a corpus.
 *
 * @remarks
 * Mirror of `buildWineEngine`: the single construction point for the books engine, so every boot
 * path builds the identical engine. No pre-registered rules — the
 * UI adds them organically on first interaction so the devtools log shows real add/change/remove
 * entries. Bitmap acceleration is initialized by the caller before building.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { createFilterEngine, type FilterEngine } from '@filter-enginez/core';

/**
 * Build a books engine over the given corpus.
 *
 * @param books - The book records to load as source data.
 * @returns A constructed sync `FilterEngine<Book>` (no rules pre-registered).
 */
export function buildBooksEngine(books: readonly Book[]): FilterEngine<Book> {
	return createFilterEngine<Book>({ sourceData: books });
}
