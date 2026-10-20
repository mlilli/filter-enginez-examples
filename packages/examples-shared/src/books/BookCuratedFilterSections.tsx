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
 * The super-group table, its toggle and its inverse, and the Bloom builder all live in the
 * framework-neutral `books-domain/curated`, which the SvelteKit, Vue, Angular and vanilla panels
 * read too, so every vertical commits and reads back the same rule shapes.
 *
 * @packageDocumentation
 */

import type { Book, BookGenre } from '@filter-enginez/mock-data/books';

import { type BloomFilter, bloomMembership, type BloomMembershipRule, inSetofSets, type InSetofSetsRule } from '@filter-enginez/core';
import { useFilterEngine, useRule } from '@filter-enginez/react-signals';
import { ChipToggleGroup } from '@filter-enginez/react-ui';
import { useCallback, useMemo } from 'react';

import { useSeedAndAdopt } from '../optimistic/useSeedAndAdopt.js';
import { commitFilterMutation } from '../scheduling/index.js';
import { sameMembers, SectionHeader } from './BookFilterSections.js';
import { deriveSelectedGroupKeys, nextSuperGroupSets, SUPER_GROUP_KEYS } from './books-domain/curated.js';
import { CheckboxControl } from './CheckboxControl.js';
import { markUserAction } from './engineBusy.js';
import { useBooksChipExclusion, useToggleWouldBeEmpty } from './filterBundle.js';

/** Rule id + registry key for the genre super-groups InSetofSetsRule. */
const GENRE_GROUPS_RULE_ID = 'genre-groups';

/** Rule id + registry key for the Editor's-picks BloomMembershipRule. */
const EDITORS_PICKS_RULE_ID = 'editors-picks';

/** Stable empty key selection so an unset rule doesn't churn referential identity. */
const EMPTY_KEYS: readonly string[] = [];

/**
 * A genre super-group section committing an `InSetofSetsRule`. Selecting a group chip adds that
 * group's genre-set; a book matches if its genre is in any selected set.
 *
 * @remarks
 * **Seed and adopt**, like every other chip group in the React panels: the lit groups derive from the
 * committed rule through `deriveSelectedGroupKeys`, so a `?f` restore, time travel and a clear-all all
 * reach the chips, and a click paints at once ahead of the engine. The restore matters at mount:
 * `<FilterEngineUrlSync>` loads `?f` in an effect, after this section has already rendered.
 *
 * A click's local selection is read back from the very sets it commits, so it holds exactly what the
 * engine's echo derives; the echo then matches and the local value stays.
 */
export const SuperGroupSection = (): React.ReactElement => {
	const engine = useFilterEngine<Book>();
	const rule = useRule(GENRE_GROUPS_RULE_ID) as InSetofSetsRule<BookGenre> | undefined;
	// Memoized so the adopted value keeps its identity until the rule changes — `useSeedAndAdopt`
	// treats a new array as a new commit.
	const engineKeys = useMemo(() => (rule === undefined ? EMPTY_KEYS : deriveSelectedGroupKeys(rule.config.set)), [rule]);
	const [selectedKeys, setSelectedKeys] = useSeedAndAdopt(engineKeys, sameMembers);

	const handleToggle = useCallback((groupKey: string): void => {
		const nextSets = nextSuperGroupSets(selectedKeys, groupKey);

		commitFilterMutation({
			callEngine: () => engine.core.addRule(GENRE_GROUPS_RULE_ID, inSetofSets<BookGenre>('genre', nextSets)),
			markBusy: markUserAction,
			paintOptimisticUi: () => setSelectedKeys(deriveSelectedGroupKeys(nextSets)),
		});
	}, [engine, selectedKeys, setSelectedKeys]);
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
