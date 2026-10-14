/**
 * Config-driven books engine boot — the same main-thread books corpus, but booted from the
 * declarative `booksFilterConfig` via `loadConfig` instead of organic `addRule` calls.
 *
 * @remarks
 * This powers the `/books-config` route (the "the filter UI is a function of the data" showcase). It
 * is a deliberate sibling of `booksEngine.ts` rather than a reuse of it: `loadConfig` calls
 * `clearRules()` on its engine, so the config route MUST own a **separate cached engine** — sharing
 * `booksEngine`'s cache would let a `/books-config` visit wipe the rich `/books` route's filter
 * state. The progress pub/sub mirrors `booksEngine` (single-shot, main-thread) so the dataset
 * registry treats it uniformly; this pattern is already duplicated across wine / books / real-estate.
 *
 * ### The dataset loads with the boot, not with this module
 *
 * The books barrel generates the 10,000-book default tier when it is evaluated, and
 * `booksFilterConfig` is derived from those books. So both come in through one dynamic `import()` in
 * the boot itself: the dataset becomes its own chunk, fetched and generated when `/books-config` is
 * first visited rather than at every page's startup. The config travels on the boot bundle
 * ({@link BooksConfigEngineBundle.config}) and through {@link getBootedBooksFilterConfig}, for the
 * page that renders it beside the panel it generates.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { type FilterEngineConfig, initializeBitmapAcceleration, loadConfig } from '@filter-enginez/core';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';

import { buildBooksEngine } from './buildBooksEngine.js';

/** Live boot progress — books load in one shot, so this reports the final count. */
export interface BooksConfigBootProgress {
	/** Records loaded so far. */
	readonly loaded: number;
	/** The tier the load landed on. */
	readonly source: 'default-tier';
	/** Expected total. */
	readonly total: number;
}

/** Boot result — the signals-wrapped, config-loaded engine plus boot metadata. */
export interface BooksConfigEngineBundle {
	/** The declarative config the engine was loaded from: the dataset's `booksFilterConfig`. */
	readonly config: FilterEngineConfig;
	readonly engine: SignalsEngine<Book>;
	readonly meta: {
		readonly bookCount: number;
		readonly bootMs: number;
		readonly mode: 'main-thread';
		readonly source: BooksConfigBootProgress['source'];
	};
}

// ─── Module-level pub/sub for boot progress (own store — see file remarks) ─────
type ProgressListener = (progress: BooksConfigBootProgress | null) => void;
let currentProgress: BooksConfigBootProgress | null = null;
const progressListeners = new Set<ProgressListener>();
let cachedBoot: Promise<BooksConfigEngineBundle> | null = null;
let bootedConfig: FilterEngineConfig | null = null;

/**
 * Subscribe to config-books boot progress. `useSyncExternalStore`-shaped. Returns an unsubscribe.
 */
export function subscribeBooksConfigBootProgress(listener: ProgressListener): () => void {
	progressListeners.add(listener);

	return () => {
		progressListeners.delete(listener);
	};
}

/** Read the current config-books boot progress synchronously. */
export function getBooksConfigBootProgressSnapshot(): BooksConfigBootProgress | null {
	return currentProgress;
}

/**
 * Read the declarative config the engine booted from, synchronously.
 *
 * @remarks
 * For the page shell, which renders only once {@link bootBooksConfigEngine} has resolved and shows
 * this config beside the panel generated from it. Reading it here rather than importing
 * `booksFilterConfig` keeps the dataset out of the page's static imports.
 *
 * @returns The config the engine was loaded from.
 * @throws Error when called before the boot has resolved — a page rendering ahead of its engine.
 */
export function getBootedBooksFilterConfig(): FilterEngineConfig {
	if (bootedConfig === null) {
		throw new Error('getBootedBooksFilterConfig() needs bootBooksConfigEngine() to have resolved first.');
	}

	return bootedConfig;
}

/**
 * Boot the config-driven books engine on the main thread. Idempotent — repeated calls return the
 * cached bundle. The engine is constructed rule-free, then `loadConfig` applies `booksFilterConfig`.
 */
export async function bootBooksConfigEngine(): Promise<BooksConfigEngineBundle> {
	cachedBoot ??= bootInternal();

	return cachedBoot;
}

async function bootInternal(): Promise<BooksConfigEngineBundle> {
	const t0 = performance.now();

	// The dataset chunk downloads while acceleration initializes; neither depends on the other.
	const [{ books: defaultBooks, booksFilterConfig }] = await Promise.all([
		import('@filter-enginez/mock-data/books'),
		initializeBitmapAcceleration(),
	]);

	// Build the rule-free engine, then load the declarative config onto its core BEFORE wrapping it in
	// the signals surface — so the wrapped engine boots already-configured (rules + groups from JSON).
	const core = buildBooksEngine(defaultBooks);

	loadConfig(core, booksFilterConfig);
	const engine = createSignalsEngine<Book>(core);

	bootedConfig = booksFilterConfig;
	currentProgress = { loaded: defaultBooks.length, source: 'default-tier', total: defaultBooks.length };

	for (const listener of progressListeners) {
		listener(currentProgress);
	}

	return {
		config: booksFilterConfig,
		engine,
		meta: { bookCount: defaultBooks.length, bootMs: performance.now() - t0, mode: 'main-thread', source: 'default-tier' },
	};
}
