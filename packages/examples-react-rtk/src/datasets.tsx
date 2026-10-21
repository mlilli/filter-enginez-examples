/**
 * Dataset registry — the single source of truth for which datasets the RTK app serves, their
 * landing-page metadata, and how to load, boot + Redux-wire them.
 *
 * @remarks
 * `<DatasetRoute>` and `<LandingPage>` both read from here, so adding a dataset is one entry: its card
 * copy and a `load` for its module (`bootAndWire` / progress / `Component`), and both the route and the
 * landing card appear. The boot itself stays in the framework-agnostic `examples-shared/<dataset>`
 * slice, which the other verticals share; this registry is the React+RTK binding.
 *
 * ### Two halves per dataset: the card and the code
 *
 * The hub renders from this registry, so everything in it is in the startup bundle. An entry therefore
 * holds only what the hub card and the boot screen print — id, label, record noun, tagline, the boot
 * screen's shape and words — and a
 * `load` that `import()`s the rest: the dataset's {@link DatasetModule}, whose module graph carries the
 * engine, the dataset's `examples-shared` slice, its page and its Redux store. Each dataset's code is
 * its own chunk, fetched the first time its route opens (or its hub card is hovered or focused), so a
 * visitor pays for the datasets they open and nothing else. Redux Toolkit itself arrives with the first
 * dataset; each dataset's mirror store is still created by its `bootAndWire`, on arrival, which is
 * when the Redux DevTools extension sees it.
 *
 * 🔴 **Nothing here may statically import a dataset module, a page, a store, or an `examples-shared`
 * dataset slice.** One such import moves that code back into the startup bundle with no error and no
 * warning other than the startup budget the build checks (`scripts/check-startup-budget.mjs`).
 *
 * @packageDocumentation
 */

import type { SignalsEngine } from '@filter-enginez/reactive-signals';
import type { Store } from '@reduxjs/toolkit';

import {
	BOOKS_BOOT_IDLE_CAPTION,
	type BootFailureDataset,
	REAL_ESTATE_BOOT_IDLE_CAPTION,
} from '@filter-enginez/examples-shared/boot-caption';

/** Boot progress the loader reads — records loaded so far out of the tier total. */
export interface DatasetBootProgress {
	readonly loaded: number;
	readonly total: number;
	/**
	 * Whether `total` is an estimate, which the loader caption marks with `~`. Only the wine route's
	 * local real corpus streams without knowing its length; every other total is exact.
	 */
	readonly isTotalEstimated?: boolean;
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
 * The code half of a dataset: what its lazily loaded module provides once its chunk has arrived.
 */
export interface DatasetModule {
	/** The dataset app rendered inside the providers once boot resolves. */
	readonly Component: React.ComponentType;
	/** Boot the engine (cached) + attach a fresh Redux mirror store; returns the render handle. */
	readonly bootAndWire: () => Promise<BootedDataset>;
	/** Read the current boot progress (for the loader). */
	readonly getProgressSnapshot?: () => DatasetBootProgress | null;
	/** Subscribe to boot-progress changes (`useSyncExternalStore`-shaped). */
	readonly subscribeProgress?: (onStoreChange: () => void) => () => void;
}

/**
 * One dataset the app serves: its route id, landing-card copy, and the loader for its code.
 */
export interface DatasetEntry {
	/**
	 * Whose words the boot-failure screen shows: `BOOT_FAILURE_COPY[bootFailure]`, the copy every app
	 * shows for that dataset. `/books-config` fails as books does.
	 */
	readonly bootFailure: BootFailureDataset;
	/**
	 * The accessible name of the full-screen hero loader, for a dataset whose cold start shows one —
	 * wine's worker spin-up, "Loading wine reviews" in every app. Absent, the boot screen is the inline
	 * caption alone, which is how every app boots books and real estate.
	 */
	readonly heroLoaderLabel?: string;
	/** URL segment + registry key, e.g. `wine`. */
	readonly id: string;
	/**
	 * The caption's pre-stream sentence, e.g. books' `Booting the books engine…`. Absent, the shared
	 * default (`DEFAULT_IDLE_CAPTION`), which is wine's.
	 */
	readonly idleCaption?: string;
	/** Human label, e.g. `Wine reviews`. */
	readonly label: string;
	/**
	 * Load the dataset's {@link DatasetModule} — its own chunk. The browser's module map holds the
	 * module once it has loaded, so every call after the first resolves to the same object without
	 * fetching again.
	 */
	readonly load: () => Promise<DatasetModule>;
	/** Plural record noun for the loader caption, e.g. `bottles`. */
	readonly recordNoun: string;
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

/** The wine dataset. Boots the 150,000-wine tier in a worker (see `examples-shared/wine`). */
const wine: DatasetEntry = {
	bootFailure: 'wine',
	heroLoaderLabel: 'Loading wine reviews',
	id: 'wine',
	label: 'Wine reviews',
	load: async () => (await import('./wine/wineDataset.js')).wineDataset,
	recordNoun: 'bottles',
	supportsUrlState: true,
	tagline:
		'150,000 synthetic wine reviews — a cascading origin hierarchy, points / price / ABV ranges, and typo-tolerant tasting-note search.',
};

/** Books. Boots the bundled default tier on the main thread (see `examples-shared/books`). */
const books: DatasetEntry = {
	bootFailure: 'books',
	id: 'books',
	idleCaption: BOOKS_BOOT_IDLE_CAPTION,
	label: 'Books',
	load: async () => (await import('./books/booksDataset.js')).booksDataset,
	recordNoun: 'books',
	supportsUrlState: true,
	tagline:
		'≈10k Open Library titles — genre / format / language facets, publication-year + rating ranges, fuzzy author search.',
};

/** Books · config-driven. Same corpus as `books`, but the engine boots from
 * `booksFilterConfig` via `loadConfig` and the whole panel is generated from that JSON (see
 * `examples-shared/books` — `bootBooksConfigEngine` + `ConfigDrivenPanel`). The headline
 * "the filter UI is a function of the data" demonstration. */
const booksConfig: DatasetEntry = {
	bootFailure: 'books',
	id: 'books-config',
	idleCaption: BOOKS_BOOT_IDLE_CAPTION,
	label: 'Books · config-driven',
	load: async () => (await import('./books/booksConfigDataset.js')).booksConfigDataset,
	recordNoun: 'books',
	supportsUrlState: true,
	tagline:
		'The same Open Library corpus — but the entire filter panel is generated from a declarative JSON FilterEngineConfig via loadConfig. The UI is a function of the data.',
};

/** Real estate. The geo-heavy dataset (GeoProximity / R-tree, DateRange, metro→neighborhood
 * tree), booting the bundled default tier on the main thread (see `examples-shared/real-estate`). */
const realEstate: DatasetEntry = {
	bootFailure: 'real-estate',
	id: 'real-estate',
	idleCaption: REAL_ESTATE_BOOT_IDLE_CAPTION,
	label: 'Real estate',
	load: async () => (await import('./real-estate/realEstateDataset.js')).realEstateDataset,
	recordNoun: 'listings',
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
