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
 * @packageDocumentation
 */

import { initializeBitmapAcceleration, loadConfig } from '@filter-enginez/core';
import { type Book, booksFilterConfig, books as defaultBooks } from '@filter-enginez/mock-data/books';
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
 * Boot the config-driven books engine on the main thread. Idempotent — repeated calls return the
 * cached bundle. The engine is constructed rule-free, then `loadConfig` applies `booksFilterConfig`.
 */
export async function bootBooksConfigEngine(): Promise<BooksConfigEngineBundle> {
	cachedBoot ??= bootInternal();

	return cachedBoot;
}

async function bootInternal(): Promise<BooksConfigEngineBundle> {
	const t0 = performance.now();

	await initializeBitmapAcceleration();

	// Build the rule-free engine, then load the declarative config onto its core BEFORE wrapping it in
	// the signals surface — so the wrapped engine boots already-configured (rules + groups from JSON).
	const core = buildBooksEngine(defaultBooks);

	loadConfig(core, booksFilterConfig);
	const engine = createSignalsEngine<Book>(core);

	currentProgress = { loaded: defaultBooks.length, source: 'default-tier', total: defaultBooks.length };

	for (const listener of progressListeners) {
		listener(currentProgress);
	}

	return {
		engine,
		meta: { bookCount: defaultBooks.length, bootMs: performance.now() - t0, mode: 'main-thread', source: 'default-tier' },
	};
}
