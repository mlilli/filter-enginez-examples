/**
 * Rendering tests for `<SuperGroupSection />`: the genre super-group chips follow the committed
 * `InSetofSetsRule` whenever it changes from outside, and a click still paints at once.
 *
 * @remarks
 * The restore runs through the real `<FilterEngineUrlSync>`, mounted beside the section as both React
 * apps' `DatasetView` mounts them: the sync restores `?f` in an effect, after the section has already
 * rendered, so a selection that is only ever seeded at mount stays blank.
 *
 * @packageDocumentation
 */

import { createFilterEngine, inSetofSets, type InSetofSetsRule } from '@filter-enginez/core';
import { type Book, type BookGenre, books } from '@filter-enginez/mock-data/books';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine } from '@filter-enginez/reactive-signals';
import { FilterEngineUrlSync } from '@filter-enginez/url-state-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';

import { createLinkSerializer } from '../url/linkSerializer.js';
import { SuperGroupSection } from './BookCuratedFilterSections.js';
import { deriveSelectedGroupKeys, GENRE_SUPER_GROUPS } from './books-domain/curated.js';

// No auto-cleanup in this workspace (no `globals: true`), so trees would otherwise accumulate.
afterEach(cleanup);

/** The synchronous books engine core. */
type BooksCore = ReturnType<typeof createFilterEngine<Book>>;

/** The rule id the section commits. */
const GENRE_GROUPS_RULE_ID = 'genre-groups';

/** A small deterministic slice of the books corpus. */
const CORPUS: readonly Book[] = books.slice(0, 400);

/** The `?f=` codec both React apps hand `<FilterEngineUrlSync>`. */
const SERIALIZER = createLinkSerializer('human-readable');

/**
 * The genre sets of the named super-groups, the value the section commits for them.
 *
 * @param groupKeys - Super-group labels.
 * @returns Their genre sets, in the order given.
 */
function setsOf(groupKeys: readonly string[]): readonly (readonly BookGenre[])[] {
	return groupKeys.map((key) => GENRE_SUPER_GROUPS[key] ?? []);
}

/**
 * The `?f=` value a vertical writes for a super-group selection.
 *
 * @param groupKeys - The super-groups to select.
 * @returns The encoded engine state.
 */
function linkFor(groupKeys: readonly string[]): string {
	const donor = createFilterEngine<Book>({ sourceData: CORPUS });

	donor.addRule(GENRE_GROUPS_RULE_ID, inSetofSets<BookGenre>('genre', setsOf(groupKeys)));

	return SERIALIZER.encode(donor.exportConfig());
}

/**
 * Mount the section beside the real URL sync, at `/books` with an optional `?f=`.
 *
 * @param link - The `?f=` to restore, if any.
 * @returns The core the section writes through.
 */
function renderSection(link?: string): BooksCore {
	const core = createFilterEngine<Book>({ sourceData: CORPUS });
	const engine = createSignalsEngine(core);
	const entry = link === undefined ? '/books' : `/books?${new URLSearchParams({ f: link }).toString()}`;

	render(
		<MemoryRouter initialEntries={[entry]}>
			<FilterEngineProvider engine={engine}>
				<FilterEngineUrlSync engine={engine.core} serializer={SERIALIZER} debounceMs={0} />
				<SuperGroupSection />
			</FilterEngineProvider>
		</MemoryRouter>,
	);

	return core;
}

/**
 * The labels of every lit super-group chip, in display order.
 *
 * @returns The pressed chips' labels.
 */
function pressedLabels(): readonly string[] {
	return screen.queryAllByRole('button', { pressed: true }).map((button) => button.textContent.trim());
}

/**
 * The super-groups the committed rule holds.
 *
 * @param core - The engine core.
 * @returns Their labels, in declaration order.
 */
function committedGroups(core: BooksCore): readonly string[] {
	const rule = core.getRules().get(GENRE_GROUPS_RULE_ID) as InSetofSetsRule<BookGenre> | undefined;

	return rule === undefined ? [] : deriveSelectedGroupKeys(rule.config.set);
}

describe('<SuperGroupSection />', () => {
	it('lights the groups a `?f` link restores in the same commit that mounts the section', () => {
		renderSection(linkFor(['Speculative', 'Fiction & drama']));

		expect(pressedLabels()).toEqual(['Fiction & drama', 'Speculative']);
	});

	it('follows an external change after mount: time travel to other groups, then a clear', () => {
		const core = renderSection();

		act(() => {
			core.addRule(GENRE_GROUPS_RULE_ID, inSetofSets<BookGenre>('genre', setsOf(['Mystery & thriller'])));
		});
		expect(pressedLabels()).toEqual(['Mystery & thriller']);

		act(() => {
			core.removeRule(GENRE_GROUPS_RULE_ID);
		});
		expect(pressedLabels()).toEqual([]);
	});

	it('paints a click before the engine commits it, and keeps it through the echo', async () => {
		const core = renderSection(linkFor(['Speculative']));

		fireEvent.click(screen.getByRole('button', { name: 'Fiction & drama' }));
		// The engine write runs frames after the paint (`commitFilterMutation`).
		expect(committedGroups(core)).toEqual(['Speculative']);
		expect(pressedLabels()).toEqual(['Fiction & drama', 'Speculative']);

		await waitFor(() => {
			expect(committedGroups(core)).toEqual(['Fiction & drama', 'Speculative']);
		});
		expect(pressedLabels()).toEqual(['Fiction & drama', 'Speculative']);
	});
});
