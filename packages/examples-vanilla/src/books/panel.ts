/**
 * `books/panel` — the full books filter panel, hand-built.
 *
 * @remarks
 * Wires the same nine rule types every vertical's books panel demos: Genre / Format / Language
 * (`InSetRule` chips), genre super-groups (`InSetofSetsRule`), Publication year / Rating / Page count
 * (`RangeRule` sliders), In print / Has audiobook (`BooleanRule`), Rated only (`ExistsRule`), Editor's
 * picks (`BloomMembershipRule`), Description (`TextSearchRule`), Author (`FuzzySearchRule`), and an
 * ISBN pattern (`RegexRule`).
 *
 * **The panel is surface-agnostic on purpose.** It takes a bare `FilterEngine` for writes, because the
 * write path is *identical* on both demo routes — `SignalsEngine.core` and the bare engine are the same
 * type. Only the read path differs (per-signal subscriptions vs one coarse re-read), and that lives
 * entirely in the page wiring. So this file is shared verbatim by `/books` and `/books-raw`.
 *
 * Vocabulary, baselines, curated super-groups, the predictive-disable readers and every label and
 * accessible name (`BOOKS_*`) come from the shared `@filter-enginez/examples-shared/books-domain`
 * module — no logic or copy is re-implemented here.
 *
 * Every write marks the books busy tracker first; the view binds that tracker to the body's
 * `--busy` / `aria-busy` and to the header's computing indicator. The controls update in place, so a
 * keyboard user's focus survives their own click and the repaint that follows it.
 *
 * @packageDocumentation
 */

import type { Book, BookGenre } from '@filter-enginez/mock-data/books';

import {
	bloomMembership,
	type BloomMembershipRule,
	bool,
	type BooleanRule,
	exists,
	type ExistsRule,
	type FilterBundle,
	type FilterBundleQuery,
	type FilterEngine,
	type FilterRule,
	fuzzy,
	type FuzzySearchRule,
	inSet,
	inSetofSets,
	type InSetofSetsRule,
	type InSetRule,
	range,
	type RangeRule,
	regex,
	type RegexRule,
	type RuleId,
	text,
	type TextSearchRule,
} from '@filter-enginez/core';
import {
	BOOKS_CHIP_SECTION_LABELS,
	BOOKS_ISBN_INVALID_MESSAGE,
	BOOKS_SEARCH_COPY,
	BOOKS_SLIDER_COPY,
	BOOKS_TOGGLE_LABELS,
	buildBooksBundleQuery,
	buildEditorsPicksFilter,
	chipExclusionMap,
	compilePattern,
	deriveBaseline,
	deriveSelectedGroupKeys,
	fieldBounds,
	fieldHistogram,
	isToggleDisabled,
	nextSuperGroupSets,
	type NumericBounds,
	regexInputValue,
	SUPER_GROUP_KEYS,
	uniqueSorted,
} from '@filter-enginez/examples-shared/books-domain';
import { el } from '@filter-enginez/examples-shared/dom';
import { toggleSetValue } from '@filter-enginez/examples-shared/selection';

import { type Control, createCheckboxControl, createChipToggleGroup } from '../controls/controls.js';
import { createRangeSlider, type RangeSliderState } from '../controls/rangeSlider.js';
import { section } from '../controls/sections.js';
import { createTypeaheadSearch } from '../controls/typeaheadSearch.js';

/** The engine snapshot the panel renders from. */
export interface PanelState {
	/** The engine's active-rule map — every control derives its committed state from this. */
	readonly rules: ReadonlyMap<RuleId, FilterRule>;
	/** The predictive-disable bundle for the current state, or `null` when unavailable. */
	readonly bundle: FilterBundle | null;
}

/** A mounted panel: its root element, the bundle query it needs, and an in-place updater. */
export interface BooksPanel {
	/** Cancel the searches' pending debounced commits. */
	readonly dispose: () => void;
	/** The panel root. */
	readonly element: HTMLElement;
	/** The `applyFiltersAndQuery` query describing every facet this panel predictive-disables. */
	readonly query: FilterBundleQuery;
	/** Dim the body and set `aria-busy` while the books busy tracker says a write is settling. */
	readonly setBusy: (isBusy: boolean) => void;
	/** Re-apply committed engine state to every control. */
	readonly update: (state: PanelState) => void;
}

/** Construction options for {@link createBooksPanel}. */
export interface BooksPanelOptions {
	/** Mark the books busy tracker. Every write below calls it FIRST. */
	readonly markBusy: () => void;
}

/**
 * Build the books filter panel over a bare engine.
 *
 * @param core - The engine every control writes through (identical on both demo routes).
 * @param options - The busy mark every write goes through.
 * @returns The mounted panel + the bundle query its predictive-disable needs.
 */
export function createBooksPanel(core: FilterEngine<Book>, options: BooksPanelOptions): BooksPanel {
	const { markBusy } = options;
	// The corpus is resident + immutable post-boot, so vocabulary, baselines, the Bloom set, and the
	// bundle query are all computed once (the equivalent of the React panel's `useMemo(…, [sourceData])`).
	const corpus = core.getSourceData();
	const genres = uniqueSorted(corpus.map((book) => book.genre));
	const formats = uniqueSorted(corpus.map((book) => book.format));
	const languages = uniqueSorted(corpus.map((book) => book.language));

	const yearBaseline = deriveBaseline(corpus.map((book) => book.publicationYear), { max: 2025, min: 1900 }, 1);
	const pageBaseline = deriveBaseline(corpus.map((book) => book.pageCount), { max: 1500, min: 0 }, 10);
	const ratingBaseline = deriveBaseline(corpus.map((book) => book.averageRating), { max: 5, min: 0 }, 1);

	const editorsPicksFilter = buildEditorsPicksFilter(corpus);

	const query: FilterBundleQuery = buildBooksBundleQuery(
		{ pageCount: pageBaseline, publicationYear: yearBaseline, rating: ratingBaseline },
		{ formats, genres, languages },
	);

	// The four toggles' candidate rules — what each box WOULD add — for predictive disable.
	const inPrintCandidate = bool('isInPrint', true);
	const audiobookCandidate = bool('hasAudiobook', true);
	const ratedCandidate = exists('averageRating');
	const editorsPicksCandidate = bloomMembership('id', editorsPicksFilter);

	// ── Mutations. Every one marks busy, then writes straight through `core` — no framework in the path. ──

	/** Commit a rule, busy mark first. */
	function commit(ruleId: string, rule: FilterRule): void {
		markBusy();
		core.addRule(ruleId, rule);
	}

	/**
	 * Drop a rule, busy mark first — unless there is no rule to drop: that writes nothing, emits no
	 * change, and so would leave the busy state with nothing to resolve it.
	 */
	function remove(ruleId: string): void {
		if (!core.getRules().has(ruleId)) {
			return;
		}
		markBusy();
		core.removeRule(ruleId);
	}

	/** Toggle a chip value in an `InSetRule` (an empty set is a permissive no-op, the books convention). */
	function toggleChip(ruleId: string, field: string, current: readonly string[], value: string): void {
		commit(ruleId, inSet<string>(field, toggleSetValue(current, value)));
	}

	/** Selected super-group labels, derived from the committed array-of-genre-sets. */
	let selectedGroupKeys: readonly string[] = [];
	/** Local invalid flag so a half-typed regex flags without wiping the committed rule. */
	let isIsbnInvalid = false;
	/** The most recent state, so click handlers can read the committed sets synchronously. */
	let latest: PanelState = { bundle: null, rules: new Map() };

	// ── Controls ──
	const genreChips = createChipToggleGroup({
		formatLabel: replaceHyphens,
		onToggle: (value) => {
			toggleChip('genre', 'genre', selectedSet(latest.rules, 'genre'), value);
		},
	});
	const superGroupChips = createChipToggleGroup({
		onToggle: (key) => {
			commit('genre-groups', inSetofSets<BookGenre>('genre', nextSuperGroupSets(selectedGroupKeys, key)));
		},
	});
	const formatChips = createChipToggleGroup({
		formatLabel: replaceHyphens,
		onToggle: (value) => {
			toggleChip('format', 'format', selectedSet(latest.rules, 'format'), value);
		},
	});
	const languageChips = createChipToggleGroup({
		onToggle: (value) => {
			toggleChip('language', 'language', selectedSet(latest.rules, 'language'), value);
		},
	});

	const yearSlider = createRangeSlider({
		ariaLabel: BOOKS_SLIDER_COPY.publicationYear.ariaLabel,
		format: (value) => value.toFixed(0),
		label: BOOKS_SLIDER_COPY.publicationYear.label,
		onChange: (next) => {
			commit('publication-year', range('publicationYear', { max: next.max, min: next.min }));
		},
	});
	const ratingSlider = createRangeSlider({
		ariaLabel: BOOKS_SLIDER_COPY.rating.ariaLabel,
		// Unit-suffixed to match React. `parse` has to strip what `format` adds — the inputs are
		// editable, and the default `parseFloat` would read "4.2★" fine but "★" is trailing junk the
		// moment a user retypes the field.
		format: (value) => `${value.toFixed(1)}★`,
		label: BOOKS_SLIDER_COPY.rating.label,
		onChange: (next) => {
			commit('rating', range('averageRating', { max: next.max, min: next.min }));
		},
		parse: (raw) => Number.parseFloat(raw.replace(/[★\s]/gu, '')),
		step: 0.1,
	});
	const pageSlider = createRangeSlider({
		ariaLabel: BOOKS_SLIDER_COPY.pageCount.ariaLabel,
		format: (value) => `${value.toFixed(0)} pp`,
		label: BOOKS_SLIDER_COPY.pageCount.label,
		onChange: (next) => {
			commit('page-count', range('pageCount', { max: next.max, min: next.min }));
		},
		parse: (raw) => Number.parseFloat(raw.replace(/[^0-9.]/gu, '')),
		step: 10,
	});

	const inPrintToggle = createCheckboxControl({
		label: BOOKS_TOGGLE_LABELS.inPrint,
		onToggle: (checked) => {
			commit('in-print', bool('isInPrint', checked ? true : undefined));
		},
	});
	const audiobookToggle = createCheckboxControl({
		label: BOOKS_TOGGLE_LABELS.audiobook,
		onToggle: (checked) => {
			commit('has-audiobook', bool('hasAudiobook', checked ? true : undefined));
		},
	});
	const ratedToggle = createCheckboxControl({
		label: BOOKS_TOGGLE_LABELS.rated,
		onToggle: (checked) => {
			if (checked) {
				commit('has-rating', ratedCandidate);
			} else {
				remove('has-rating');
			}
		},
	});
	const editorsPicksToggle = createCheckboxControl({
		label: BOOKS_TOGGLE_LABELS.editorsPicks,
		onToggle: (checked) => {
			if (checked) {
				commit('editors-picks', editorsPicksCandidate);
			} else {
				remove('editors-picks');
			}
		},
	});

	// The three searches bind the shared typeahead controller. Description and author write a rule
	// even for an empty query — the books convention every vertical keeps — while an empty ISBN
	// pattern removes its rule.
	const descriptionSearch = createTypeaheadSearch({
		ariaLabel: BOOKS_SEARCH_COPY.description.ariaLabel,
		commit: (trimmed) => {
			commit('text-search', text('description', { caseSensitive: false, mode: 'substring', query: trimmed }));
		},
		initialQuery: committedTextQuery(core.getRules()),
		placeholder: BOOKS_SEARCH_COPY.description.placeholder,
	});
	const authorSearch = createTypeaheadSearch({
		ariaLabel: BOOKS_SEARCH_COPY.author.ariaLabel,
		commit: (trimmed) => {
			commit('author-search', fuzzy('authors', { keys: ['authors'], query: trimmed, threshold: 0.3 }));
		},
		initialQuery: committedAuthorQuery(core.getRules()),
		placeholder: BOOKS_SEARCH_COPY.author.placeholder,
	});

	// Inserted only while the pattern is invalid, so the `role="alert"` region announces when it
	// appears rather than sitting in the tree hidden.
	const isbnError = el('p', {
		attrs: { role: 'alert' },
		className: 'fe-books-regex-error',
		text: BOOKS_ISBN_INVALID_MESSAGE,
	});
	const isbnSearch = createTypeaheadSearch({
		ariaLabel: BOOKS_SEARCH_COPY.isbn.ariaLabel,
		commit: (trimmed) => {
			commitIsbn(trimmed);
		},
		initialQuery: committedIsbnQuery(core.getRules()),
		placeholder: BOOKS_SEARCH_COPY.isbn.placeholder,
	});
	const isbnSection = section(BOOKS_SEARCH_COPY.isbn.label, isbnSearch.element);

	/** Show or drop the invalid-pattern alert. */
	function setIsbnInvalid(isInvalid: boolean): void {
		isIsbnInvalid = isInvalid;
		if (isInvalid) {
			isbnSection.append(isbnError);
		} else {
			isbnError.remove();
		}
	}

	/**
	 * Commit an ISBN-13 regex. Empty removes the rule; a valid pattern commits it; an invalid pattern
	 * flags the field and writes nothing — the last good rule stays in place and nothing is marked
	 * busy, because nothing was written.
	 */
	function commitIsbn(trimmed: string): void {
		if (trimmed === '') {
			setIsbnInvalid(false);
			remove('isbn-pattern');

			return;
		}
		const compiled = compilePattern(trimmed);

		if (compiled === null) {
			setIsbnInvalid(true);

			return;
		}
		setIsbnInvalid(false);
		commit('isbn-pattern', regex('isbn13', { pattern: compiled }));
	}

	// The fifth chip-like control is the toggle block; like every vertical's, it has no heading of its
	// own — each box's label says what it filters.
	const body = el('div', {
		attrs: { 'aria-busy': 'false' },
		children: [
			section(BOOKS_CHIP_SECTION_LABELS.genre, genreChips.element),
			section(BOOKS_CHIP_SECTION_LABELS.genreGroups, superGroupChips.element),
			section(BOOKS_CHIP_SECTION_LABELS.format, formatChips.element),
			section(BOOKS_CHIP_SECTION_LABELS.language, languageChips.element),
			yearSlider.element,
			ratingSlider.element,
			pageSlider.element,
			el('section', {
				children: [inPrintToggle.element, audiobookToggle.element, ratedToggle.element, editorsPicksToggle.element],
				className: 'fe-books-toggles',
			}),
			section(BOOKS_SEARCH_COPY.description.label, descriptionSearch.element),
			section(BOOKS_SEARCH_COPY.author.label, authorSearch.element),
			isbnSection,
		],
		className: 'fe-filter-panel__scroller fe-books-panel__body',
	});

	const element = el('div', {
		children: [
			el('div', {
				children: [el('h2', { className: 'fe-books-panel__title', text: 'Filters' })],
				className: 'fe-books-panel__header',
			}),
			body,
		],
		className: 'fe-books-panel',
	});

	return {
		dispose: () => {
			descriptionSearch.dispose();
			authorSearch.dispose();
			isbnSearch.dispose();
		},
		element,
		query,
		setBusy: (isBusy) => {
			// `--busy` dims the body and blocks pointer events while a write settles, as in every
			// vertical's books panel.
			body.classList.toggle('fe-books-panel__body--busy', isBusy);
			body.setAttribute('aria-busy', String(isBusy));
		},
		update: (state) => {
			latest = state;
			const { bundle, rules } = state;
			// The books engine is main-thread, so the core's results are already the post-write set the
			// toggles' predictive disable must test against.
			const results = core.getResults();

			selectedGroupKeys = deriveSelectedGroupKeys(
				(rules.get('genre-groups') as InSetofSetsRule<BookGenre> | undefined)?.config.set ?? [],
			);

			genreChips.update({
				exclusion: chipExclusionMap(bundle, 'genre'),
				options: genres,
				selected: selectedSet(rules, 'genre'),
			});
			superGroupChips.update({
				exclusion: chipExclusionMap(bundle, 'genre-groups'),
				options: SUPER_GROUP_KEYS,
				selected: selectedGroupKeys,
			});
			formatChips.update({
				exclusion: chipExclusionMap(bundle, 'format'),
				options: formats,
				selected: selectedSet(rules, 'format'),
			});
			languageChips.update({
				exclusion: chipExclusionMap(bundle, 'language'),
				options: languages,
				selected: selectedSet(rules, 'language'),
			});

			updateSlider(yearSlider, rules, 'publication-year', yearBaseline, bundle);
			updateSlider(ratingSlider, rules, 'rating', ratingBaseline, bundle);
			updateSlider(pageSlider, rules, 'page-count', pageBaseline, bundle);

			const isInPrint = (rules.get('in-print') as BooleanRule | undefined)?.config === true;
			const hasAudiobook = (rules.get('has-audiobook') as BooleanRule | undefined)?.config === true;
			const isRated = (rules.get('has-rating') as ExistsRule | undefined) !== undefined;
			const isEditorsPick = (rules.get('editors-picks') as BloomMembershipRule | undefined) !== undefined;

			// `isToggleDisabled` never disables a CHECKED box, so a dead end can always be undone.
			inPrintToggle.update({ checked: isInPrint, disabled: isToggleDisabled(isInPrint, results, inPrintCandidate) });
			audiobookToggle.update({
				checked: hasAudiobook,
				disabled: isToggleDisabled(hasAudiobook, results, audiobookCandidate),
			});
			ratedToggle.update({ checked: isRated, disabled: isToggleDisabled(isRated, results, ratedCandidate) });
			editorsPicksToggle.update({
				checked: isEditorsPick,
				disabled: isToggleDisabled(isEditorsPick, results, editorsPicksCandidate),
			});

			descriptionSearch.adopt(committedTextQuery(rules));
			authorSearch.adopt(committedAuthorQuery(rules));
			// While the typed pattern is invalid the field keeps it, beside its alert: adopting the last
			// valid rule would throw the user's edit away.
			if (!isIsbnInvalid) {
				isbnSearch.adopt(committedIsbnQuery(rules));
			}
		},
	};
}

/**
 * The committed description query (`''` when the rule is absent).
 *
 * @internal
 */
function committedTextQuery(rules: ReadonlyMap<RuleId, FilterRule>): string {
	return (rules.get('text-search') as TextSearchRule | undefined)?.config.query ?? '';
}

/**
 * The committed author query (`''` when the rule is absent).
 *
 * @internal
 */
function committedAuthorQuery(rules: ReadonlyMap<RuleId, FilterRule>): string {
	return (rules.get('author-search') as FuzzySearchRule | undefined)?.config.query ?? '';
}

/**
 * The committed ISBN pattern, as the field shows it (`''` when the rule is absent).
 *
 * @internal
 */
function committedIsbnQuery(rules: ReadonlyMap<RuleId, FilterRule>): string {
	return regexInputValue((rules.get('isbn-pattern') as RegexRule | undefined)?.config.pattern.source);
}

/**
 * The committed value set of an `InSetRule` (empty when the rule is absent).
 *
 * @internal
 */
function selectedSet(rules: ReadonlyMap<RuleId, FilterRule>, ruleId: string): readonly string[] {
	return (rules.get(ruleId) as InSetRule<string> | undefined)?.config.set ?? [];
}

/**
 * Push a range rule's committed bounds, available zone and distribution into its slider.
 *
 * @remarks
 * Takes the BUNDLE rather than a pre-read `available`, so both bundle reads happen in one place
 * rather than being spelled out at each of the three call sites.
 *
 * @internal
 */
function updateSlider(
	slider: Control<RangeSliderState>,
	rules: ReadonlyMap<RuleId, FilterRule>,
	ruleId: string,
	baseline: NumericBounds,
	bundle: FilterBundle | null,
): void {
	const rule = rules.get(ruleId) as RangeRule | undefined;
	const valueMax = rule?.config.max ?? baseline.max;
	const valueMin = rule?.config.min ?? baseline.min;

	slider.update({
		available: fieldBounds(bundle, ruleId) ?? baseline,
		baseline,
		histogram: fieldHistogram(bundle, ruleId, valueMin, valueMax),
		valueMax,
		valueMin,
	});
}

/**
 * Render a kebab-cased vocabulary value as spaced words (`graphic-novel` → `graphic novel`).
 *
 * @internal
 */
function replaceHyphens(value: string): string {
	return value.replace(/-/gu, ' ');
}
