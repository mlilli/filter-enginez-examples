/**
 * The books dataset's code half — loaded on demand by the registry's `load`, never imported statically.
 *
 * @remarks
 * Everything the `/books` route needs beyond its hub card: the main-thread boot over the streamed
 * default tier, the Redux mirror it wires, its progress store and `<BooksApp>`. This module is the root
 * of the route's chunk; see `datasets.tsx` for why the registry may only reach it through `import()`.
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
import { createBooksStore } from './store.js';

/** Boots the bundled default tier on the main thread (see `examples-shared/books`) and wires its mirror store. */
export const booksDataset: DatasetModule = {
	bootAndWire: async (): Promise<BootedDataset> => {
		const bundle = await bootBooksEngine();
		const { detach, store } = createBooksStore(bundle.engine.core);

		return { detach, engine: bundle.engine as unknown as SignalsEngine<unknown>, store };
	},
	Component: BooksApp,
	getProgressSnapshot: getBooksBootProgressSnapshot,
	subscribeProgress: subscribeBooksBootProgress,
};
