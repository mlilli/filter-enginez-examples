/**
 * `books-domain/curated` — the curated-filter helpers for the books panel: genre super-groups
 * (`InSetofSetsRule`), the Editor's-picks Bloom filter (`BloomMembershipRule`), and defensive regex
 * compilation (`RegexRule`).
 *
 * @remarks
 * Framework-neutral pure functions — the canonical home for the super-groups + Bloom + regex-compile
 * logic each framework panel (React / Vue / Svelte / vanilla) commits, so every vertical produces the
 * exact same rule shapes. Extracted from the panel components so the toggle/derive logic is
 * unit-testable in isolation.
 *
 * @packageDocumentation
 */

import type { Book, BookGenre } from '@filter-enginez/mock-data/books';

import { BloomFilter } from '@filter-enginez/core';

/** Minimum average rating for a book to count as an "editor's pick" (drives the Bloom set). */
export const EDITORS_PICK_MIN_RATING = 4.5;

/**
 * Curated genre super-groups — each maps a human label to a set of `BookGenre`s. A book passes the
 * `InSetofSetsRule` when its single `genre` is a member of ANY selected group's set. Every genre is
 * covered exactly once across the five groups.
 */
export const GENRE_SUPER_GROUPS: Record<string, readonly BookGenre[]> = {
	'Fiction & drama': ['children', 'fiction', 'romance', 'young-adult'],
	'Knowledge & ideas': ['biography', 'business', 'history', 'philosophy', 'reference', 'science'],
	'Lifestyle & arts': ['cookbook', 'poetry', 'travel'],
	'Mystery & thriller': ['mystery', 'thriller'],
	Speculative: ['fantasy', 'science-fiction'],
};

/** The super-group labels, in declaration order — the chip vocabulary. */
export const SUPER_GROUP_KEYS: readonly string[] = Object.keys(GENRE_SUPER_GROUPS);

/** One super-group node spec — the `inSetOfSets` chip-group candidate shape. */
export interface SuperGroupNodeSpec {
	/** Every genre id this group would add. */
	readonly leafIds: readonly string[];
	/** The super-group label (echoed back as the candidate key in the bundle response). */
	readonly value: string;
}

/**
 * The super-group node specs the predictive-disable bundle simulates — one entry per group carrying
 * the genre set that selecting it would add (mirrors wine's origin node specs / the `inSetOfSets`
 * chip-group shape `applyFiltersAndQuery` expects).
 */
export function getSuperGroupNodeSpecs(): readonly SuperGroupNodeSpec[] {
	// `Object.entries` gives a defined `leafIds` (avoids the `Record` index yielding `| undefined` under
	// `noUncheckedIndexedAccess`).
	return Object.entries(GENRE_SUPER_GROUPS).map(([value, leafIds]) => ({ leafIds, value }));
}

/**
 * Map a committed `InSetofSetsRule` config (array-of-genre-sets) back to the super-group labels that
 * produced it — so the chip selection derives directly from engine state (no local mirror needed, so
 * clear-all / pill-removal stay in sync automatically).
 *
 * @param committedSets - The rule's `config.set` (an array of genre subsets).
 * @returns The super-group labels currently selected, in declaration order.
 */
export function deriveSelectedGroupKeys(committedSets: readonly (readonly BookGenre[])[]): readonly string[] {
	return SUPER_GROUP_KEYS.filter((key) => {
		const groupSet = GENRE_SUPER_GROUPS[key];

		return groupSet !== undefined && committedSets.some((set) => sameMembers(set, groupSet));
	});
}

/**
 * Compute the next array-of-genre-sets after toggling one super-group key against the current
 * selection — the value committed to `inSetofSets('genre', …)`.
 *
 * @param currentKeys - The currently-selected super-group labels.
 * @param toggledKey - The label the user clicked.
 * @returns The next array of genre subsets.
 */
export function nextSuperGroupSets(
	currentKeys: readonly string[],
	toggledKey: string,
): readonly (readonly BookGenre[])[] {
	const isSelected = currentKeys.includes(toggledKey);
	const nextKeys = isSelected ? currentKeys.filter((key) => key !== toggledKey) : [...currentKeys, toggledKey];

	return nextKeys
		.map((key) => GENRE_SUPER_GROUPS[key])
		.filter((set): set is readonly BookGenre[] => set !== undefined);
}

/**
 * Build the Editor's-picks Bloom filter from the corpus — the set of `book.id`s whose `averageRating`
 * meets {@link EDITORS_PICK_MIN_RATING}. Sized to that count at a 0.1% target false-positive rate. The
 * `BloomMembershipRule` keys on `String(id)`, and `id` is already a string, so `filter.add(book.id)`
 * and the rule's probe agree.
 *
 * @param books - The full corpus.
 * @returns A prebuilt Bloom filter of the top-rated book ids.
 */
export function buildEditorsPicksFilter(books: readonly Book[]): BloomFilter {
	const pickIds = books.filter(isEditorsPick).map((book) => book.id);
	const filter = BloomFilter.forCapacity(Math.max(1, pickIds.length), 0.001);

	for (const id of pickIds) {
		filter.add(id);
	}

	return filter;
}

/**
 * The regex pattern-source to present in the ISBN input for a committed `RegexRule`. An empty-pattern
 * rule deserializes to `/(?:)/`, whose `.source` is the sentinel `'(?:)'` — present that as empty.
 *
 * @param source - The rule's `config.pattern.source` (or `undefined` when no rule is active).
 * @returns The input's display value.
 */
export function regexInputValue(source: string | undefined): string {
	if (source === undefined || source === '(?:)') {
		return '';
	}

	return source;
}

/**
 * Compile a user-entered pattern, returning `null` (rather than throwing) on a malformed source so a
 * half-typed regex never crashes the panel.
 *
 * @param source - The raw pattern text.
 * @returns The compiled `RegExp`, or `null` when the source is malformed.
 */
export function compilePattern(source: string): RegExp | null {
	try {
		return new RegExp(source);
	} catch {
		return null;
	}
}

/**
 * Whether a book qualifies as an editor's pick (non-null rating at or above the threshold).
 *
 * @internal
 */
function isEditorsPick(book: Book): boolean {
	return book.averageRating !== null && book.averageRating >= EDITORS_PICK_MIN_RATING;
}

/**
 * Order-insensitive membership equality for two genre subsets.
 *
 * @internal
 */
function sameMembers(a: readonly BookGenre[], b: readonly BookGenre[]): boolean {
	if (a.length !== b.length) {
		return false;
	}

	return a.every((value) => b.includes(value));
}
