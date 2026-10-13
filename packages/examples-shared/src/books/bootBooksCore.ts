/**
 * Books engine boot — the **reactive-surface-neutral** half.
 *
 * @remarks
 * This module boots the books engine down to a bare `FilterEngine<Book>`: it initializes bitmap
 * acceleration, builds the engine over the default tier, and reports boot progress. It has
 * NO reactive-surface dependency — deliberately kept in its own module (rather than living beside
 * `bootBooksEngine`) so a consumer of the RxJS surface never pulls `@preact/signals-core` into its
 * graph just to boot.
 *
 * `bootBooksEngine` (in `./booksEngine.ts`) builds on this and wraps the result in
 * `createSignalsEngine`; an Angular / RxJS consumer instead does:
 *
 * ```ts
 * const { core } = await bootBooksCore();
 * const engine = createRxJsEngine(core);
 * ```
 *
 * Both paths share ONE cached core, so acceleration is initialized once and the corpus is built once
 * no matter which surfaces are in play.
 *
 * @packageDocumentation
 */

import { type FilterEngine, initializeBitmapAcceleration } from '@filter-enginez/core';
import { type Book } from '@filter-enginez/mock-data/books';

import { loadDefaultTierCorpus } from '../data/loadDefaultTierCorpus.js';
import { buildBooksEngine } from './buildBooksEngine.js';

/** Live boot progress — books load in one shot, so this reports the final count. */
export interface BooksBootProgress {
	/** Records loaded so far. */
	readonly loaded: number;
	/** The tier the load landed on. */
	readonly source: 'default-tier';
	/** Expected total. */
	readonly total: number;
}

/** Boot metadata, shared by every surface's bundle. */
export interface BooksBootMeta {
	readonly bookCount: number;
	readonly bootMs: number;
	readonly mode: 'main-thread';
	readonly source: BooksBootProgress['source'];
}

/** The surface-neutral boot result: the bare engine plus boot metadata. */
export interface BooksCoreBundle {
	/** The bare engine — wrap it in whichever reactive surface you want, or use it directly. */
	readonly core: FilterEngine<Book>;
	readonly meta: BooksBootMeta;
}

// ─── Module-level pub/sub for boot progress (mirrors wineEngine) ──────────
type ProgressListener = (progress: BooksBootProgress | null) => void;
let currentProgress: BooksBootProgress | null = null;
const progressListeners = new Set<ProgressListener>();
let cachedCoreBoot: Promise<BooksCoreBundle> | null = null;

/**
 * Subscribe to books boot progress. `useSyncExternalStore`-shaped (subscribe + snapshot). Returns
 * an unsubscribe.
 */
export function subscribeBooksBootProgress(listener: ProgressListener): () => void {
	progressListeners.add(listener);

	return () => {
		progressListeners.delete(listener);
	};
}

/** Read the current books boot progress synchronously. Pairs with {@link subscribeBooksBootProgress}. */
export function getBooksBootProgressSnapshot(): BooksBootProgress | null {
	return currentProgress;
}

/**
 * Boot the books engine to a bare `FilterEngine`. Idempotent — repeated calls return the cached
 * bundle, so acceleration initializes once and the corpus builds once.
 *
 * @returns The bare engine + boot metadata.
 */
export async function bootBooksCore(): Promise<BooksCoreBundle> {
	cachedCoreBoot ??= bootCoreInternal();

	return cachedCoreBoot;
}

/**
 * The boot: initialize acceleration, STREAM the default tier over `/api/books` (MSW in dev, a real
 * backend in prod) with a bundled fallback, build the engine, publish progress.
 *
 * @remarks
 * The corpus is streamed via {@link loadDefaultTierCorpus} rather than statically imported, so the ~10k
 * default tier stays out of the main-thread bundle — it arrives over the wire, page by page,
 * reporting progress as it goes. Where the endpoint is unavailable (a production build with no API, or
 * a vertical that has not started MSW), the bundled corpus is DYNAMICALLY imported as a fallback, so it
 * still code-splits out of the streamed path. On that fallback path a single final progress ping fires.
 *
 * @internal
 */
async function bootCoreInternal(): Promise<BooksCoreBundle> {
	const t0 = performance.now();

	await initializeBitmapAcceleration();

	const { records } = await loadDefaultTierCorpus<Book>(
		'books',
		async () => (await import('@filter-enginez/mock-data/books')).books,
		{
			onProgress: ({ loaded, total }) => {
				currentProgress = { loaded, source: 'default-tier', total };
				for (const listener of progressListeners) {
					listener(currentProgress);
				}
			},
		},
	);

	const core = buildBooksEngine(records);

	return {
		core,
		meta: {
			bookCount: records.length,
			bootMs: performance.now() - t0,
			mode: 'main-thread',
			source: 'default-tier',
		},
	};
}
