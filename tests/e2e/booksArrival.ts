/**
 * Each vertical's `/books` boot budget, and the engine tier its header names.
 *
 * @remarks
 * Several specs need exactly this table. `compare.spec.ts` uses it to carry a state from the comparison
 * page into every vertical's books route; `compare-button.spec.ts` uses it to arrive at that route from
 * an inbound link and press Compare; `app-header.spec.ts` uses it to reach each app's books header.
 * They are all asking one question — *how long may this vertical take to paint its books header, and
 * does that header name a tier?* — so they answer it from one table.
 *
 * Separate copies would have to agree to the millisecond by hand: a vertical whose boot slows down
 * would be retuned in one file and time out in another, and the failure would name the spec rather
 * than the cause.
 *
 * ### Why these facts are not in the registry
 *
 * They were considered for `verticals.ts` and deliberately left out. The **tier** is a property of a
 * ROUTE, not of a vertical — vanilla's `/books` says `signals` only because `/books-raw` sits beside
 * it saying `bare core`, and no other vertical has that neighbor to distinguish itself from. The
 * **budget** is a property of this suite's patience, not of the app: it is how long Playwright will
 * wait, which is a testing decision that has no business shaping what the apps publish about
 * themselves.
 *
 * ### The `Record<VerticalId, …>` is load-bearing
 *
 * Not a `Partial`, not an array. A seventh vertical joining the registry must fail to COMPILE here
 * rather than quietly go unexercised by a loop that iterates `VERTICALS` and finds no entry for it —
 * the one thing a data-driven spec can get wrong in silence.
 *
 * ### Why the import is relative
 *
 * Same reason `subtitles.ts` gives: `@filter-enginez/examples-shared` is not a root dependency, and
 * adding it would not help, because the package's `./verticals` export points at TypeScript source
 * and Playwright does not transform files under `node_modules`.
 *
 * @packageDocumentation
 */

export type { EngineTier, VerticalId } from '../../packages/examples-shared/src/verticals/verticals.js';

import type { EngineTier, VerticalId } from '../../packages/examples-shared/src/verticals/verticals.js';

/** How long one vertical's `/books` may take to paint, and what its subtitle claims. */
export interface BooksArrival {
	/** How long that vertical's main-thread books boot may take before the header paints. */
	readonly bootTimeoutMs: number;
	/** The tier suffix in `Dataset · Stack`, when the route names one. */
	readonly tier?: EngineTier;
}

/** One entry per vertical. Every budget is carried over from that vertical's own books spec. */
export const BOOKS_ARRIVAL: Readonly<Record<VerticalId, BooksArrival>> = {
	// `ng serve` boots the route through a resolver that pulls the corpus over HTTP before the
	// component exists, so first paint is later here than in the five Vite apps.
	angular: { bootTimeoutMs: 45_000 },
	'react-plain': { bootTimeoutMs: 30_000 },
	'react-rtk': { bootTimeoutMs: 30_000 },
	sveltekit: { bootTimeoutMs: 30_000 },
	// `vanilla-books.spec.ts` allows 60s for the same boot; matched rather than tightened.
	vanilla: { bootTimeoutMs: 60_000, tier: 'signals' },
	vue: { bootTimeoutMs: 30_000 },
};
