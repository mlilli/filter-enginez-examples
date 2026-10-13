/**
 * The algorithm catalog as documentation data — the acceleration stack + the "beyond filtering"
 * capabilities. Each entry drives one `/docs/algorithms/:id` page and REUSES the animated
 * illustration already built for the `/about` page (`about/illustrations`), so there is one source of
 * truth for each figure.
 *
 * @packageDocumentation
 */

import {
	BayesianSuggestFigure,
	BloomFilterFigure,
	ExclusionGraphFigure,
	MemoizedSimulationFigure,
	RoaringBitmapsFigure,
	RTreeFigure,
	SimilarityFigure,
	TextIndexFigure,
} from '../../about/illustrations/index.js';
import { type AlgorithmDoc } from './types.js';

/** Every documented algorithm, in sidebar order (the four acceleration layers, then "beyond"). */
export const ALGORITHM_DOCS: readonly AlgorithmDoc[] = [
	{
		advanced:
			'Every active rule becomes one compressed Roaring bitmap — a bit per item, set where the item matches. Combining filters is a single bitwise AND across those bitmaps rather than a per-item walk. Roaring stores long runs as compact containers, so the bitmaps stay small and the AND stays sub-millisecond into the millions of rows. This is the floor the rest of the stack builds on: once intersection is a bitmap op, simulating a filter or checking rule compatibility becomes cheap.',
		Figure: RoaringBitmapsFigure,
		id: 'roaring-bitmaps',
		name: 'Roaring bitmaps',
		simple: 'One compressed bitmap per rule; combining filters is a single bitwise AND.',
		speedup: '≈40× vs a predicate scan at 10k',
		tagline: 'compressed-bitmap intersection',
	},
	{
		advanced:
			'The engine precomputes which pairs of rule-options share zero items and stores that as a graph. Before doing real work it consults the graph: if selecting an option would empty the result set, that option is disabled without a bitmap pass or a scan. It is the cheapest layer because its best case is doing nothing — the shortest computation is the one you prove you can skip. Lazy by default (`exclusionGraph: "lazy"`); `"eager"` keeps it warm off the interaction hot path.',
		Figure: ExclusionGraphFigure,
		id: 'mutual-exclusion-graph',
		name: 'Mutual-exclusion graph',
		simple: 'Precomputed zero-overlap pairs let the engine skip combinations that can only return nothing.',
		speedup: 'skips impossible combos without a bitmap pass',
		tagline: 'impossible-combination short-circuit',
	},
	{
		advanced:
			'A responsive filter panel asks a lot of what-if questions — for every option, "if I added this, how many results remain?". The engine routes those through `simulate()`, memoizing every answer in an LRU cache keyed by the hypothetical rule plus the current state. Ask the same what-if twice (which re-renders do constantly) and the second answer is a map lookup. The cache invalidates precisely when the data or active rules change, so it is always correct and almost always warm.',
		Figure: MemoizedSimulationFigure,
		id: 'memoized-simulation',
		name: 'Memoized simulation',
		simple: 'Every "what if I added this filter?" answer is memoized in an LRU cache.',
		speedup: '≈350× on the disable-empty-options sweep at 10k',
		tagline: 'LRU-cached predictive counts',
	},
	{
		advanced:
			'Geographic filters are the one place a linear scan really hurts, because every candidate needs a haversine distance. The engine indexes coordinates in an R-tree — a hierarchy of bounding boxes. A radius query walks the tree and prunes whole branches whose box cannot intersect the search circle, discarding most of the map before computing a single exact distance; only the survivors get the haversine refinement. Same instinct as the exclusion graph — throw away what cannot match — applied to space.',
		Figure: RTreeFigure,
		id: 'r-tree',
		name: 'R-tree spatial index',
		simple: 'A bounding-box tree prunes whole regions before any exact distance is computed.',
		speedup: '≈165× on geo-radius queries at 10k',
		tagline: 'spatial bounding-box prune',
	},
	{
		advanced:
			'Beyond filtering, the engine learns from recorded filter sessions which filter-options tend to be chosen together and builds a Bayesian co-occurrence model. Ask `attachSuggestions(engine).suggestions.getSuggestions(activeRuleIds, k)` and it ranks the options most likely to come next — the same bitmap substrate reused for a different question ("which filter next?" instead of "which items match?"), answered in microseconds from aggregate counts rather than a scan. The attach step is the opt-in, exactly as it is for similarity: `suggestions/` ships from `@filter-enginez/core/suggestions` rather than the root barrel, so a consumer who never asks this question never pays the 657 B. It also hands back the session tracker and the model as one memoized bag, because a caller recording sessions and a caller reading suggestions have to share one tracker or the reader trains on nothing.',
		Figure: BayesianSuggestFigure,
		id: 'bayesian-suggestions',
		name: 'Bayesian suggestions',
		simple: 'A co-occurrence model ranks the filters most likely to be selected next.',
		speedup: 'suggestions in ~0.002 ms',
		tagline: 'co-occurrence filter suggestions',
	},
	{
		advanced:
			'Finding items similar to a given one is naively an all-pairs comparison. Instead the engine reduces each item to a compact MinHash signature — a fingerprint that preserves set similarity — and uses locality-sensitive hashing (LSH) to bucket items whose signatures agree. `attachSimilarity(engine, config).findSimilar(item)` becomes a lookup in the query\'s bucket plus a cheap refinement. The index builds lazily and invalidates in O(1) on a data-version change. The attach step is the opt-in: `similarity/` ships from `@filter-enginez/core/similarity` rather than the root barrel, so a consumer who never asks this question never pays the 1.65 kB.',
		Figure: SimilarityFigure,
		id: 'minhash-lsh',
		name: 'MinHash + LSH similarity',
		simple: 'MinHash signatures + LSH bucketing turn "find similar" into a bucket lookup.',
		speedup: 'nearest-neighbors in ~0.007 ms',
		tagline: 'signature-bucketed similarity',
	},
	{
		advanced:
			'A Bloom filter answers set membership with a tiny bit-array and a few hash functions: "definitely not" or "probably yes", never a false negative. The engine ships it as the serializable `BloomMembershipRule` — a cheap pre-screen that rejects the vast majority of non-members in a handful of bit checks before any exact comparison. Pair it with an exact check where a false positive would be wrong; use it alone where an approximate gate suffices.',
		Figure: BloomFilterFigure,
		id: 'bloom-filter',
		name: 'Bloom membership',
		simple: 'A bit-array + k hashes: "definitely not" or "probably yes", in a handful of bit checks.',
		speedup: 'membership in a few bit probes',
		tagline: 'probabilistic membership pre-screen',
	},
	{
		advanced:
			'Whole-word and phrase search would otherwise scan every string. The engine keeps an inverted index — each word points to the posting list of documents containing it — so an `allWords` query becomes an intersection of posting lists resolved straight from the index. Character-trigram postings extend the same idea to fuzzy search, pruning candidates before the exact confirm. It composes cleanly with the same Roaring bitmaps the rest of the stack uses.',
		Figure: TextIndexFigure,
		id: 'inverted-text-index',
		name: 'Inverted text index',
		simple: 'A word→postings index turns whole-word search into a posting-list intersection.',
		speedup: '≈340× on whole-word search at 10k',
		tagline: 'word + trigram postings',
	},
];

/** Look up an algorithm doc by its route id. */
export function findAlgorithmDoc(id: string | undefined): AlgorithmDoc | undefined {
	return ALGORITHM_DOCS.find((algorithm) => algorithm.id === id);
}
