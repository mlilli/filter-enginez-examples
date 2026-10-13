/**
 * Dataset registry — the single source of truth for which datasets the RTK app serves, their
 * landing-page metadata, and how to boot + Redux-wire them.
 *
 * @remarks
 * `<DatasetRoute>` and `<LandingPage>` both read from here, so adding a dataset is one entry: its
 * `bootAndWire` / progress / `Component`, and both the route and the landing card appear. The boot
 * itself stays in the framework-agnostic `examples-shared/<dataset>` slice, which the other
 * verticals share; this registry is the React+RTK binding.
 *
 * @packageDocumentation
 */

import type { SignalsEngine } from '@filter-enginez/reactive-signals';
import type { Store } from '@reduxjs/toolkit';

import {
	bootBooksConfigEngine,
	bootBooksEngine,
	getBooksBootProgressSnapshot,
	getBooksConfigBootProgressSnapshot,
	subscribeBooksBootProgress,
	subscribeBooksConfigBootProgress,
} from '@filter-enginez/examples-shared/books';
import {
	bootRealEstateEngine,
	getRealEstateBootProgressSnapshot,
	subscribeRealEstateBootProgress,
} from '@filter-enginez/examples-shared/real-estate';
import {
	bootWineEngine,
	getWineBootProgressSnapshot,
	subscribeWineBootProgress,
} from '@filter-enginez/examples-shared/wine';
import { spawnWineWorker } from '@filter-enginez/examples-shared/wine-worker-spawn';

import { BooksApp } from './books/BooksApp.js';
import { BooksConfigApp } from './books/BooksConfigApp.js';
import { createBooksStore } from './books/store.js';
import { RealEstateApp } from './real-estate/RealEstateApp.js';
import { createRealEstateStore } from './real-estate/store.js';
import { createWineStore } from './store.js';
import { WineApp } from './wine/WineApp.js';

/** Boot progress the loader reads — records loaded so far out of the tier total. */
export interface DatasetBootProgress {
	readonly loaded: number;
	readonly total: number;
}

/**
 * A booted + Redux-wired dataset, ready to render behind its providers. `engine` is type-erased to
 * `unknown` (the registry holds heterogeneous datasets); the per-hook `useFilterEngine<T>()` downcast
 * recovers the concrete record type for consumers, exactly as `FilterEngineProvider` intends.
 */
export interface BootedDataset {
	readonly detach: () => void;
	readonly engine: SignalsEngine<unknown>;
	readonly store: Store;
}

/**
 * One dataset the app serves: its route id, landing-card copy, boot-and-wire function, boot-progress
 * store and the `Component` rendered once the engine is ready.
 */
export interface DatasetEntry {
	/** The dataset app rendered inside the providers once boot resolves. */
	readonly Component: React.ComponentType;
	/** Boot the engine (cached) + attach a fresh Redux mirror store; returns the render handle. */
	readonly bootAndWire: () => Promise<BootedDataset>;
	/** Read the current boot progress (for the loader). */
	readonly getProgressSnapshot?: () => DatasetBootProgress | null;
	/** URL segment + registry key, e.g. `wine`. */
	readonly id: string;
	/** Human label, e.g. `Wine reviews`. */
	readonly label: string;
	/** Plural record noun for the loader caption, e.g. `bottles`. */
	readonly recordNoun: string;
	/** Subscribe to boot-progress changes (`useSyncExternalStore`-shaped). */
	readonly subscribeProgress?: (onStoreChange: () => void) => () => void;
	/**
	 * Whether this route keeps its filter state in a shareable URL via `<FilterEngineUrlSync>`. Every
	 * dataset sets it; the worker-backed wine tier syncs through `engine.asyncEngine` (passed as
	 * `asyncConfig`), because its synchronous `engine.core.exportConfig()` shim cannot answer across
	 * the worker boundary. Unset or `false` mounts no URL sync.
	 */
	readonly supportsUrlState?: boolean;
	/** One-line landing-card blurb. */
	readonly tagline: string;
}

/** The wine dataset. Boots the 130k corpus in a worker (see `examples-shared/wine`). */
const wine: DatasetEntry = {
	bootAndWire: async (): Promise<BootedDataset> => {
		const bundle = await bootWineEngine({ spawnWorker: spawnWineWorker });
		const { detach, store } = createWineStore(bundle.engine.core);

		return { detach, engine: bundle.engine as unknown as SignalsEngine<unknown>, store };
	},
	Component: WineApp,
	getProgressSnapshot: getWineBootProgressSnapshot,
	id: 'wine',
	label: 'Wine reviews',
	recordNoun: 'bottles',
	subscribeProgress: subscribeWineBootProgress,
	supportsUrlState: true,
	tagline:
		'≈130k Kaggle wine reviews — a cascading origin hierarchy, points / price / ABV ranges, and typo-tolerant tasting-note search.',
};

/** Books. Boots the bundled default tier on the main thread (see `examples-shared/books`). */
const books: DatasetEntry = {
	bootAndWire: async (): Promise<BootedDataset> => {
		const bundle = await bootBooksEngine();
		const { detach, store } = createBooksStore(bundle.engine.core);

		return { detach, engine: bundle.engine as unknown as SignalsEngine<unknown>, store };
	},
	Component: BooksApp,
	getProgressSnapshot: getBooksBootProgressSnapshot,
	id: 'books',
	label: 'Books',
	recordNoun: 'books',
	subscribeProgress: subscribeBooksBootProgress,
	supportsUrlState: true,
	tagline:
		'≈10k Open Library titles — genre / format / language facets, publication-year + rating ranges, fuzzy author search.',
};

/** Books · config-driven. Same corpus as `books`, but the engine boots from
 * `booksFilterConfig` via `loadConfig` and the whole panel is generated from that JSON (see
 * `examples-shared/books` — `bootBooksConfigEngine` + `ConfigDrivenPanel`). The headline
 * "the filter UI is a function of the data" demonstration. */
const booksConfig: DatasetEntry = {
	bootAndWire: async (): Promise<BootedDataset> => {
		const bundle = await bootBooksConfigEngine();
		const { detach, store } = createBooksStore(bundle.engine.core);

		return { detach, engine: bundle.engine as unknown as SignalsEngine<unknown>, store };
	},
	Component: BooksConfigApp,
	getProgressSnapshot: getBooksConfigBootProgressSnapshot,
	id: 'books-config',
	label: 'Books · config-driven',
	recordNoun: 'books',
	subscribeProgress: subscribeBooksConfigBootProgress,
	supportsUrlState: true,
	tagline:
		'The same Open Library corpus — but the entire filter panel is generated from a declarative JSON FilterEngineConfig via loadConfig. The UI is a function of the data.',
};

/** Real estate. The geo-heavy dataset (GeoProximity / R-tree, DateRange, metro→neighborhood
 * tree), booting the bundled default tier on the main thread (see `examples-shared/real-estate`). */
const realEstate: DatasetEntry = {
	bootAndWire: async (): Promise<BootedDataset> => {
		const bundle = await bootRealEstateEngine();
		const { detach, store } = createRealEstateStore(bundle.engine.core);

		return { detach, engine: bundle.engine as unknown as SignalsEngine<unknown>, store };
	},
	Component: RealEstateApp,
	getProgressSnapshot: getRealEstateBootProgressSnapshot,
	id: 'real-estate',
	label: 'Real estate',
	recordNoun: 'listings',
	subscribeProgress: subscribeRealEstateBootProgress,
	supportsUrlState: true,
	tagline:
		'MLS-style listings — geo-radius search (R-tree), beds / baths / price / sqft ranges, and a metro→neighborhood hierarchy.',
};

/** Every dataset, in landing + nav order. */
export const datasets: readonly DatasetEntry[] = [wine, books, booksConfig, realEstate];

/** Look up a dataset by its URL id. */
export function findDataset(id: string | undefined): DatasetEntry | undefined {
	return datasets.find((dataset) => dataset.id === id);
}
