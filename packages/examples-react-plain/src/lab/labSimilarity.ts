/**
 * The similarity configuration `/lab`'s neighbor pane runs on, and the pure display decisions that
 * go with it.
 *
 * @remarks
 * React-free by design, so every decision here is unit-testable without a renderer — the same split
 * `labCandidates.ts` makes, and the one `/lab` needs since everything under `src/lab/` is measured.
 *
 * ### 🔴 `bandSize` is a MEASURED value, not a default left alone
 *
 * `SimilarityConfig`'s `bandSize` defaults to `8`, and its own docblock says that default is
 * "calibrated for threshold ≥ 0.7". Over the real 10,000-book corpus that default leaves **27% of
 * anchors with no neighbors at all** — and the reason it cannot be fixed by relaxing the threshold
 * is the part worth carrying: LSH banding decides which items are even CANDIDATES, and the
 * threshold only filters the candidates it produced. Dropping the threshold from 0.5 to 0.1 moved
 * the empty count 54 → 51 out of 200 anchors. Nothing else moved either, because there was nothing
 * in the bucket.
 *
 * Measured over the committed 10k corpus, 200 anchors sampled:
 *
 * | `bandSize` | bands | index build | per query | empty @0.5 | empty @0.3 | median top-1 |
 * | ---------- | ----- | ----------- | --------- | ---------- | ---------- | ------------ |
 * | 8 (default)| 16    | 119 ms      | 0.02 ms   | 54/200     | 52/200     | 0.711        |
 * | **4**      | 32    | 178 ms      | 0.24 ms   | **10/200** | **0/200**  | 0.680        |
 * | 2          | 64    | 239 ms      | 1.33 ms   | 9/200      | 0/200      | 0.680        |
 * | 1          | 128   | 354 ms      | 4.87 ms   | 9/200      | 0/200      | 0.680        |
 *
 * `bandSize: 4` is the knee: empties reach zero at threshold 0.3, and halving again buys one anchor
 * while costing 5x the query. **The failure this avoids is a blank pane with a clean console** —
 * `findSimilar` returns `[]` rather than throwing, so a default-configured pane would look finished
 * and be silently empty for a quarter of the books somebody clicks.
 *
 * ⚠ **The config is applied by whichever `useSimilar` call attaches FIRST.** `similarityFor`
 * memoizes one `SimilaritySearch` per engine in a `WeakMap` and ignores the `config` argument on
 * every later call, so a second pane passing a different config would silently get this one. That is
 * fine while this is the only caller and is asserted rather than assumed — see `labSimilarity.test.ts`.
 *
 * @packageDocumentation
 */

import type { SimilarityConfig, SimilarityQuery } from '@filter-enginez/core/similarity';
import type { Book } from '@filter-enginez/mock-data/books';

/**
 * The item fields the MinHash signature is built from.
 *
 * @remarks
 * `subjects` and `authors` are arrays, and the engine's feature extraction fans an array out into
 * one token per element — which is what carries the signal here. The three scalars
 * (`genre` / `format` / `language`) contribute one token each and mostly serve to keep books of
 * wholly different kinds out of each other's buckets.
 *
 * Exported because {@link describeSharedSubjects} and the pane's own caption both need to name what
 * "similar" was computed OVER; a reader who cannot see the basis cannot judge the result.
 */
export const SIMILARITY_ATTRIBUTES: readonly string[] = ['subjects', 'authors', 'genre', 'format', 'language'];

/**
 * The similarity configuration the lab attaches with. See the module docblock for the measurement
 * behind `bandSize`.
 */
export const SIMILARITY_CONFIG: SimilarityConfig<Book> = {
	attributes: SIMILARITY_ATTRIBUTES,
	bandSize: 4,
};

/**
 * The per-call query the pane issues.
 *
 * @remarks
 * `threshold` overrides the config default of 0.5 for the reason in the module docblock: at
 * `bandSize: 4` the 0.3 column is the one with no empty anchors, and a neighbor at 0.35 estimated
 * Jaccard is a real neighbor rather than noise — the median top-1 over the corpus is 0.680, so 0.3
 * sits well below the mass of genuine matches rather than dredging for them.
 */
export const SIMILARITY_QUERY: SimilarityQuery = { k: 5, threshold: 0.3 };

/**
 * Choose the anchor the neighbor search runs from.
 *
 * @remarks
 * The anchor comes from the visitor's CURRENT filtered results rather than from the whole corpus,
 * so the pane composes with whatever filtering they arrived with instead of sitting beside it. That
 * makes the empty case real rather than defensive: a narrow filter can leave zero results, and then
 * there is honestly nothing to be similar to. It gets a branch, not a `v8 ignore`.
 *
 * `preferredId` survives a result-set change when the chosen book is still in it, and falls back to
 * the first result when it is not — so tightening a filter re-anchors rather than blanking the pane.
 *
 * @param results - The engine's current filtered results.
 * @param preferredId - The id of the book the visitor picked, if any.
 * @returns The anchor book, or `undefined` when there are no results to anchor on.
 */
export function pickAnchor(results: readonly Book[], preferredId: string | undefined): Book | undefined {
	if (preferredId !== undefined) {
		const preferred = results.find((book) => book.id === preferredId);

		if (preferred !== undefined) {
			return preferred;
		}
	}

	return results[0];
}

/**
 * Format an estimated Jaccard similarity for display.
 *
 * @remarks
 * Rendered with a `≈` because the number IS an estimate — MinHash approximates Jaccard by comparing
 * signature positions, so a bare `68%` would claim a precision the algorithm does not offer. The
 * whole point of the pane is that the estimate is cheap; overstating it would misrepresent the
 * trade the engine is making.
 *
 * @param similarity - Approximate Jaccard similarity in `[0, 1]`.
 * @returns A short display string, e.g. `≈68%`.
 */
export function formatAffinity(similarity: number): string {
	return `≈${Math.round(similarity * 100).toString()}%`;
}

/**
 * The subject tags an anchor and a neighbor have in common.
 *
 * @remarks
 * A similarity score alone is not legible — a reader shown `≈68%` cannot tell whether the engine
 * found something real or bucketed two books by accident. This names the overlap so the score can
 * be judged rather than trusted.
 *
 * ⚠ **This is an illustration of the overlap, not a reconstruction of the signature.** The engine
 * hashes every attribute in {@link SIMILARITY_ATTRIBUTES}, of which `subjects` is one; re-deriving
 * the full feature set here would duplicate a module `core` deliberately keeps internal, and would
 * drift from it the first time its tokenization changed. Subjects carry most of the signal and are
 * the part a reader can verify at a glance, so they are what the pane shows — and the caption says
 * as much rather than implying the list is the whole basis.
 *
 * @param anchor - The book the search ran from.
 * @param neighbor - One of its returned neighbors.
 * @returns The shared subjects, in the anchor's order, empty when they share none.
 */
export function describeSharedSubjects(anchor: Book, neighbor: Book): readonly string[] {
	const neighborSubjects = new Set(neighbor.subjects);

	return anchor.subjects.filter((subject) => neighborSubjects.has(subject));
}
