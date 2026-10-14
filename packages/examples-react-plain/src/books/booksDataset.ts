/**
 * The books dataset's code half — loaded on demand by the registry's `load`, never imported statically.
 *
 * @remarks
 * Everything the `/books` route needs beyond its hub card: the main-thread boot over the streamed
 * default tier, its progress store and `<BooksApp>`. This module is the root of the route's chunk; see
 * `datasets.tsx` for why the registry may only reach it through `import()`. `/lab` borrows this module
 * too, swapping in its own page (`lab/labEntry.ts`).
 *
 * @packageDocumentation
 */

import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import {
	bootBooksEngine,
	getBooksBootProgressSnapshot,
	subscribeBooksBootProgress,
} from '@filter-enginez/examples-shared/books';

import type { BootedDataset, DatasetModule } from '../datasets.js';

import { BooksApp } from './BooksApp.js';

/** Boots the bundled default tier on the main thread (see `examples-shared/books`). */
export const booksDataset: DatasetModule = {
	boot: async (): Promise<BootedDataset> => {
		const bundle = await bootBooksEngine();

		return { engine: bundle.engine as unknown as SignalsEngine<unknown> };
	},
	Component: BooksApp,
	getProgressSnapshot: getBooksBootProgressSnapshot,
	subscribeProgress: subscribeBooksBootProgress,
};
