/**
 * Content model for the "How the engine works" page (filterenginez.com/how-it-works) — the copy, the
 * code snippets, and the id of the illustration bound to each algorithm band. Framework-free data with
 * no imports beyond a type, so the landing site's build can render every word of it into static HTML
 * and its browser script can mount a figure per band by id.
 *
 * @remarks
 * Ordered as escalating cleverness — how a filter *runs* (bitmaps), how it *avoids running* (exclusion
 * graph), how it *remembers* (memoized simulation), how it *specializes* (R-tree) — then a second act
 * of capabilities built on the same structures (suggestions, similarity, membership, text). Code
 * snippets use only real public API so a curious reader can paste them and have them mean something.
 *
 * @packageDocumentation
 */

import type { VerticalId } from '../verticals/verticals.js';

/**
 * Which act a band belongs to: `core` = the four acceleration layers (the speed story); `beyond` =
 * capabilities built on the same structures (suggestions, similarity, membership, text).
 */
export type HowItWorksAct = 'beyond' | 'core';

/** One algorithm band on the page. */
export interface HowItWorksSection {
	/** Prose body — engineer voice, ~110 words. */
	readonly body: string;
	/** A short real-API code snippet (rendered in a mono block). */
	readonly code: string;
	/** Small mono eyebrow, e.g. `01 · intersection`. */
	readonly eyebrow: string;
	/** Which act this band belongs to. */
	readonly group: HowItWorksAct;
	/** Anchor id + mini-TOC target — ALSO the key the page's figure registry maps to a figure builder. */
	readonly id: string;
	/** Section heading. */
	readonly title: string;
	/** Short label for the sticky mini table of contents. */
	readonly tocLabel: string;
}

/** The eight algorithm bands, in narrative order (four `core`, then four `beyond`). */
export const HOW_IT_WORKS_SECTIONS: readonly HowItWorksSection[] = [
	{
		body: 'Every active rule becomes one compressed Roaring bitmap — a bit per item, set where the item matches. Combining filters is then a single bitwise AND across those bitmaps rather than a walk over the dataset. Roaring stores long runs as compact containers, so the bitmaps stay small and the AND stays sub-millisecond even as the corpus grows into the millions. This is the floor the rest of the stack builds on: once intersection is a bitmap operation, everything downstream — simulating a filter, checking whether two rules can coexist — becomes cheap.',
		code: "createFilterEngine({ acceleration: { bitmap: 'on' } })\n// one compressed bitmap per active rule; the result\n// set is a single bitwise AND across them",
		eyebrow: '01 · intersection',
		group: 'core',
		id: 'roaring',
		title: 'Roaring bitmaps',
		tocLabel: 'Bitmaps',
	},
	{
		body: 'Some filter combinations can only ever return nothing — a red wine that is also a white, a sub-$15 bottle that is also a reserve. The engine precomputes which pairs of rule-options share zero items and stores that as a graph. Before it does any real work, it consults the graph: if selecting an option would empty the result set, that option is disabled without a bitmap pass or a scan. It is the cheapest layer because its best case is doing nothing at all — the shortest computation is the one you prove you can skip.',
		code: "createFilterEngine({ acceleration: { exclusionGraph: 'lazy' } })\n// precomputed zero-overlap pairs let the engine skip\n// combinations that can only return nothing",
		eyebrow: '02 · short-circuit',
		group: 'core',
		id: 'exclusion',
		title: 'Mutual-exclusion graph',
		tocLabel: 'Exclusion',
	},
	{
		body: 'A responsive filter panel asks a lot of what-if questions: for every option in every facet, "if I added this, how many results would remain?" Answering each one naively is a full pass. The engine routes those through simulate(), memoizing every answer in an LRU cache keyed by the hypothetical rule plus the current state. Ask the same what-if twice — which a re-render does constantly — and the second answer is a map lookup. The cache invalidates precisely when the data or the active rules change, so it is always correct and almost always warm.',
		// `price`, not `vintage`. The snippet is about the simulation cache, but it is real code on a
		// page next to a running wine panel — and vintage is declared an `InSetRule`, so a `range()` under
		// that id would demonstrate a rule type the app never commits for that facet.
		code: "const { resultCount } = engine.simulate({\n  withRule: ['price', range('priceUsd', { min: 60 })],\n})\n// identical what-ifs return from the LRU cache",
		eyebrow: '03 · memoization',
		group: 'core',
		id: 'memoization',
		title: 'Memoized simulation',
		tocLabel: 'Memoization',
	},
	{
		body: 'Geographic filters — "listings within five miles" — are the one place a linear scan really hurts, because every candidate needs a haversine distance. The engine indexes coordinates in an R-tree: a hierarchy of bounding boxes. A radius query walks the tree and prunes whole branches whose box cannot possibly intersect the search circle, discarding most of the map before computing a single exact distance. Only the handful of points in surviving boxes get the haversine refinement. It is the same instinct as the exclusion graph — throw away what cannot match — applied to space instead of set logic.',
		code: "createFilterEngine({ acceleration: { spatialIndex: 'auto' } })\n// GeoProximityRule → R-tree bbox prune first,\n// exact haversine only on the survivors",
		eyebrow: '04 · spatial',
		group: 'core',
		id: 'rtree',
		title: 'R-tree spatial index',
		tocLabel: 'R-tree',
	},
	{
		body: 'Beyond filtering, the engine learns from recorded filter sessions which filter-options tend to be selected together and builds a Bayesian co-occurrence model. Ask it for suggestions given the current selection and it ranks the options most likely to come next — narrowing to Napa and Cabernet surfaces "90+ points" and "oak" ahead of the long tail. It is the same bitmap substrate reused for a different question: instead of "which items match?", it answers "which filter would a user reach for next?", in microseconds, from aggregate counts rather than a scan.',
		code: "import { attachSuggestions } from '@filter-enginez/core/suggestions'\nconst picks = attachSuggestions(engine).suggestions.getSuggestions(activeRuleIds, 3)\n// Bayesian co-occurrence ranks the filters most\n// likely to pair with the current selection",
		eyebrow: '05 · suggestions',
		group: 'beyond',
		id: 'bayesian',
		title: 'Bayesian suggestions',
		tocLabel: 'Bayesian',
	},
	{
		body: 'Finding items similar to a given one is naively an all-pairs comparison. Instead the engine reduces each item to a compact MinHash signature — a fingerprint that preserves set similarity — and uses locality-sensitive hashing to bucket items whose signatures agree. "Find similar" becomes a lookup in the query item\'s bucket plus a cheap refinement, not a sweep over the corpus. The index builds lazily on the first call and invalidates in O(1) when the data version changes, so nearest-neighbors stays sub-millisecond even as the dataset grows.',
		code: "import { attachSimilarity } from '@filter-enginez/core/similarity'\nconst nearest = attachSimilarity(engine, config).findSimilar(wine)\n// MinHash signatures + LSH banding turn \"find similar\"\n// into a bucket lookup, not an all-pairs scan",
		eyebrow: '06 · similarity',
		group: 'beyond',
		id: 'similarity',
		title: 'MinHash + LSH similarity',
		tocLabel: 'Similarity',
	},
	{
		body: 'A Bloom filter answers set membership with a tiny bit-array and a few hash functions: it can say “definitely not” or “probably yes”, never producing a false negative. The engine ships it as a serializable BloomMembershipRule — a cheap pre-screen that rejects the vast majority of non-members in a handful of bit checks before any exact comparison runs. Pair it with an exact check where a false positive would be incorrect; use it alone where an approximate membership gate is all you need. It is the cheapest “is this even a candidate?” the engine can ask.',
		code: "const picks = new BloomFilter(/* built from editor's-pick ids */)\nengine.addRule('picks', bloomMembership('id', picks))\n// k bit probes: definitely-not, or probably-yes",
		eyebrow: '07 · membership',
		group: 'beyond',
		id: 'bloom',
		title: 'Bloom membership',
		tocLabel: 'Bloom',
	},
	{
		body: 'Whole-word and phrase search over text would otherwise scan every string. The engine keeps an inverted index — each word points to the posting list of documents that contain it — so an allWords query becomes an intersection of posting lists, resolved straight from the index. Character-trigram postings extend the same idea to fuzzy search, pruning the candidate set before the exact match confirms. On 10k reviews it turns a multi-word search from a few milliseconds of substring scanning into hundredths of a millisecond — the inverted index composing cleanly with the same Roaring bitmaps the rest of the stack uses.',
		code: "new TextSearchRule('notes', { query: 'buttery oak', mode: 'allWords' })\n// createFilterEngine({ acceleration: { textIndex: 'auto' } })\n// whole-word AND resolved from posting lists",
		eyebrow: '08 · text',
		group: 'beyond',
		id: 'textindex',
		title: 'Inverted text index',
		tocLabel: 'Text index',
	},
];

/**
 * The act-two divider the page renders before the first `beyond` band.
 *
 * @remarks
 * Content like the bands, so the static render at build time and any other reader word it once.
 */
export const HOW_IT_WORKS_ACT_TWO = {
	eyebrow: 'act two',
	lead: 'The same bitmaps, signatures, and counts power more than intersection — suggestions, similarity, probabilistic membership, and text search.',
	title: 'Beyond filtering',
} as const;

/**
 * The plain-React app's lab route.
 *
 * @remarks
 * Declared here, beside the links that point at it, so the app's router, its landing page and the
 * how-it-works page all read one string: a `/lab` that became `/laboratory` in one of three places
 * would be a 404 nobody could reproduce from the page that links to it.
 */
export const LAB_ROUTE_PATH = '/lab';

/** The one vertical that serves {@link LAB_ROUTE_PATH}. */
export const LAB_VERTICAL_ID: VerticalId = 'react-plain';

/** A band's link to a running demonstration of its capability. */
export interface HowItWorksDemoLink {
	/** The link text, naming what the visitor will see rather than repeating the band title. */
	readonly label: string;
	/** The route on {@link HowItWorksDemoLink.verticalId}'s origin, e.g. `/lab`. */
	readonly path: string;
	/** The vertical that serves {@link HowItWorksDemoLink.path}; its origin resolves per deployment layout. */
	readonly verticalId: VerticalId;
}

/**
 * Which bands link to a running demonstration, keyed by {@link HowItWorksSection.id}.
 *
 * @remarks
 * Exactly the three capabilities the plain-React app's `/lab` runs — `memoization` is its projections
 * pane, `similarity` its neighbor pane, `bayesian` its suggestion pane. Deliberately NOT the other five
 * bands: `roaring`, `exclusion`, `rtree`, `bloom` and `textindex` are acceleration internals with no
 * pane, and linking them would claim a running demonstration that does not exist.
 *
 * Each link names its vertical rather than an absolute URL, because the page lives on another origin
 * than the lab: the page resolves the vertical's origin from its own location, so a developer reaches
 * the local dev server and a visitor the deployed app.
 */
export const HOW_IT_WORKS_DEMO_LINKS: Readonly<Partial<Record<string, HowItWorksDemoLink>>> = {
	bayesian: { label: 'See it suggesting, on the books corpus', path: LAB_ROUTE_PATH, verticalId: LAB_VERTICAL_ID },
	memoization: { label: 'See it projecting, on the books corpus', path: LAB_ROUTE_PATH, verticalId: LAB_VERTICAL_ID },
	similarity: { label: 'See it finding neighbors, on the books corpus', path: LAB_ROUTE_PATH, verticalId: LAB_VERTICAL_ID },
};
