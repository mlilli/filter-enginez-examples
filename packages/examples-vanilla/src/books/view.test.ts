/**
 * Functional-parity tests for the framework-less books view.
 *
 * @remarks
 * Mirrors the Vue `BooksView.test.ts` and the Svelte `BooksParity.test.ts`: mount the real view over a
 * mini engine of Book-shaped rows and prove the two headline interactions behave identically to the
 * other verticals —
 *   1. toggling a genre chip narrows the count + card grid, and
 *   2. removing an active-filter pill restores the full set.
 *
 * Crucially these drive the REAL engine through the same write path the app uses (`core.addRule` /
 * `core.removeRule`), so a green run means the hand-written DOM commits and reads the same engine
 * state React/Vue/Svelte do — no framework, no adapter.
 *
 * @packageDocumentation
 */

import type { Book } from '@filter-enginez/mock-data/books';

import { createFilterEngine, type FilterEngine, type FuzzySearchRule, type TextSearchRule } from '@filter-enginez/core';
import { appHeaderSubtitle } from '@filter-enginez/examples-shared/app-header-core';
import { BOOKS_ISBN_INVALID_MESSAGE, safeApplyBundleFromCore } from '@filter-enginez/examples-shared/books-domain';
import { DESKTOP_MEDIA_QUERY } from '@filter-enginez/examples-shared/viewport-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createBusyCore } from '../busy/engineBusy.js';
import { installMatchMedia, type MediaQueryController } from '../test-support/matchMedia.js';
import { bookCard } from './bookCard.js';
import { type BooksView, createBooksView } from './view.js';

/**
 * A Book-shaped row carrying every field the panel + card touch. Cast through `unknown` at the
 * boundary — the mini corpus stands in for a full `Book`.
 */
function makeBook(overrides: { readonly id: string } & Partial<Book>): Book {
	return {
		authors: ['A. Writer'],
		averageRating: 4,
		coverImage: '',
		description: 'A tale of the sea.',
		format: 'paperback',
		genre: 'fantasy',
		hasAudiobook: false,
		isbn13: '9780000000000',
		isInPrint: true,
		language: 'english',
		lastUpdated: '2024-01-01T00:00:00.000Z',
		openLibraryId: 'OL1',
		pageCount: 300,
		popularityScore: 10,
		publicationYear: 2000,
		publisher: 'Test House',
		subjects: ['adventure'],
		subtitle: appHeaderSubtitle(''),
		tier: 'default',
		title: 'Untitled',
		...overrides,
	} as unknown as Book;
}

/** Four books across three genres, so the facets have signal. */
const DATA: readonly Book[] = [
	makeBook({ genre: 'fantasy', id: 'a', publicationYear: 2000, title: 'A' }),
	makeBook({ genre: 'mystery', id: 'b', publicationYear: 2005, title: 'B' }),
	makeBook({ genre: 'fantasy', id: 'c', publicationYear: 2010, title: 'C' }),
	makeBook({ genre: 'science', id: 'd', publicationYear: 2015, title: 'D' }),
];

/**
 * Mount the view over a fresh engine, wired the way `booksRawPage` does (one coarse repaint) so the
 * assertions exercise the shared view rather than either page's subscription strategy.
 */
function mountView(): { core: FilterEngine<Book>; repaint: () => void; root: HTMLElement } {
	const core = createFilterEngine<Book>({ sourceData: DATA });
	const view = createBooksView(core, { busy: createBusyCore(), footnote: 'test', subtitle: appHeaderSubtitle('test') });
	const root = document.createElement('div');

	root.append(view.element);
	document.body.append(root);

	const repaint = (): void => {
		view.setCount(core.getResultCount(), DATA.length);
		view.setResults(core.getResults());
		view.setRules(core.getRules(), safeApplyBundleFromCore(core, view.query), null);
	};

	core.subscribe(() => {
		repaint();
	});
	repaint();

	return { core, repaint, root };
}

/** The chip button whose visible text matches `label` (throws if absent, so callers avoid `!`). */
function chipByText(root: HTMLElement, label: string): HTMLElement {
	const node = [...root.querySelectorAll<HTMLElement>('.fe-chip')].find((chip) => chip.textContent.trim() === label);

	if (node === undefined) {
		throw new Error(`no chip with text "${label}"`);
	}

	return node;
}

beforeEach(() => {
	document.body.replaceChildren();
});

afterEach(() => {
	// Only the teardown suite at the foot of this file installs a stub; clearing the stubs unconditionally
	// keeps every case above running against jsdom's real (absent) `matchMedia`, which is the
	// environment every other assertion in this file was written under.
	vi.unstubAllGlobals();
});

describe('framework-less <BooksView> parity', () => {
	it('renders the full corpus before any filter is applied', () => {
		const { root } = mountView();

		expect(root.querySelectorAll('.fe-book-card')).toHaveLength(4);
		expect(root.querySelector('.fe-result-count__number')?.textContent).toBe('4');
	});

	it('narrows the count + grid when a genre chip is toggled', () => {
		const { root } = mountView();

		chipByText(root, 'fantasy').click();

		expect(root.querySelectorAll('.fe-book-card')).toHaveLength(2);
		// The count animates via rAF, but `shown` lands on the target synchronously when rAF is absent
		// and the engine's own count is authoritative — assert the engine, then the rendered pills.
		expect(root.querySelectorAll('.fe-filter-chip')).toHaveLength(1);
	});

	it('restores the full set when the active-filter pill is removed', () => {
		const { root } = mountView();

		chipByText(root, 'mystery').click();
		expect(root.querySelectorAll('.fe-book-card')).toHaveLength(1);

		const remove = root.querySelector<HTMLElement>('.fe-filter-chip__remove');

		if (remove === null) {
			throw new Error('expected an active-filter pill with a remove button');
		}
		remove.click();

		expect(root.querySelectorAll('.fe-book-card')).toHaveLength(4);
		expect(root.querySelectorAll('.fe-filter-chip')).toHaveLength(0);
	});

	it('swaps the empty note for the active-filter bar (and back)', () => {
		const { root } = mountView();
		const emptyNote = root.querySelector<HTMLElement>('.fe-active-filters__empty');
		const activeBar = root.querySelector<HTMLElement>('.fe-active-filters');

		// Guard: toggling these with the `hidden` attribute would be silently overridden by the
		// authored `display` on their classes, so they are toggled by inline `display`.
		expect(emptyNote?.style.display).toBe('');
		expect(activeBar?.style.display).toBe('none');

		chipByText(root, 'fantasy').click();

		expect(emptyNote?.style.display).toBe('none');
		expect(activeBar?.style.display).toBe('');
	});

	it('clears every rule via "Clear all"', () => {
		const { core, root } = mountView();

		chipByText(root, 'fantasy').click();
		expect(core.getRules().size).toBeGreaterThan(0);

		const clearAll = root.querySelector<HTMLElement>('.fe-active-filters__clear');

		clearAll?.click();

		expect(root.querySelectorAll('.fe-book-card')).toHaveLength(4);
	});
});

/**
 * Mount the view over a single hand-built book, for the card-rendering assertions.
 *
 * @remarks
 * Separate from `mountView` because these cases each need a DIFFERENT corpus — an out-of-print book,
 * one with six subjects, one with none. Making the shared helper take a corpus would mean every existing
 * test paid for a corpus argument it does not use.
 *
 * @param overrides - Field overrides for the one book rendered.
 * @returns The mounted root.
 */
function mountOneBook(overrides: { readonly id: string } & Partial<Book>): HTMLElement {
	const core = createFilterEngine<Book>({ sourceData: [makeBook(overrides)]});
	const view = createBooksView(core, { busy: createBusyCore(), footnote: 'test', subtitle: appHeaderSubtitle('test') });
	const root = document.createElement('div');

	root.append(view.element);
	document.body.append(root);
	view.setResults(core.getResults());

	return root;
}

describe('card + control parity with React', () => {
	it('renders the format · language · availability meta line', () => {
		const { root } = mountView();
		const meta = root.querySelector('.fe-book-card__meta');

		expect(meta?.textContent).toBe('paperback · english · in print');
	});

	it('omits the availability segment for an out-of-print book, with no trailing separator', () => {
		// The case the `filter` guard exists for. Joining a null straight through yields
		// "paperback · english · " — a line ending in a dangling separator.
		const root = mountOneBook({ id: 'z', isInPrint: false, title: 'Z' });

		expect(root.querySelector('.fe-book-card__meta')?.textContent).toBe('paperback · english');
	});

	it('renders subjects as SEPARATE elements, not one concatenated string', () => {
		// The failure is two genres reading as "romantic-suspensehistorical-romance". Asserting on
		// the element count rather than the text is what distinguishes a correct render from a joined
		// one — a single node containing both words would satisfy any textContent check.
		const root = mountOneBook({ id: 'z', subjects: ['romantic-suspense', 'historical-romance'], title: 'Z' });
		const subjects = [...root.querySelectorAll('.fe-book-card__subject')];

		expect(subjects).toHaveLength(2);
		expect(subjects.map((node) => node.textContent)).toEqual(['romantic-suspense', 'historical-romance']);
	});

	it('caps subjects at four', () => {
		const root = mountOneBook({ id: 'z', subjects: ['a', 'b', 'c', 'd', 'e', 'f'], title: 'Z' });

		expect(root.querySelectorAll('.fe-book-card__subject')).toHaveLength(4);
	});

	it('omits the subjects row entirely when a book has none', () => {
		const root = mountOneBook({ id: 'z', subjects: [], title: 'Z' });

		expect(root.querySelector('.fe-book-card__subjects')).toBeNull();
	});

	it('labels the engine indicator "engine · idle", not a bare state word', () => {
		const { root } = mountView();
		const label = root.querySelector('.fe-computing-indicator__label');

		// Normalized: the label is built from three nodes, so the raw textContent carries the exact
		// spacing between them.
		expect(label?.textContent.replace(/\s+/gu, ' ').trim()).toBe('engine · idle');
		expect(root.querySelector('.fe-computing-indicator__sep')?.textContent).toBe('·');
	});

	it('suffixes the slider values with their units', () => {
		const { root } = mountView();
		const summaries = [...root.querySelectorAll('.fe-range-slider__summary')].map((node) => node.textContent);

		expect(summaries.some((text) => text.includes(' pp'))).toBe(true);
		expect(summaries.some((text) => text.includes('★'))).toBe(true);
	});
});

describe('bookCard', () => {
	// Both cases are the ABSENT half of a field the fixture above always supplies, which is why the
	// mounted suite never reached them: every book in `BOOKS` is in print and rated. They live here
	// rather than in a sibling file so `makeBook` stays single-sourced.

	it('drops the availability clause for an out-of-print book, with no dangling separator', () => {
		// The `filter(Boolean)` exists for exactly this row. Without it the meta line ends in
		// " · " — a separator introducing nothing.
		const inPrint = bookCard(makeBook({ id: 'p', isInPrint: true }));
		const outOfPrint = bookCard(makeBook({ id: 'q', isInPrint: false }));

		expect(inPrint.querySelector('.fe-book-card__meta')?.textContent).toContain('in print');

		const meta = outOfPrint.querySelector('.fe-book-card__meta')?.textContent ?? '';

		expect(meta).not.toContain('in print');
		expect(meta.trim().endsWith('·')).toBe(false);
	});

	it('names an unattributed book rather than leaving the byline blank', () => {
		// `authors.join(', ') || 'Unknown author'` — an empty array joins to `''`, which renders as a
		// card with a title and a silent gap where the byline belongs. Real in this corpus:
		// anthologies and public-domain scans routinely arrive with no attribution.
		const attributed = bookCard(makeBook({ authors: ['U. Le Guin'], id: 't' }));
		const anonymous = bookCard(makeBook({ authors: [], id: 'u' }));

		expect(attributed.querySelector('.fe-book-card__authors')?.textContent).toBe('U. Le Guin');
		expect(anonymous.querySelector('.fe-book-card__authors')?.textContent).toBe('Unknown author');
	});

	it('reads "Unrated" rather than a fabricated score when averageRating is null', () => {
		// `null` is a real state in this corpus — a book nobody has scored — and formatting it as
		// "★ 0.0" would place it below every rated book while claiming a rating it does not have.
		const rated = bookCard(makeBook({ averageRating: 4.25, id: 'r' }));
		const unrated = bookCard(makeBook({ averageRating: null, id: 's' }));

		expect(rated.querySelector('.fe-book-card__rating')?.textContent).toBe('★ 4.3');
		expect(unrated.querySelector('.fe-book-card__rating')?.textContent).toBe('Unrated');
	});
});

/**
 * A corpus long enough that the grid has something left to reveal on a second scroll.
 *
 * @remarks
 * 130 rows, and the number is load-bearing rather than round. `resultsView`'s `BATCH_SIZE` is 60, so
 * 60 render at rest, a first scroll takes it to 120 and a second to 130. **At 61 or even 120 rows the
 * post-dispose assertion would be vacuous** — the grid would already be showing everything it has, so
 * "no growth" would hold whether the scroll listener was detached or perfectly live. That is the trap
 * in miniature: an assertion that cannot fail reads exactly like one that passed.
 */
const MANY: readonly Book[] = Array.from({ length: 130 }, (_, index) =>
	makeBook({ id: `m${String(index)}`, title: `M${String(index)}` }),
);

/**
 * Mount over a controllable `matchMedia`, handing back the view itself so a test can tear it down.
 *
 * @remarks
 * Separate from `mountView` for exactly the reason `mountOneBook` is separate: these cases need two
 * things that helper deliberately does not provide — a `matchMedia` stub installed BEFORE
 * construction (`trackDesktopBreakpoint` reads it once, at construction, so a stub installed after
 * the fact is invisible to it) and a handle on `dispose()`. Threading either through the shared
 * helper would make all fifteen cases above pay for an argument they do not use.
 *
 * @returns The media controller, the mounted root, and the view.
 */
function mountForTeardown(): {
	media: MediaQueryController;
	root: HTMLElement;
	view: BooksView;
} {
	const media = installMatchMedia(DESKTOP_MEDIA_QUERY, true);
	const core = createFilterEngine<Book>({ sourceData: MANY });
	const view = createBooksView(core, { busy: createBusyCore(), footnote: 'test', subtitle: appHeaderSubtitle('test') });
	const root = document.createElement('div');

	root.append(view.element);
	document.body.append(root);
	view.setResults(core.getResults());

	return { media, root, view };
}

/** The grid scroller (throws if absent, so callers avoid `!`). */
function scrollerIn(root: HTMLElement): HTMLElement {
	const node = root.querySelector<HTMLElement>('.fe-result-grid__scroller');

	if (node === null) {
		throw new Error('expected the results grid scroller');
	}

	return node;
}

describe('route teardown + the breakpoint subscription', () => {
	// Both concerns live in four lines of `view.ts` the suite above does not reach — confirmed by
	// mutants rather than inferred: without this block, deleting the whole `dispose` body, and
	// separately deleting the `breakpoint.subscribe(...)` call, both leave this file green.

	it('detaches the matchMedia listener on dispose', () => {
		// A route that leaks its media listener keeps repainting a detached DOM tree after navigation,
		// which costs nothing visible and is therefore never noticed.
		const { media, view } = mountForTeardown();

		expect(media.listenerCount()).toBe(1);

		view.dispose();

		expect(media.listenerCount()).toBe(0);
	});

	it('stops the grid growing on scroll once disposed', () => {
		const { root, view } = mountForTeardown();
		const scroller = scrollerIn(root);
		const cardCount = (): number => root.querySelectorAll('.fe-book-card').length;

		expect(cardCount()).toBe(60);

		// The control half, and it is why this case is trustworthy: jsdom reports every box as 0×0, so
		// `handleScroll`'s near-bottom test is always true here. If the listener is live, one scroll
		// MUST add a batch — so the third assertion below is measuring detachment rather than measuring
		// a grid that had nothing left to give.
		scroller.dispatchEvent(new Event('scroll'));
		expect(cardCount()).toBe(120);

		view.dispose();
		scroller.dispatchEvent(new Event('scroll'));

		expect(cardCount()).toBe(120);
	});

	it('hides the panel behind the Filters button when the viewport crosses to mobile', () => {
		const { media, root } = mountForTeardown();
		const collapse = root.querySelector('.fe-filter-collapse');

		expect(collapse?.hasAttribute('hidden')).toBe(false);

		media.setMatches(false);

		// The ATTRIBUTE, never an inline `display` — `ui-styles` authors `.fe-filter-collapse` as
		// `:not([hidden])` by design, and this is the assertion that would notice a well-meant switch to
		// `setHidden` (the vanilla `hidden`-versus-class gotcha, from the opposite direction).
		expect(collapse?.hasAttribute('hidden')).toBe(true);
	});
});

describe('bookCard — the shared card text', () => {
	it('shows the genre as its stored value, the page count thousands-separated, and the two tooltips', () => {
		const card = bookCard(makeBook({ genre: 'science-fiction', id: 'g', pageCount: 1200 }));

		expect(card.querySelector('.fe-book-card__genre')?.textContent).toBe('science-fiction');
		expect(card.querySelector('.fe-book-card__pages')?.textContent).toBe('1,200 pp');
		expect(card.querySelector('.fe-book-card__year')?.getAttribute('title')).toBe('Publication year');
		expect(card.querySelector('.fe-book-card__rating')?.getAttribute('title')).toBe('Average rating');
	});
});

describe('books panel — copy, predictive disable and busy', () => {
	/**
	 * Mount the view with an observable busy core over `data`.
	 *
	 * @param data - The corpus.
	 * @returns The engine, the root and the busy core.
	 */
	function mountWithBusy(data: readonly Book[] = DATA) {
		const core = createFilterEngine<Book>({ sourceData: data });
		const busy = createBusyCore();
		const view = createBooksView(core, { busy, footnote: 'test', subtitle: appHeaderSubtitle('test') });
		const root = document.createElement('div');

		root.append(view.element);
		document.body.append(root);

		const repaint = (): void => {
			view.setCount(core.getResultCount(), data.length);
			view.setResults(core.getResults());
			view.setRules(core.getRules(), safeApplyBundleFromCore(core, view.query), null);
		};

		core.subscribe(repaint);
		repaint();

		return { busy, core, root, view };
	}

	/** A labelled checkbox's input, by its visible label. */
	function checkbox(root: HTMLElement, label: string): HTMLInputElement {
		const row = [...root.querySelectorAll('.fe-books-checkbox')].find((node) => node.textContent === label);
		const input = row?.querySelector('input');

		if (input === null || input === undefined) {
			throw new Error(`no checkbox labelled "${label}"`);
		}

		return input;
	}

	/** A search field by its accessible name. */
	function search(root: HTMLElement, label: string): HTMLInputElement {
		const node = root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);

		if (node === null) {
			throw new Error(`no search field labelled "${label}"`);
		}

		return node;
	}

	/**
	 * Type `text` and press Enter.
	 *
	 * @param field - The field.
	 * @param text - What to type.
	 */
	function typeAndEnter(field: HTMLInputElement, text: string): void {
		field.focus();
		field.value = text;
		field.dispatchEvent(new Event('input', { bubbles: true }));
		field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
	}

	it('labels the sections, toggles and fields with the shared books copy', () => {
		const { root } = mountWithBusy();
		const headings = [...root.querySelectorAll('.fe-filter-section-label')].map((node) => node.textContent);

		expect(headings).toEqual([
			'Genre',
			'Genre super-groups',
			'Format',
			'Language',
			'Description search',
			'Author (typo-tolerant)',
			'ISBN pattern (regex)',
		]);
		expect([...root.querySelectorAll('.fe-books-checkbox')].map((node) => node.textContent)).toEqual([
			'In print only',
			'Has audiobook',
			'Rated only',
			"Editor's picks (top-rated)",
		]);
		expect(root.querySelector('[aria-label="Average-rating range lower bound"]')).not.toBeNull();
		expect(search(root, 'Search authors with typo tolerance').placeholder).toBe('a surname or full name...');
		expect(search(root, 'Filter by ISBN-13 pattern (regular expression)')).toBeDefined();
	});

	it('disables a toggle that would empty the results, with the shared title, but never a checked one', () => {
		const { core, root } = mountWithBusy([
			makeBook({ hasAudiobook: false, id: 'a', isInPrint: true }),
			makeBook({ hasAudiobook: false, id: 'b', isInPrint: false }),
		]);
		const audiobook = checkbox(root, 'Has audiobook');

		expect(audiobook.disabled).toBe(true);
		expect(audiobook.closest('label')?.getAttribute('title')).toBe('No matches given your other filters');
		expect(checkbox(root, 'In print only').disabled).toBe(false);

		checkbox(root, 'In print only').click();
		expect(core.getRules().has('in-print')).toBe(true);
		expect(checkbox(root, 'In print only').disabled).toBe(false);
	});

	it('marks busy for a chip, holds it for a painted frame, then resolves on the engine change', () => {
		vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout']});

		const { busy, root } = mountWithBusy();
		const body = root.querySelector('.fe-books-panel__body');
		const indicator = root.querySelector('.fe-computing-indicator');

		chipByText(root, 'mystery').click();

		expect(busy.getIsEngineBusy()).toBe(true);
		expect(body?.classList.contains('fe-books-panel__body--busy')).toBe(true);
		expect(body?.getAttribute('aria-busy')).toBe('true');
		expect(indicator?.getAttribute('aria-label')).toBe('Engine computing');

		vi.advanceTimersToNextFrame();
		vi.advanceTimersToNextFrame();

		expect(busy.getIsEngineBusy()).toBe(false);
		expect(body?.getAttribute('aria-busy')).toBe('false');
		vi.useRealTimers();
	});

	it('marks busy for Clear all and resolves it', () => {
		vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout']});

		const { busy, core, root } = mountWithBusy();

		chipByText(root, 'mystery').click();
		vi.advanceTimersToNextFrame();
		vi.advanceTimersToNextFrame();
		root.querySelector<HTMLElement>('.fe-active-filters__clear')?.click();

		expect(busy.getIsEngineBusy()).toBe(true);
		expect(core.getRules().size).toBe(0);

		vi.advanceTimersToNextFrame();
		vi.advanceTimersToNextFrame();
		expect(busy.getIsEngineBusy()).toBe(false);
		vi.useRealTimers();
	});

	it('writes an EMPTY-query rule for description and author, and removes the ISBN rule', () => {
		const { core, root } = mountWithBusy();
		const description = search(root, 'Search descriptions');
		const author = search(root, 'Search authors with typo tolerance');
		const isbn = search(root, 'Filter by ISBN-13 pattern (regular expression)');

		typeAndEnter(description, 'sea');
		typeAndEnter(author, 'writer');
		typeAndEnter(isbn, '^978');
		expect((core.getRules().get('text-search') as TextSearchRule | undefined)?.config.query).toBe('sea');
		expect((core.getRules().get('author-search') as FuzzySearchRule | undefined)?.config.query).toBe('writer');
		expect(core.getRules().has('isbn-pattern')).toBe(true);

		typeAndEnter(description, '');
		typeAndEnter(author, '');
		typeAndEnter(isbn, '');

		expect((core.getRules().get('text-search') as TextSearchRule | undefined)?.config.query).toBe('');
		expect((core.getRules().get('author-search') as FuzzySearchRule | undefined)?.config.query).toBe('');
		expect(core.getRules().has('isbn-pattern')).toBe(false);
	});

	it('flags an invalid ISBN pattern in an alert, writes nothing and keeps the typed text', () => {
		const { busy, core, root } = mountWithBusy();
		const isbn = search(root, 'Filter by ISBN-13 pattern (regular expression)');

		typeAndEnter(isbn, '[');

		const alert = root.querySelector('[role="alert"].fe-books-regex-error');

		expect(alert?.textContent).toBe(BOOKS_ISBN_INVALID_MESSAGE);
		expect(core.getRules().has('isbn-pattern')).toBe(false);
		expect(busy.getIsEngineBusy()).toBe(false);

		// Another facet's repaint does not throw the edit away.
		chipByText(root, 'mystery').click();
		expect(isbn.value).toBe('[');

		typeAndEnter(isbn, '^978');
		expect(root.querySelector('.fe-books-regex-error')).toBeNull();
	});

	it('keeps focus on a chip through the repaint its own click causes', () => {
		const { root } = mountWithBusy();
		const chip = chipByText(root, 'mystery');

		chip.focus();
		chip.click();

		expect(document.activeElement).toBe(chip);
		expect(chip.getAttribute('aria-pressed')).toBe('true');
	});
});
