/**
 * Tests for `<SimilarityPane />` — the pane that drives `useSimilar`.
 *
 * @remarks
 * Mounted over a REAL signals engine and a real `SimilaritySearch`, not a fake. The claim of the
 * pane is that MinHash + LSH find genuine neighbors at the configured banding; a stubbed search
 * would assert the JSX and nothing about the feature — and the specific regression worth catching
 * (a banding change that silently empties the bucket) is invisible to anything but a real index.
 *
 * ### The fixture is deterministic, not lucky
 *
 * `MinHash` seeds at a fixed value, so signatures and therefore buckets are identical on every run.
 * The corpus below is built so the relationships are hand-checkable: `B` carries feature-for-feature
 * the same attributes as `A` (Jaccard 1.0, guaranteed co-bucketed), `C` overlaps partially, and `D`
 * shares nothing with anything.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { createFilterEngine, inSet } from '@filter-enginez/core';
import { FilterEngineProvider } from '@filter-enginez/react-signals';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SimilarityPane } from './SimilarityPane.js';

/** Engines minted per test, torn down after it. */
const engines: SignalsEngine<Book>[] = [];

afterEach(() => {
	// Unmount before dispose so effect cleanups run against a live engine. Explicit because the root
	// config sets no `globals: true`, so Testing Library registers no automatic cleanup — without it
	// the FIRST case in this file passes and every later one fails with "Found multiple elements",
	// which reads as an ambiguous query rather than as stale DOM.
	cleanup();
	while (engines.length > 0) {
		engines.pop()?.dispose();
	}
});

const books = [
	{
		authors: ['Hart'],
		format: 'hardcover',
		genre: 'fantasy',
		id: 'a',
		language: 'en',
		subjects: ['seafaring', 'coming-of-age', 'historical'],
		title: 'Wild Echo',
	},
	{
		authors: ['Hart'],
		format: 'hardcover',
		genre: 'fantasy',
		id: 'b',
		language: 'en',
		subjects: ['seafaring', 'coming-of-age', 'historical'],
		title: 'Salt Harbor',
	},
	{
		authors: ['Penhaligon'],
		format: 'ebook',
		genre: 'fantasy',
		id: 'c',
		language: 'en',
		subjects: ['seafaring', 'historical'],
		title: 'The Long Reach',
	},
	{
		authors: ['Zed'],
		format: 'audiobook',
		genre: 'reference',
		id: 'd',
		language: 'fr',
		subjects: ['cookery'],
		title: 'Batterie de Cuisine',
	},
	{
		// Matches `A` on author, genre, format and language and on NOTHING else — the case where a
		// real neighbor shares no subjects at all. Four shared tokens of eight union, so ~0.5
		// estimated Jaccard: comfortably a neighbor, with an empty overlap list to render.
		authors: ['Hart'],
		format: 'hardcover',
		genre: 'fantasy',
		id: 'e',
		language: 'en',
		subjects: ['cookery'],
		title: 'Hart on Baking',
	},
] as unknown as readonly Book[];

/** Mount the pane over a real engine carrying {@link books}. */
function mountPane(): SignalsEngine<Book> {
	const engine = createSignalsEngine(createFilterEngine<Book>({ sourceData: books }));

	engines.push(engine);
	render(
		<FilterEngineProvider engine={engine as unknown as SignalsEngine<unknown>}>
			<SimilarityPane />
		</FilterEngineProvider>,
	);

	return engine;
}

/** The anchor picker. */
function anchorSelect(): HTMLSelectElement {
	return screen.getByRole('combobox');
}

/** The rendered neighbor rows, as text. */
function neighborTexts(): string[] {
	return screen.queryAllByRole('listitem').map((row) => row.textContent);
}

describe('SimilarityPane', () => {
	it('finds a real neighbor for the default anchor and scores it', () => {
		mountPane();

		// `B` is feature-identical to `A`, so it must come back at the top of the estimate's range.
		const rows = neighborTexts();

		expect(rows.some((text) => text.includes('Salt Harbor'))).toBe(true);
		expect(rows.some((text) => text.includes('≈100%'))).toBe(true);
	});

	it('does NOT list the anchor as its own neighbor', () => {
		// `SimilaritySearch` excludes the query item by REFERENCE equality, so this passes only while
		// the pane hands it an object out of the engine's own source data. A future refactor that
		// mapped or spread `useResults()` before picking an anchor would break identity, and the
		// symptom would be the visitor's own book sitting at the top of its neighbor list at 100% —
		// which reads as a plausible feature rather than as a bug.
		mountPane();

		expect(neighborTexts().some((text) => text.includes('Wild Echo'))).toBe(false);
	});

	it('surfaces a PARTIAL match, which is the whole reason the threshold is lowered', () => {
		// Dropping `SIMILARITY_QUERY` from the hook call — so the search runs at the library's default
		// 0.5 instead of the measured 0.3 — would fail no other case here, because every other case in
		// this file asserts on `B`, which is feature-identical to the anchor and clears any threshold.
		// The measured value is pinned in `labSimilarity.test.ts`, and without this case the pane would
		// be free to ignore it, which is exactly the regression shape that matters: the config is right
		// and unused.
		//
		// `C` shares two subjects, the genre and the language with `A` but differs in author and
		// format — an estimated Jaccard around 0.44, above 0.3 and below 0.5. It appears only if the
		// pane is really querying at the threshold this app chose.
		mountPane();

		expect(neighborTexts().some((text) => text.includes('The Long Reach'))).toBe(true);
	});

	it('names the subjects the neighbor shares, in the anchor order', () => {
		mountPane();

		const row = screen.queryAllByRole('listitem').find((item) => item.textContent.includes('Salt Harbor'));

		expect(row).toBeDefined();
		expect(within(row as HTMLElement).getByText('seafaring')).toBeDefined();
		expect(within(row as HTMLElement).getByText('coming-of-age')).toBeDefined();
	});

	it('re-anchors when the visitor picks a different book', () => {
		mountPane();

		expect(neighborTexts().some((text) => text.includes('Salt Harbor'))).toBe(true);

		fireEvent.change(anchorSelect(), { target: { value: 'b' }});

		// Anchored on B, the neighbor list must now contain A rather than B.
		expect(neighborTexts().some((text) => text.includes('Wild Echo'))).toBe(true);
		expect(neighborTexts().some((text) => text.includes('Salt Harbor'))).toBe(false);
	});

	it('offers only books that survive the current filters as anchors', () => {
		const engine = mountPane();

		expect(anchorSelect().options.length).toBe(books.length);

		act(() => {
			engine.core.addRule('genre', inSet<Book['genre']>('genre', ['fantasy']));
		});

		// `D` is the reference book — filtering it out must remove it from the picker, or the pane
		// would offer an anchor the visitor is not currently looking at.
		expect(anchorSelect().options.length).toBe(books.length - 1);
	});

	it('says a neighbor shares no subjects rather than rendering an empty tag row', () => {
		// `E` matches the anchor on author, genre, format and language and on no subject at all, so
		// its overlap list is legitimately empty. Rendering nothing there would leave a score with no
		// visible justification, which is the one thing the tags exist to prevent.
		mountPane();

		const row = screen.queryAllByRole('listitem').find((item) => item.textContent.includes('Hart on Baking'));

		expect(row).toBeDefined();
		expect(row?.textContent).toContain('matched on the other attributes');
	});

	it('says so plainly when the filters match nothing, rather than rendering an empty list', () => {
		const engine = mountPane();

		act(() => {
			engine.core.addRule('genre', inSet<Book['genre']>('genre', ['travel']));
		});

		expect(screen.getByText(/nothing to find neighbors for/u)).toBeDefined();
		// And the picker is gone rather than left empty and focusable.
		expect(screen.queryByRole('combobox')).toBeNull();
	});

	it('reports an isolated book as an answer rather than as a blank', () => {
		// `D` shares no attribute with anything, so its LSH buckets hold only itself and the search
		// returns []. That is a legitimate result, and the pane must distinguish it from a failure —
		// this is the branch the measured `bandSize` makes rare rather than impossible.
		mountPane();

		fireEvent.change(anchorSelect(), { target: { value: 'd' }});

		expect(screen.getByText(/shares enough with/u)).toBeDefined();
		expect(neighborTexts()).toEqual([]);
	});
});
