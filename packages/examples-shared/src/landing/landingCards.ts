/**
 * `@filter-enginez/examples-shared/landing` — the landing hub's dataset cards, DERIVED from the
 * vertical registry rather than hand-listed per app.
 *
 * @remarks
 * ## Why the roster is derived
 *
 * SvelteKit, Vue, Angular and vanilla render the same landing hub. A hand-kept roster per app can
 * leave a route that works perfectly when typed with no card on its landing page — reachable, and
 * invisible — and no gate notices a card that was never written.
 *
 * So the cards are **derived from `vertical(id).routes`**, the repo's single statement of what each
 * app serves, which the comparison page reads too. A route a vertical serves cannot fail to appear on
 * its landing page, because the landing page reads the same list the comparison page does. Every card
 * is therefore a link to a working route.
 *
 * ## A route with no catalog entry THROWS
 *
 * {@link landingCards} does not skip what it does not recognize; skipping would hide a new route
 * quietly, at runtime, on a page nobody re-reads. A new dataset route must be given its copy here or
 * be named in {@link NON_DATASET_ROUTES}, and until then the app fails loudly at boot on a
 * developer's machine.
 *
 * ## What this deliberately does NOT own
 *
 * The two React apps keep `src/datasets.tsx`. That is a route registry carrying a boot function, a
 * progress store and a `Component` per dataset, and its landing metadata is a small part of a much
 * larger object. Folding it in would mean moving React component references into a package four
 * non-React verticals import.
 *
 * @packageDocumentation
 */

import { vertical, type VerticalId } from '../verticals/verticals.js';

/** One dataset tile on the landing hub. Every card links to a route its vertical serves. */
export interface DatasetCard {
	/** One-line description shown on the card. */
	readonly blurb: string;
	/** Route the card links to. */
	readonly href: string;
	/** Stable key. */
	readonly id: string;
	/** Display name. */
	readonly label: string;
	/** Plural record noun for the CTA ("Explore books"). */
	readonly recordNoun: string;
}

/**
 * Routes that are not datasets, and so are not landing cards.
 *
 * @remarks
 * Named explicitly rather than inferred, so that {@link landingCards} can treat *anything else* it
 * does not recognize as an error. An allowlist of what to ignore fails loudly on a new dataset; a
 * denylist of what to include fails silently.
 */
const NON_DATASET_ROUTES: ReadonlySet<string> = new Set(['/docs']);

/**
 * Every dataset route any vertical serves, in the order the hub presents them.
 *
 * @remarks
 * Catalog order, not per-vertical route order: the six hubs should introduce the datasets the same
 * way, so a visitor moving between verticals sees one page in six stacks rather than six pages.
 * Books first (the smallest and most familiar), the books variants beside it because each exists to
 * contrast with it, then wine, then real estate — the widest panel, and the one that needs the most
 * explaining.
 */
const DATASET_ROUTES: readonly DatasetCard[] = [
	{
		blurb:
			'About 10k Open Library titles — genre, format and language facets, publication-year and rating ranges, and fuzzy author search.',
		href: '/books',
		id: 'books',
		label: 'Books',
		recordNoun: 'books',
	},
	{
		// Phrased for every vertical that serves this route. React RTK, React plain and Angular reach
		// `examples-server` over a same-origin `/api` (`createHttpFilterEngine`; a dev-server proxy
		// locally, the app's own Worker when deployed) as client-rendered SPAs; only SvelteKit runs the
		// core in its own server tier and ships the zero-JavaScript `BooksServerFallback`. A property
		// only one stack has belongs in that stack's own copy, not in a catalog every stack shares.
		blurb:
			'The exact same books app, but the browser never filters — every mutation round-trips to a server running the isomorphic engine.',
		href: '/books-server',
		id: 'books-server',
		label: 'Books · server-filtered',
		recordNoun: 'books',
	},
	{
		blurb:
			'The same corpus again, but the entire filter panel is generated from a JSON config the engine loads — the filter UI as a function of the data.',
		href: '/books-config',
		id: 'books-config',
		label: 'Books · JSON config',
		recordNoun: 'books',
	},
	{
		blurb:
			'The exact same books UI driven by @filter-enginez/core alone — one coarse subscribe, re-read and repaint. No reactive-surface package at all.',
		href: '/books-raw',
		id: 'books-raw',
		label: 'Books · bare core',
		recordNoun: 'books',
	},
	{
		// The worker sentence holds for every card this catalog produces: all six apps boot the full
		// wine tier on a worker.
		blurb:
			'About 130k Kaggle wine reviews — a cascading origin hierarchy, points, price and ABV ranges, and typo-tolerant tasting-note search. The worker-backed tier: every filter is a Comlink round trip.',
		href: '/wine',
		id: 'wine',
		label: 'Wine reviews',
		recordNoun: 'bottles',
	},
	{
		// Phrased for every vertical that serves this route, as `/books-server` above is: SvelteKit
		// filters in its own server tier, vanilla over HTTP with no SSR.
		//
		// **The committed-corpus clause is load-bearing:** `examples-server` filters the 10k tier while
		// `/wine` boots 130k, so a visitor comparing result counts between the two cards needs it to
		// know why they differ.
		blurb:
			'The exact same wine app, but the browser never filters — every mutation round-trips to a server running the isomorphic engine over the committed corpus.',
		href: '/wine-server',
		id: 'wine-server',
		label: 'Wine · server-filtered',
		recordNoun: 'bottles',
	},
	{
		blurb:
			'Property listings — geo-radius search, price, beds and baths ranges, a metro to neighborhood hierarchy, and must-have features.',
		href: '/real-estate',
		id: 'real-estate',
		label: 'Real estate',
		recordNoun: 'listings',
	},
];

/** Lookup by route. @internal */
const BY_HREF = new Map(DATASET_ROUTES.map((entry) => [entry.href, entry]));

/**
 * The landing cards for one vertical, in catalog order.
 *
 * @param id - Which vertical.
 * @returns Its dataset cards — one per dataset route the registry says it serves.
 * @throws If the vertical serves a route this module has neither copy for nor listed as a
 * non-dataset route, so a new route can never be omitted silently.
 */
export function landingCards(id: VerticalId): readonly DatasetCard[] {
	const { routes } = vertical(id);
	const served = new Set(routes);
	const unknown = routes.filter((route) => !BY_HREF.has(route) && !NON_DATASET_ROUTES.has(route));

	if (unknown.length > 0) {
		throw new Error(
			`Vertical '${id}' serves routes with no landing copy: ${unknown.join(', ')}. `
				+ 'Add them to DATASET_ROUTES, or to NON_DATASET_ROUTES if they are not datasets.',
		);
	}

	return DATASET_ROUTES.filter((entry) => served.has(entry.href));
}
