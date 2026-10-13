/**
 * `BookCuratedFilterSections` — the two "curated" books demo sections: genre super-groups
 * (`InSetofSetsRule`) and Editor's picks (`BloomMembershipRule`).
 *
 * @remarks
 * Split out of `BookFilterSections.tsx` (which is near the file-size cap) — same engine-wired
 * `commitFilterMutation` contract, but these two exercise rule types no other books section
 * demonstrates:
 *
 *   - **`<SuperGroupSection />`** commits an `InSetofSetsRule` over `genre`. Each chip is a curated
 *     _super-group_ (a set of genres); a book passes if its genre is in ANY selected group. The rule
 *     stores the selected groups as an array-of-arrays (`config.set`), matching its "value ∈ any
 *     subset" semantics.
 *   - **`<FeaturedSection />`** commits a `BloomMembershipRule` — a probabilistic set-membership
 *     pre-screen against a Bloom filter built once at panel mount from the corpus's top-rated books.
 *     It's a _pre-screen_ (no false negatives; a tunable, tiny false-positive rate), which is exactly
 *     the point of the demo; a correctness-critical use would pair it with an exact check.
 *
 * @packageDocumentation
 */

import type { Book, BookGenre } from '@filter-enginez/mock-data/books';

import { BloomFilter, bloomMembership, type BloomMembershipRule, inSetofSets, type InSetofSetsRule } from '@filter-enginez/core';
import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { ChipToggleGroup } from '@filter-enginez/react-ui';
import { useCallback, useMemo, useState } from 'react';

import { commitFilterMutation } from '../scheduling/index.js';
import { SectionHeader } from './BookFilterSections.js';
import { CheckboxControl } from './CheckboxControl.js';
import { markUserAction } from './engineBusy.js';
import { useBooksChipExclusion, useToggleWouldBeEmpty } from './filterBundle.js';

/** Rule id + registry key for the genre super-groups InSetofSetsRule. */
const GENRE_GROUPS_RULE_ID = 'genre-groups';

/** Rule id + registry key for the Editor's-picks BloomMembershipRule. */
const EDITORS_PICKS_RULE_ID = 'editors-picks';

/** Minimum average rating for a book to count as an "editor's pick" (drives the Bloom set). */
const EDITORS_PICK_MIN_RATING = 4.5;

/** Stable empty key selection so an unset rule doesn't churn referential identity. */
const EMPTY_KEYS: readonly string[] = [];

/**
 * Curated genre super-groups — each maps a human label to a set of `BookGenre`s. A book passes the
 * `InSetofSetsRule` when its single `genre` is a member of ANY selected group's set. Every genre is
 * covered exactly once across the five groups.
 */
const GENRE_SUPER_GROUPS: Record<string, readonly BookGenre[]> = {
	'Fiction & drama': ['children', 'fiction', 'romance', 'young-adult'],
	'Knowledge & ideas': ['biography', 'business', 'history', 'philosophy', 'reference', 'science'],
	'Lifestyle & arts': ['cookbook', 'poetry', 'travel'],
	'Mystery & thriller': ['mystery', 'thriller'],
	Speculative: ['fantasy', 'science-fiction'],
};

/** The super-group labels, in declaration order — the chip vocabulary. */
const SUPER_GROUP_KEYS: readonly string[] = Object.keys(GENRE_SUPER_GROUPS);

/**
 * The super-group node specs the predictive-disable bundle simulates — one entry per group carrying
 * the genre set that selecting it would add. Mirrors wine's origin node specs (the `inSetOfSets`
 * chip-group shape `applyFiltersAndQuery` expects).
 */
export function getSuperGroupNodeSpecs(): readonly { readonly leafIds: readonly string[]; readonly value: string; }[] {
	return SUPER_GROUP_KEYS.map((key) => ({ leafIds: GENRE_SUPER_GROUPS[key] ?? [], value: key }));
}

/**
 * A genre super-group section committing an `InSetofSetsRule`. Selecting a group chip adds that
 * group's genre-set; a book matches if its genre is in any selected set.
 */
export const SuperGroupSection = (): React.ReactElement => {
	const engine = useFilterEngine<Book>();
	const rule = useRule(GENRE_GROUPS_RULE_ID) as InSetofSetsRule<BookGenre> | undefined;
	const engineGroupCount = rule?.config.set.length ?? 0;
	const [selectedKeys, setSelectedKeys] = useState<readonly string[]>(EMPTY_KEYS);
	const [lastSeenGroupCount, setLastSeenGroupCount] = useState(engineGroupCount);

	// Re-sync on an external clear (clear-all / chip removal empties the rule) — reset local keys so
	// the chips agree with the engine. Partial external edits have no UI here, so this suffices.
	// Adjusted during render rather than in an effect, so the cleared chips never paint a stale frame.
	if (engineGroupCount !== lastSeenGroupCount) {
		setLastSeenGroupCount(engineGroupCount);

		if (engineGroupCount === 0) {
			setSelectedKeys(EMPTY_KEYS);
		}
	}

	const handleToggle = useCallback((groupKey: string): void => {
		const isSelected = selectedKeys.includes(groupKey);
		const nextKeys = isSelected ? selectedKeys.filter((key) => key !== groupKey) : [...selectedKeys, groupKey];
		const nextSets = nextKeys
			.map((key) => GENRE_SUPER_GROUPS[key])
			.filter((set): set is readonly BookGenre[] => set !== undefined);

		commitFilterMutation({
			callEngine: () => engine.core.addRule(GENRE_GROUPS_RULE_ID, inSetofSets<BookGenre>('genre', nextSets)),
			markBusy: markUserAction,
			paintOptimisticUi: () => setSelectedKeys(nextKeys),
		});
	}, [engine, selectedKeys]);
	// Predictive-disable — a super-group whose selection would empty the set (given the active genre
	// chips / other filters) is disabled, so the group ↔ chip interaction can never reach zero.
	const exclusion = useBooksChipExclusion(GENRE_GROUPS_RULE_ID);

	return (
		<section>
			<SectionHeader label="Genre super-groups" />
			<ChipToggleGroup<string> options={SUPER_GROUP_KEYS} selected={selectedKeys} onToggle={handleToggle} exclusion={exclusion} />
		</section>
	);
};

/**
 * Props for `<FeaturedSection />`.
 */
export interface FeaturedSectionProps {
	/** The prebuilt Bloom filter of "editor's pick" book ids (built once at panel mount). */
	readonly filter: BloomFilter;
}

/**
 * An Editor's-picks section committing a `BloomMembershipRule`. Checked pre-screens the corpus to
 * the (probabilistic) featured set; clearing removes the rule.
 */
export const FeaturedSection = (props: FeaturedSectionProps): React.ReactElement => {
	const { filter } = props;
	const engine = useFilterEngine<Book>();
	const rule = useRule(EDITORS_PICKS_RULE_ID) as BloomMembershipRule | undefined;
	const isChecked = rule !== undefined;
	// Predictive-disable: turning this on pre-screens to the featured set; disable when none of the
	// current results are in it (e.g. a rating cap below the pick threshold), so it can't zero.
	const candidateRule = useMemo(() => bloomMembership('id', filter), [filter]);
	const isDisabled = useToggleWouldBeEmpty(candidateRule);

	const handleToggle = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
		// Capture the checked state now — `commitFilterMutation` defers `callEngine` to a later frame.
		const shouldRequireMembership = event.target.checked;

		commitFilterMutation({
			callEngine: () => {
				if (shouldRequireMembership) {
					engine.core.addRule(EDITORS_PICKS_RULE_ID, bloomMembership('id', filter));
				} else {
					engine.core.removeRule(EDITORS_PICKS_RULE_ID);
				}
			},
			markBusy: markUserAction,
		});
	}, [engine, filter]);

	return <CheckboxControl isChecked={isChecked} isDisabled={isDisabled} label="Editor's picks (top-rated)" onToggle={handleToggle} />;
};

/**
 * Build the Editor's-picks Bloom filter from the corpus — the set of `book.id`s whose
 * `averageRating` meets {@link EDITORS_PICK_MIN_RATING}. Sized to that count at a 0.1% target
 * false-positive rate. The `BloomMembershipRule` keys on `String(id)`, and `id` is already a string,
 * so `filter.add(book.id)` and the rule's probe agree.
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
 * Whether a book qualifies as an editor's pick (non-null rating at or above the threshold).
 *
 * @internal
 */
function isEditorsPick(book: Book): boolean {
	return book.averageRating !== null && book.averageRating >= EDITORS_PICK_MIN_RATING;
}
