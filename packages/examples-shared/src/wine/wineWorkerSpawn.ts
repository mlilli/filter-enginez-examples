/**
 * The Vite-only half of the wine worker boot, quarantined into one module.
 *
 * @remarks
 * ## Why this file exists at all
 *
 * A `?worker` import at module scope in `wineEngine.ts` would make the whole `./wine-core` subpath
 * **impossible for Angular to import** — and not at runtime, where an unused code path costs nothing,
 * but at BUILD time: `@angular/build`'s esbuild resolves every static import it sees, and
 * `./wine.worker.ts?worker` resolves nowhere outside Vite. Making the import conditional would not help
 * for exactly that reason; it has to live in a different module.
 *
 * So the coupling lives here, alone, and `./wine-core` is bundler-neutral. A Vite vertical imports
 * this and hands `spawnWineWorker` to `bootWineEngine`; Angular imports its own equivalent and never
 * touches this file.
 *
 * ## The `?worker` form is required, and the inline-ness is the requirement
 *
 * Vite detects worker modules by static analysis **at the import site**. Moving the import behind an
 * indirection — a variable URL, a re-export, a `new URL(...)` computed elsewhere — defeats the
 * analysis, and Vite then serves the worker file as an ordinary ESM module with the HMR client
 * injected and no separate worker chunk. Comlink's handshake never completes and the boot hangs with
 * no error. `wrapInWorker`'s own options docblock says the same thing from the other side.
 *
 * That is why this module is three lines of code under thirty of comment: the three lines cannot be
 * moved anywhere more convenient without hanging the boot.
 *
 * @packageDocumentation
 */

import type { WorkerLike } from '@filter-enginez/worker-bridge';

import WineWorker from './wine.worker.ts?worker';

/**
 * Spawn the wine corpus worker, the Vite way.
 *
 * @remarks
 * Pass to `bootWineEngine({ spawnWorker: spawnWineWorker })` from any Vite-built vertical. It is a
 * FUNCTION rather than an instance because `bootWineEngine` only spawns on the worker tier — the
 * main-thread path must not construct a worker it will never message.
 *
 * @returns A freshly spawned worker.
 */
/* v8 ignore start -- `new WineWorker()` is the Vite `?worker` default export; there is no Worker
   constructor under jsdom, so this cannot run in a unit test. It is the entire body of the module,
   which is why the file reads as 0% rather than as a missing branch. Every Vite vertical's Playwright
   spec exercises it against a real worker. */
export function spawnWineWorker(): WorkerLike {
	return new WineWorker();
}
/* v8 ignore stop */
