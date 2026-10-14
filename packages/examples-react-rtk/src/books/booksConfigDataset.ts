/**
 * The config-driven books dataset's code half — loaded on demand by the registry's `load`, never
 * imported statically.
 *
 * @remarks
 * Its own module rather than a second export beside `booksDataset`, so `/books` and `/books-config`
 * each fetch only their own page: a module is the unit a chunk is cut from. See `datasets.tsx` for why
 * the registry may only reach it through `import()`.
 *
 * @packageDocumentation
 */

import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import {
	bootBooksConfigEngine,
	getBooksConfigBootProgressSnapshot,
	subscribeBooksConfigBootProgress,
} from '@filter-enginez/examples-shared/books';

import type { BootedDataset, DatasetModule } from '../datasets.js';

import { BooksConfigApp } from './BooksConfigApp.js';
import { createBooksStore } from './store.js';

/**
 * Same corpus as `books`, but the engine boots from `booksFilterConfig` via `loadConfig` and the whole
 * panel is generated from that JSON (see `examples-shared/books` — `bootBooksConfigEngine` +
 * `ConfigDrivenPanel`). Wires the same books mirror store.
 */
export const booksConfigDataset: DatasetModule = {
	bootAndWire: async (): Promise<BootedDataset> => {
		const bundle = await bootBooksConfigEngine();
		const { detach, store } = createBooksStore(bundle.engine.core);

		return { detach, engine: bundle.engine as unknown as SignalsEngine<unknown>, store };
	},
	Component: BooksConfigApp,
	getProgressSnapshot: getBooksConfigBootProgressSnapshot,
	subscribeProgress: subscribeBooksConfigBootProgress,
};
