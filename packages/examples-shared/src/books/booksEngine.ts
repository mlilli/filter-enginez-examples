/**
 * Books engine boot — the **signals-surface** wrapper.
 *
 * @remarks
 * Unlike wine (a 150k corpus built inside a Web Worker), the books vertical runs the ~10k
 * default tier directly on the main thread: fast to build, no worker to wire. The public API mirrors
 * `wineEngine` (`bootBooksEngine` + `subscribe`/`getSnapshot` progress + the `BooksEngineBundle`) so
 * the RTK dataset registry treats every dataset uniformly.
 *
 * The surface-neutral half — acceleration init, engine construction, and progress reporting — lives
 * in `./bootBooksCore.ts`. This module only adds the `reactive-signals` wrapper, so a consumer of the
 * RxJS surface can boot via `bootBooksCore()` without dragging `@preact/signals-core` into its graph.
 * Both share ONE cached core.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';

import { type BooksBootMeta, bootBooksCore } from './bootBooksCore.js';

/** Boot result — the signals-wrapped engine plus boot metadata. */
export interface BooksEngineBundle {
	readonly engine: SignalsEngine<Book>;
	readonly meta: BooksBootMeta;
}

/** Cached so repeated calls return the same signals wrapper over the same core. */
let cachedBoot: Promise<BooksEngineBundle> | null = null;

/**
 * Boot the books engine on the main thread, wrapped in the signals surface. Idempotent — repeated
 * calls return the cached bundle.
 */
export async function bootBooksEngine(): Promise<BooksEngineBundle> {
	cachedBoot ??= bootInternal();

	return cachedBoot;
}

/**
 * Wrap the shared bare core in the signals surface.
 *
 * @internal
 */
async function bootInternal(): Promise<BooksEngineBundle> {
	const { core, meta } = await bootBooksCore();

	return { engine: createSignalsEngine<Book>(core), meta };
}
