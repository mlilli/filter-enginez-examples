/**
 * `@filter-enginez/examples-shared/vocabulary` — deriving a chip vocabulary from a corpus, belonging
 * to no dataset.
 *
 * @remarks
 * Every dataset does the same thing to build a chip group: take a column, keep the distinct values,
 * order them for a stable UI — alphabetically ({@link uniqueSorted}) for a short vocabulary, by
 * frequency ({@link rankByFrequency}, {@link orderTreeByFrequency}) for a long one. That is not a books concern or a real-estate one, and this subpath is
 * the neutral address for it — the same argument `./picker` makes about tri-state tree semantics.
 * The books, real-estate and wine chip vocabularies all derive through this one function, so no two
 * panels order the same facet differently, and no dataset imports another's helper across a dataset
 * boundary.
 *
 * ## The rule: drop empties, locale sort
 *
 * Over the full 100k books and 50k real-estate corpora:
 *
 *   - **Books** — genre (17), format (5), language (10): byte-identical under locale and code-unit
 *     sort.
 *   - **Real estate** — propertyType, status and features: identical. `schoolDistrict` (24 values)
 *     is the ONLY vocabulary where the rule shows: a code-unit sort puts `SFUSD` before
 *     `San Mateo Union`, because uppercase `F` (70) beats lowercase `a` (97). Locale collation
 *     compares case-insensitively first, so it reads `San Mateo Union, Seattle Public, SFUSD` — the
 *     order a human would expect.
 *
 * Neither corpus contains an empty or non-string value in any vocabulary, so the filtering half of
 * the contract is defensive rather than load-bearing for the shipped data. It stays because a blank
 * chip can be pressed but says nothing, and the cost of guarding is one `typeof` check.
 *
 * @packageDocumentation
 */

/**
 * Distinct, non-empty string values of a series, sorted for stable UI ordering.
 *
 * @remarks
 * **`localeCompare`, not the default sort**, and the difference is not cosmetic. `Array#sort` with no
 * comparator orders by UTF-16 code unit, which puts every uppercase letter before every lowercase one
 * (`Z` before `a`) and every accented character after all unaccented ones — so a default sort files
 * `Gewürztraminer` past `Zinfandel`, at the bottom of the varietal list rather than under G.
 *
 * **Non-strings and empty strings are dropped rather than rendered.** A chip with no label can be
 * pressed but communicates nothing, and — because it still occupies a slot in the vocabulary — makes
 * the facet's count disagree with what is on screen. The input is typed `readonly unknown[]` rather
 * than `readonly string[]` precisely so a corpus column that is nullable in practice can be handed
 * over without a cast at every call site.
 *
 * @param values - The raw column, which may contain nullish values or empty strings.
 * @returns The distinct non-empty strings, locale-sorted.
 */
export function uniqueSorted(values: readonly unknown[]): readonly string[] {
	const set = new Set<string>();

	for (const value of values) {
		if (typeof value === 'string' && value.length > 0) {
			set.add(value);
		}
	}

	return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/**
 * Distinct, non-empty string values of a series, most frequent first.
 *
 * @remarks
 * **For a long vocabulary, alphabetical order puts the wrong values on top.** The wine data names 701
 * grape varieties, and its alphabetical head is Abouriou, Agiorgitiko, Aidani — grapes a handful of
 * bottles carry — while Pinot Noir and Chardonnay, a tenth of the corpus each, sit hundreds of rows
 * down. Ordered by how many records carry each value, the first screen of a list is the part people
 * filter by. Short, hand-ordered vocabularies (color, body, sweetness) keep their own order.
 *
 * Ties break by {@link uniqueSorted}'s locale order, so the result is deterministic. Same filtering
 * contract: empty and non-string values are dropped.
 *
 * @param values - The series, typically one column of a corpus (`wines.map((wine) => wine.varietal)`).
 * @returns Each distinct value once, by descending count, ties alphabetical.
 */
export function rankByFrequency(values: readonly unknown[]): readonly string[] {
	const counts = new Map<string, number>();

	for (const value of values) {
		if (typeof value === 'string' && value.length > 0) {
			counts.set(value, (counts.get(value) ?? 0) + 1);
		}
	}

	// Sort the [value, count] entries themselves, so each comparison reads the counts it was handed
	// rather than looking them up again — a lookup the type system cannot prove succeeds.
	return Array.from(counts.entries())
		.sort(([valueA, countA], [valueB, countB]) => countB - countA || valueA.localeCompare(valueB))
		.map(([value]) => value);
}

/**
 * A shortlist of a frequency-ranked vocabulary that never hides a selected value.
 *
 * @remarks
 * For a chip group that cannot show hundreds of chips: the first `limit` values, plus every selected
 * value beyond them, in rank order. Without the second half, a selection that arrives through a
 * shared link — a rare grape picked in another app — would be active and invisible, with no chip to
 * clear it from.
 *
 * @param ranked - The vocabulary, already ranked ({@link rankByFrequency}).
 * @param selected - The values currently selected.
 * @param limit - How many leading values to show regardless of selection.
 * @returns The values to render, in rank order.
 */
export function shortlistVocabulary(ranked: readonly string[], selected: readonly string[], limit: number): readonly string[] {
	if (ranked.length <= limit) {
		return ranked;
	}
	const selectedSet = new Set(selected);

	return ranked.filter((value, index) => index < limit || selectedSet.has(value));
}

/** A tree node as {@link orderTreeByFrequency} reads it: an id and optional children. */
export interface FrequencyOrderableNode {
	/** The node id; records carry it, or a descendant's, as their path. */
	readonly id: string;
	/** Child nodes, if any. */
	readonly children?: readonly FrequencyOrderableNode[];
}

/**
 * Re-order every level of a tree so the nodes covering the most records come first.
 *
 * @remarks
 * The tree-shaped counterpart of {@link rankByFrequency}, for a hierarchy such as wine origin, where
 * alphabetical order opens the list on Argentina and Armenia and puts the US — four wines in ten —
 * near the bottom. A node's weight is the number of records whose id is the node's own or any
 * descendant's, so a country ranks by all of its wines, not by its biggest region. Ties break by label
 * (or id), in locale order. Returns a new tree; the input is not touched.
 *
 * @typeParam Node - The tree's node type; its other fields are carried through unchanged.
 * @param tree - The root. Its own position is not changed, only its descendants'.
 * @param recordIds - One id per record — for wine, every wine's `originId`.
 * @returns The re-ordered tree.
 */
export function orderTreeByFrequency<Node extends FrequencyOrderableNode>(tree: Node, recordIds: readonly string[]): Node {
	const ownCounts = new Map<string, number>();

	for (const id of recordIds) {
		ownCounts.set(id, (ownCounts.get(id) ?? 0) + 1);
	}

	/**
	 * Re-order one subtree.
	 *
	 * @param node - The subtree's root.
	 * @returns The re-ordered subtree and its weight.
	 */
	function visit(node: FrequencyOrderableNode): { readonly node: FrequencyOrderableNode; readonly weight: number } {
		const ownWeight = ownCounts.get(node.id) ?? 0;

		if (node.children === undefined || node.children.length === 0) {
			return { node, weight: ownWeight };
		}
		const visited = node.children.map(visit);
		const labelOf = (candidate: FrequencyOrderableNode): string =>
			(candidate as { readonly label?: unknown }).label === undefined ? candidate.id : String((candidate as { readonly label?: unknown }).label);

		visited.sort((a, b) => b.weight - a.weight || labelOf(a.node).localeCompare(labelOf(b.node)));

		return {
			node: { ...node, children: visited.map((entry) => entry.node) },
			weight: visited.reduce((sum, entry) => sum + entry.weight, ownWeight),
		};
	}

	return visit(tree).node as Node;
}
