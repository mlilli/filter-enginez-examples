/**
 * `@filter-enginez/examples-shared/vocabulary` — deriving a chip vocabulary from a corpus, belonging
 * to no dataset.
 *
 * @remarks
 * Every dataset does the same thing to build a chip group: take a column, keep the distinct values,
 * sort them for a stable UI. That is not a books concern or a real-estate one, and this subpath is
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
