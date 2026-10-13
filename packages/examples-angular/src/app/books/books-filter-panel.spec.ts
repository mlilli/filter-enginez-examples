/**
 * Tests for `<fe-books-filter-panel>` — the nine-rule panel.
 *
 * @remarks
 * These run over a REAL engine (`createRxJsEngine(buildBooksEngine(fixture))`) rather than a mocked
 * one. A mock would let the panel write any shape it liked and still pass; the whole value of this
 * spec is the assertion that a given control produces a specific, correctly-typed rule on a real
 * engine, so a wiring slip (right rule, wrong field; right field, wrong rule id) fails loudly.
 *
 * Four things are pinned deliberately:
 *
 * **The control → rule table.** Fourteen controls, nine rule types — the panel's actual contract with
 * the engine, and the part most likely to be broken by a well-meaning refactor.
 *
 * **The `bool(field, undefined)` / `removeRule` asymmetry.** Unchecking a boolean leaves a PERMISSIVE
 * rule registered; unchecking "Rated only" or "Editor's picks" REMOVES theirs. That looks like an
 * inconsistency and is not — diverging would change what "Clear all" means on this route only.
 *
 * **Selection is derived, not mirrored.** `engine.core.clearRules()` is performed behind the panel's
 * back; the controls must come back empty anyway, because they read `activeRules$`.
 *
 * **The ISBN escape hatch.** A half-typed character class must not disturb the engine at all — a
 * mid-keystroke result flicker is worse than a stale result.
 *
 * The fixture is ten hand-written books rather than the real corpus so every assertion is exact and
 * the predictive-disable projection stays legible.
 *
 * @packageDocumentation
 */

import type { Book, BookFormat, BookGenre } from '@filter-enginez/mock-data/books';

import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideEngineBusy, provideFilterEngine } from '@filter-enginez/angular-rxjs';
import {
	BloomMembershipRule,
	BooleanRule,
	ExistsRule,
	FuzzySearchRule,
	InSetofSetsRule,
	InSetRule,
	RangeRule,
	RegexRule,
	text,
	TextSearchRule,
} from '@filter-enginez/core';
import { buildBooksEngine } from '@filter-enginez/examples-shared/books-core';
import {
	createEngineBusyStream,
	createRxJsEngine,
	type EngineBusyStream,
	type RxJsEngine,
} from '@filter-enginez/reactive-rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BooksFilterPanelComponent } from './books-filter-panel.component.js';

/** Index of each chip group in template order. */
const CHIP_GROUP = { format: 2, genre: 0, language: 3, superGroup: 1 } as const;

/** Index of each checkbox in template order. */
const CHECKBOX = { audiobook: 1, editorsPicks: 3, inPrint: 0, rated: 2 } as const;

/** Index of each search field in template order. */
const SEARCH = { author: 1, description: 0, isbn: 2 } as const;

/** Index of each slider bound input in template order (two per slider). */
const SLIDER = { pageMin: 4, ratingMin: 2, yearMin: 0 } as const;

/**
 * Build one fixture book, defaulting every field the panel doesn't read.
 *
 * @param overrides - The fields this test actually cares about.
 * @returns A structurally complete `Book`.
 */
function makeBook(overrides: Partial<Book> & Pick<Book, 'id'>): Book {
	return {
		authors: ['Ursula Vernon'],
		averageRating: 4,
		coverImage: 'cover.jpg',
		description: 'a quiet book about nothing much',
		format: 'paperback',
		genre: 'fantasy',
		hasAudiobook: false,
		isbn13: '9780000000000',
		isInPrint: true,
		language: 'en',
		lastUpdated: '2026-01-01T00:00:00.000Z',
		openLibraryId: `OL${overrides.id}`,
		pageCount: 300,
		popularityScore: 10,
		publicationYear: 2000,
		publisher: 'Fixture Press',
		subjects: [],
		subtitle: '',
		tier: 'default',
		title: `Title ${overrides.id}`,
		...overrides,
	};
}

/** `[genre, format, language, publicationYear, averageRating, pageCount, isInPrint, hasAudiobook]`. */
type FixtureRow = readonly [BookGenre, BookFormat, string, number, number | null, number, boolean, boolean];

/**
 * Ten books with hand-chosen facets, one row each.
 *
 * Genres resolve to `fantasy | mystery | science`, formats to `ebook | hardcover | paperback`,
 * languages to `en | fr`. Ratings span 2.9–4.9 with two nulls (so `ExistsRule` has something to do)
 * and four at or above 4.5 (so the Editor's-picks Bloom set is non-empty). Years span 1990–2020 and
 * page counts 100–900, which makes the three slider baselines exactly predictable. Each row's index
 * becomes the fifth ISBN digit, so `^97801` matches exactly one book.
 */
const FIXTURE_ROWS: readonly FixtureRow[] = [
	['fantasy', 'hardcover', 'en', 1990, 4.8, 100, true, true],
	['fantasy', 'paperback', 'en', 2000, 3.5, 200, true, false],
	['mystery', 'ebook', 'en', 2005, null, 300, false, true],
	['mystery', 'hardcover', 'fr', 2010, 4.9, 400, true, true],
	['science', 'paperback', 'fr', 2015, 4, 500, true, false],
	['science', 'ebook', 'en', 2020, 3.2, 600, false, true],
	['fantasy', 'ebook', 'fr', 1995, 4.6, 700, true, true],
	['mystery', 'paperback', 'en', 2018, 2.9, 800, true, false],
	['science', 'hardcover', 'en', 2012, null, 900, false, true],
	['fantasy', 'hardcover', 'fr', 2008, 4.7, 250, true, true],
];

/** The two rows that carry distinguishable free text, keyed by row index. */
const FIXTURE_TEXT: Readonly<Record<number, Partial<Book>>> = {
	0: { description: 'a dystopian tale of a drowned city' },
	1: { authors: ['Margaret Atwood']},
};

/** The corpus the panel boots over. */
const FIXTURE_BOOKS: readonly Book[] = FIXTURE_ROWS.map(
	(
		[genre, format, language, publicationYear, averageRating, pageCount, isInPrint, hasAudiobook],
		index,
	) =>
		makeBook({
			averageRating,
			format,
			genre,
			hasAudiobook,
			id: `b${index}`,
			isbn13: `9780${index}00000000`,
			isInPrint,
			language,
			pageCount,
			publicationYear,
			...FIXTURE_TEXT[index],
		}),
);

describe('BooksFilterPanelComponent', () => {
	let busy: EngineBusyStream;
	let engine: RxJsEngine<Book>;
	let fixture: ComponentFixture<BooksFilterPanelComponent>;

	/** The chip buttons of one group, in vocabulary order. */
	const chips = (group: number): HTMLButtonElement[] => {
		const groups = fixture.nativeElement.querySelectorAll('fe-chip-toggle-group');

		return Array.from<HTMLButtonElement>(
			(groups[group] as HTMLElement | undefined)?.querySelectorAll('button') ?? [],
		);
	};

	/** One chip group's visible labels, comma-joined. */
	const chipLabels = (group: number): string =>
		chips(group)
			.map((button) => button.textContent.trim())
			.join(',');

	/** Every checkbox, in template order. */
	const checkboxes = (): HTMLInputElement[] =>
		Array.from<HTMLInputElement>(
			fixture.nativeElement.querySelectorAll('fe-checkbox-control input'),
		);

	/** Every free-text field, in template order. */
	const searchFields = (): HTMLInputElement[] =>
		Array.from<HTMLInputElement>(fixture.nativeElement.querySelectorAll('fe-search-input input'));

	/** Every slider bound input, lower-then-upper per slider. */
	const sliderFields = (): HTMLInputElement[] =>
		Array.from<HTMLInputElement>(fixture.nativeElement.querySelectorAll('.fe-range-slider__input'));

	/** Whatever rule currently sits under `ruleId`. */
	const ruleFor = (ruleId: string): unknown => engine.core.getRules().get(ruleId);

	/** Click a chip and settle change detection. */
	const clickChip = (group: number, index: number): void => {
		chips(group)[index]?.click();
		fixture.detectChanges();
	};

	/** Toggle a checkbox and settle change detection. */
	const clickCheckbox = (index: number): void => {
		checkboxes()[index]?.click();
		fixture.detectChanges();
	};

	/**
	 * Type into a free-text field and blur it, which is how the panel commits text.
	 *
	 * @remarks
	 * The `detectChanges()` between the two events is REQUIRED, not tidiness. `<fe-search-input>`
	 * emits `commit` with its own `value()` input signal, which only receives the panel's mirror after
	 * change detection runs — without the flush the blur commits the PREVIOUS text and the test passes
	 * for the wrong reason.
	 *
	 * @param index - Which field.
	 * @param value - The text to type.
	 */
	const commitSearch = (index: number, value: string): void => {
		const field = searchFields()[index];

		if (field === undefined) {
			throw new Error(`missing search field ${index}`);
		}
		field.value = value;
		field.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		field.dispatchEvent(new Event('blur'));
		fixture.detectChanges();
	};

	/** Type into a slider bound input and blur it, which is how the slider commits. */
	const commitSlider = (index: number, value: string): void => {
		const field = sliderFields()[index];

		if (field === undefined) {
			throw new Error(`missing slider field ${index}`);
		}
		field.value = value;
		field.dispatchEvent(new Event('input'));
		field.dispatchEvent(new Event('blur'));
		fixture.detectChanges();
	};

	beforeEach(async () => {
		engine = createRxJsEngine(buildBooksEngine(FIXTURE_BOOKS));
		busy = createEngineBusyStream();

		await TestBed.configureTestingModule({
			imports: [BooksFilterPanelComponent],
			providers: [provideFilterEngine(engine), provideEngineBusy(busy)],
		}).compileComponents();

		fixture = TestBed.createComponent(BooksFilterPanelComponent);
		fixture.detectChanges();
	});

	afterEach(() => {
		busy.dispose();
	});

	it('renders one chip per distinct facet value, sorted', () => {
		expect(chipLabels(CHIP_GROUP.genre)).toBe('fantasy,mystery,science');
		expect(chipLabels(CHIP_GROUP.format)).toBe('ebook,hardcover,paperback');
		expect(chipLabels(CHIP_GROUP.language)).toBe('en,fr');
		// The super-groups are curated, not derived — always five regardless of the corpus.
		expect(chips(CHIP_GROUP.superGroup)).toHaveLength(5);
	});

	describe('every commit path writes the rule it claims to', () => {
		it('genre chip → InSetRule on `genre`', () => {
			clickChip(CHIP_GROUP.genre, 0);

			const rule = ruleFor('genre');

			expect(rule).toBeInstanceOf(InSetRule);
			expect((rule as InSetRule<string>).field).toBe('genre');
			expect((rule as InSetRule<string>).config.set).toEqual(['fantasy']);

			// Toggling a chip OFF commits the reduced set rather than removing the rule.
			clickChip(CHIP_GROUP.genre, 1);
			clickChip(CHIP_GROUP.genre, 0);

			expect((ruleFor('genre') as InSetRule<string>).config.set).toEqual(['mystery']);
		});

		it('format chip → InSetRule on `format`', () => {
			clickChip(CHIP_GROUP.format, 1);

			const rule = ruleFor('format');

			expect(rule).toBeInstanceOf(InSetRule);
			expect((rule as InSetRule<string>).field).toBe('format');
			expect((rule as InSetRule<string>).config.set).toEqual(['hardcover']);
		});

		it('language chip → InSetRule on `language`', () => {
			clickChip(CHIP_GROUP.language, 1);

			const rule = ruleFor('language');

			expect(rule).toBeInstanceOf(InSetRule);
			expect((rule as InSetRule<string>).config.set).toEqual(['fr']);
		});

		it('super-group chip → InSetofSetsRule carrying the whole curated set', () => {
			// The chip's label is "Speculative"; what reaches the engine is its genre membership. That
			// translation is the reason the rule type exists, so it gets asserted rather than assumed.
			clickChip(CHIP_GROUP.superGroup, 4);

			const rule = ruleFor('genre-groups');

			expect(rule).toBeInstanceOf(InSetofSetsRule);
			expect((rule as InSetofSetsRule<BookGenre>).field).toBe('genre');
			expect((rule as InSetofSetsRule<BookGenre>).config.set).toEqual([
				['fantasy', 'science-fiction'],
			]);
		});

		it('publication-year slider → RangeRule on `publicationYear`', () => {
			commitSlider(SLIDER.yearMin, '2000');

			const rule = ruleFor('publication-year');

			expect(rule).toBeInstanceOf(RangeRule);
			expect((rule as RangeRule).field).toBe('publicationYear');
			expect((rule as RangeRule).config.min).toBe(2000);
		});

		it('rating slider → RangeRule on `averageRating`', () => {
			commitSlider(SLIDER.ratingMin, '4.0★');

			const rule = ruleFor('rating');

			expect(rule).toBeInstanceOf(RangeRule);
			expect((rule as RangeRule).field).toBe('averageRating');
			expect((rule as RangeRule).config.min).toBeCloseTo(4, 5);
		});

		it('page-count slider → RangeRule on `pageCount`', () => {
			commitSlider(SLIDER.pageMin, '300 pp');

			const rule = ruleFor('page-count');

			expect(rule).toBeInstanceOf(RangeRule);
			expect((rule as RangeRule).field).toBe('pageCount');
			expect((rule as RangeRule).config.min).toBe(300);
		});

		it('"In print only" → BooleanRule on `isInPrint`', () => {
			clickCheckbox(CHECKBOX.inPrint);

			const rule = ruleFor('in-print');

			expect(rule).toBeInstanceOf(BooleanRule);
			expect((rule as BooleanRule).field).toBe('isInPrint');
			expect((rule as BooleanRule).config).toBe(true);
		});

		it('"Has audiobook" → BooleanRule on `hasAudiobook`', () => {
			clickCheckbox(CHECKBOX.audiobook);

			const rule = ruleFor('has-audiobook');

			expect(rule).toBeInstanceOf(BooleanRule);
			expect((rule as BooleanRule).field).toBe('hasAudiobook');
			expect((rule as BooleanRule).config).toBe(true);
		});

		it('"Rated only" → ExistsRule on `averageRating`', () => {
			clickCheckbox(CHECKBOX.rated);

			const rule = ruleFor('has-rating');

			expect(rule).toBeInstanceOf(ExistsRule);
			expect((rule as ExistsRule).field).toBe('averageRating');
			// Two fixture books have a null rating; the rule has to actually drop them.
			expect(engine.core.getResultCount()).toBe(8);
		});

		it('"Editor\'s picks" → BloomMembershipRule on `id`', () => {
			clickCheckbox(CHECKBOX.editorsPicks);

			const rule = ruleFor('editors-picks');

			expect(rule).toBeInstanceOf(BloomMembershipRule);
			expect((rule as BloomMembershipRule).field).toBe('id');
		});

		it('description search → TextSearchRule on `description`', () => {
			commitSearch(SEARCH.description, '  dystopian  ');

			const rule = ruleFor('text-search');

			expect(rule).toBeInstanceOf(TextSearchRule);
			expect((rule as TextSearchRule).field).toBe('description');
			// The query is trimmed on commit — trailing whitespace from a paste must not be searched for.
			expect((rule as TextSearchRule).config).toMatchObject({
				caseSensitive: false,
				mode: 'substring',
				query: 'dystopian',
			});
			expect(engine.core.getResultCount()).toBe(1);
		});

		it('author search → FuzzySearchRule on `authors`', () => {
			commitSearch(SEARCH.author, 'Atwood');

			const rule = ruleFor('author-search');

			expect(rule).toBeInstanceOf(FuzzySearchRule);
			expect((rule as FuzzySearchRule).field).toBe('authors');
			expect((rule as FuzzySearchRule).config).toMatchObject({
				keys: ['authors'],
				query: 'Atwood',
				threshold: 0.3,
			});
		});

		it('ISBN pattern → RegexRule on `isbn13`', () => {
			commitSearch(SEARCH.isbn, '^97801');

			const rule = ruleFor('isbn-pattern');

			expect(rule).toBeInstanceOf(RegexRule);
			expect((rule as RegexRule).field).toBe('isbn13');
			expect((rule as RegexRule).config.pattern.source).toBe('^97801');
			expect(engine.core.getResultCount()).toBe(1);
		});

		it('marks a user action before each commit, so the busy indicator leads the engine', () => {
			expect(busy.getIsBusy()).toBe(false);

			clickChip(CHIP_GROUP.genre, 0);

			expect(busy.getIsBusy()).toBe(true);
		});
	});

	describe('the boolean-permissive / rule-removal asymmetry', () => {
		it('leaves a PERMISSIVE BooleanRule registered when a boolean is unchecked', () => {
			clickCheckbox(CHECKBOX.inPrint);
			clickCheckbox(CHECKBOX.inPrint);

			const rule = ruleFor('in-print');

			// Still registered — with an undefined config, which the rule treats as "don't care".
			expect(rule).toBeInstanceOf(BooleanRule);
			expect((rule as BooleanRule).config).toBeUndefined();
			expect(engine.core.getResultCount()).toBe(FIXTURE_BOOKS.length);
		});

		it('REMOVES the rule when "Rated only" is unchecked', () => {
			clickCheckbox(CHECKBOX.rated);
			clickCheckbox(CHECKBOX.rated);

			expect(ruleFor('has-rating')).toBeUndefined();
		});

		it('REMOVES the rule when "Editor\'s picks" is unchecked', () => {
			clickCheckbox(CHECKBOX.editorsPicks);
			clickCheckbox(CHECKBOX.editorsPicks);

			expect(ruleFor('editors-picks')).toBeUndefined();
		});

		it('keeps the checkbox states honest across the asymmetry', () => {
			// The two families read their checked state differently — booleans inspect `config`,
			// exists/bloom inspect PRESENCE — so a shared assertion is worth having.
			clickCheckbox(CHECKBOX.inPrint);
			clickCheckbox(CHECKBOX.rated);

			expect(checkboxes()[CHECKBOX.inPrint]?.checked).toBe(true);
			expect(checkboxes()[CHECKBOX.rated]?.checked).toBe(true);

			clickCheckbox(CHECKBOX.inPrint);
			clickCheckbox(CHECKBOX.rated);

			expect(checkboxes()[CHECKBOX.inPrint]?.checked).toBe(false);
			expect(checkboxes()[CHECKBOX.rated]?.checked).toBe(false);
		});

		it('removes the text rules rather than committing an empty query', () => {
			// Whitespace-only counts as empty — a rule matching `''` would be a silent no-op that still
			// shows up as an active filter pill.
			commitSearch(SEARCH.description, 'dystopian');
			commitSearch(SEARCH.author, 'Atwood');
			commitSearch(SEARCH.description, '   ');
			commitSearch(SEARCH.author, '');

			expect(ruleFor('text-search')).toBeUndefined();
			expect(ruleFor('author-search')).toBeUndefined();
		});
	});

	describe('selection is derived from engine state, never mirrored', () => {
		it('reflects an external clearRules() without being told', () => {
			// Performed behind the panel's back — exactly what "Clear all" and pill removal do from
			// elsewhere in the route. If any control kept a private copy of its selection, it would
			// still be showing it here.
			clickChip(CHIP_GROUP.genre, 0);
			clickChip(CHIP_GROUP.format, 1);
			clickCheckbox(CHECKBOX.rated);
			commitSlider(SLIDER.yearMin, '2000');

			expect(chips(CHIP_GROUP.genre)[0]?.getAttribute('aria-pressed')).toBe('true');

			engine.core.clearRules();
			fixture.detectChanges();

			expect(chips(CHIP_GROUP.genre)[0]?.getAttribute('aria-pressed')).toBe('false');
			expect(chips(CHIP_GROUP.format)[1]?.getAttribute('aria-pressed')).toBe('false');
			expect(checkboxes()[CHECKBOX.rated]?.checked).toBe(false);
			expect(sliderFields()[SLIDER.yearMin]?.value).toBe('1990');
		});

		it('reflects a rule added directly to the engine', () => {
			engine.core.addRule(
				'text-search',
				text('description', { caseSensitive: false, mode: 'substring', query: 'drowned' }),
			);
			fixture.detectChanges();

			// The text mirrors are the one place a local copy exists; an effect re-seeds them from the
			// committed rule, which is what lets a URL restore populate the inputs.
			expect(searchFields()[SEARCH.description]?.value).toBe('drowned');
		});

		it('re-seeds the text mirrors to empty when their rules are cleared', () => {
			commitSearch(SEARCH.description, 'dystopian');
			commitSearch(SEARCH.author, 'Atwood');
			commitSearch(SEARCH.isbn, '^97801');

			expect(searchFields()[SEARCH.description]?.value).toBe('dystopian');

			engine.core.clearRules();
			fixture.detectChanges();

			expect(searchFields()[SEARCH.description]?.value).toBe('');
			expect(searchFields()[SEARCH.author]?.value).toBe('');
			expect(searchFields()[SEARCH.isbn]?.value).toBe('');
		});
	});

	describe('the ISBN invalid-pattern path', () => {
		it('flags the error, leaves the engine untouched, and keeps the last good rule', () => {
			commitSearch(SEARCH.isbn, '^97801');

			const goodRule = ruleFor('isbn-pattern');
			const rulesBefore = engine.core.getRules().size;

			commitSearch(SEARCH.isbn, '^[97801');

			expect(fixture.nativeElement.querySelector('.fe-books-regex-error')).not.toBeNull();
			// Identity, not equality: the engine was never written to, so it must be the SAME object.
			expect(ruleFor('isbn-pattern')).toBe(goodRule);
			expect(engine.core.getRules().size).toBe(rulesBefore);
		});

		it('does not mark a user action while the pattern will not compile', () => {
			// A mid-typing character class would otherwise leave the "computing" indicator lit with no
			// engine work ever arriving to clear it.
			commitSearch(SEARCH.isbn, '^[97801');

			expect(busy.getIsBusy()).toBe(false);
		});

		it('clears the error once the pattern compiles again', () => {
			commitSearch(SEARCH.isbn, '^[97801');
			commitSearch(SEARCH.isbn, '^978');

			expect(fixture.nativeElement.querySelector('.fe-books-regex-error')).toBeNull();
			expect(ruleFor('isbn-pattern')).toBeInstanceOf(RegexRule);
		});

		it('clears the error and removes the rule on an emptied field', () => {
			commitSearch(SEARCH.isbn, '^[97801');
			commitSearch(SEARCH.isbn, '');

			expect(fixture.nativeElement.querySelector('.fe-books-regex-error')).toBeNull();
			expect(ruleFor('isbn-pattern')).toBeUndefined();
		});
	});

	describe('predictive disable', () => {
		it('dims a super-group whose genres are absent from the corpus', () => {
			// "Fiction & drama" covers children / fiction / romance / young-adult, none of which the
			// fixture contains — the projection should report zero and the chip should be unavailable
			// from the very first render (the synchronous `initialValue` on the bundle signal).
			expect(chips(CHIP_GROUP.superGroup)[0]?.disabled).toBe(true);
			expect(chips(CHIP_GROUP.genre)[0]?.disabled).toBe(false);
		});

		it('re-projects after a commit so a newly-impossible combination goes dim', async () => {
			// With `genre = science` committed, adding the "Speculative" (fantasy / science-fiction) or
			// "Mystery & thriller" super-group would intersect to nothing, while "Knowledge & ideas"
			// (which contains `science`) still would not. This is the `_lastChangeEvent` anchor doing its
			// job — remove it and the projection silently freezes at its boot values, which looks
			// entirely normal.
			clickChip(CHIP_GROUP.genre, 2);
			await fixture.whenStable();
			fixture.detectChanges();

			expect(chips(CHIP_GROUP.superGroup)[4]?.disabled).toBe(true);
			expect(chips(CHIP_GROUP.superGroup)[3]?.disabled).toBe(true);
			expect(chips(CHIP_GROUP.superGroup)[1]?.disabled).toBe(false);
		});
	});

	it('shows its heading by default and hides it on request (the mobile drawer supplies its own)', () => {
		expect(fixture.nativeElement.querySelector('.fe-books-panel__title')?.textContent).toBe(
			'Filters',
		);

		// A signal `input()` does not reach the component until change detection runs.
		fixture.componentRef.setInput('isHeaderVisible', false);
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('.fe-books-panel__title')).toBeNull();
	});
});
