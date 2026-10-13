/**
 * `books/panel` — the full books filter panel, hand-built.
 *
 * @remarks
 * Wires the same nine rule types the React / Vue / Svelte panels demo: Genre / Format / Language
 * (`InSetRule` chips), genre super-groups (`InSetofSetsRule`), Publication year / Rating / Page count
 * (`RangeRule` sliders), In print / Has audiobook (`BooleanRule`), Rated only (`ExistsRule`), Editor's
 * picks (`BloomMembershipRule`), Description (`TextSearchRule`), Authors (`FuzzySearchRule`), and an
 * ISBN pattern (`RegexRule`).
 *
 * **The panel is surface-agnostic on purpose.** It takes a bare `FilterEngine` for writes, because the
 * write path is *identical* on both demo routes — `SignalsEngine.core` and the bare engine are the same
 * type. Only the read path differs (per-signal subscriptions vs one coarse re-read), and that lives
 * entirely in the page wiring. So this file is shared verbatim by `/books` and `/books-raw`.
 *
 * Vocabulary, baselines, curated super-groups, and the predictive-disable readers all come from the
 * shared `@filter-enginez/examples-shared/books-domain` module — no logic is re-implemented here.
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
	buildBooksBundleQuery,
	buildEditorsPicksFilter,
	chipExclusionMap,
	compilePattern,
	deriveBaseline,
	deriveSelectedGroupKeys,
	fieldBounds,
	fieldHistogram,
	nextSuperGroupSets,
	type NumericBounds,
	regexInputValue,
	SUPER_GROUP_KEYS,
	uniqueSorted,
} from '@filter-enginez/examples-shared/books-domain';
import { el, setHidden } from '@filter-enginez/examples-shared/dom';
import { toggleSetValue } from '@filter-enginez/examples-shared/selection';

import { type Control, createCheckboxControl, createChipToggleGroup, createSearchInput } from '../controls/controls.js';
import { createRangeSlider, type RangeSliderState } from '../controls/rangeSlider.js';
import { section } from '../controls/sections.js';

/** The engine snapshot the panel renders from. */
export interface PanelState {
	/** The engine's active-rule map — every control derives its committed state from this. */
	readonly rules: ReadonlyMap<RuleId, FilterRule>;
	/** The predictive-disable bundle for the current state, or `null` when unavailable. */
	readonly bundle: FilterBundle | null;
}

/** A mounted panel: its root element, the bundle query it needs, and an in-place updater. */
export interface BooksPanel {
	/** The panel root. */
	readonly element: HTMLElement;
	/** The `applyFiltersAndQuery` query describing every facet this panel predictive-disables. */
	readonly query: FilterBundleQuery;
	/** Re-apply committed engine state to every control. */
	readonly update: (state: PanelState) => void;
}

/**
 * Build the books filter panel over a bare engine.
 *
 * @param core - The engine every control writes through (identical on both demo routes).
 * @returns The mounted panel + the bundle query its predictive-disable needs.
 */
export function createBooksPanel(core: FilterEngine<Book>): BooksPanel {
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

	// ── Mutations. Every one writes straight through `core` — no framework in the path. ──

	/** Toggle a chip value in an `InSetRule` (an empty set is a permissive no-op). */
	function toggleChip(ruleId: string, field: string, current: readonly string[], value: string): void {
		const next = toggleSetValue(current, value);

		core.addRule(ruleId, inSet<string>(field, next));
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
			core.addRule('genre-groups', inSetofSets<BookGenre>('genre', nextSuperGroupSets(selectedGroupKeys, key)));
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
		ariaLabel: 'Publication-year range',
		format: (value) => value.toFixed(0),
		label: 'Publication year',
		onChange: (next) => {
			core.addRule('publication-year', range('publicationYear', { max: next.max, min: next.min }));
		},
	});
	const ratingSlider = createRangeSlider({
		ariaLabel: 'Rating range',
		// Unit-suffixed to match React. `parse` has to strip what `format` adds — the inputs are
		// editable, and the default `parseFloat` would read "4.2★" fine but "★" is trailing junk the
		// moment a user retypes the field.
		format: (value) => `${value.toFixed(1)}★`,
		label: 'Rating',
		onChange: (next) => {
			core.addRule('rating', range('averageRating', { max: next.max, min: next.min }));
		},
		parse: (raw) => Number.parseFloat(raw.replace(/[★\s]/gu, '')),
		step: 0.1,
	});
	const pageSlider = createRangeSlider({
		ariaLabel: 'Page-count range',
		format: (value) => `${value.toFixed(0)} pp`,
		label: 'Page count',
		onChange: (next) => {
			core.addRule('page-count', range('pageCount', { max: next.max, min: next.min }));
		},
		parse: (raw) => Number.parseFloat(raw.replace(/[^0-9.]/gu, '')),
		step: 10,
	});

	const inPrintToggle = createCheckboxControl({
		label: 'In print',
		onToggle: (checked) => {
			core.addRule('in-print', bool('isInPrint', checked ? true : undefined));
		},
	});
	const audiobookToggle = createCheckboxControl({
		label: 'Has audiobook',
		onToggle: (checked) => {
			core.addRule('has-audiobook', bool('hasAudiobook', checked ? true : undefined));
		},
	});
	const ratedToggle = createCheckboxControl({
		label: 'Rated only',
		onToggle: (checked) => {
			if (checked) {
				core.addRule('has-rating', exists('averageRating'));
			} else {
				core.removeRule('has-rating');
			}
		},
	});
	const editorsPicksToggle = createCheckboxControl({
		label: "Editor's picks",
		onToggle: (checked) => {
			if (checked) {
				core.addRule('editors-picks', bloomMembership('id', editorsPicksFilter));
			} else {
				core.removeRule('editors-picks');
			}
		},
	});

	const descriptionSearch = createSearchInput({
		ariaLabel: 'Search descriptions',
		onChange: () => undefined,
		onCommit: (value) => {
			core.addRule('text-search', text('description', { caseSensitive: false, mode: 'substring', query: value.trim() }));
		},
		placeholder: 'dystopia, seafaring, coming of age...',
	});
	const authorSearch = createSearchInput({
		ariaLabel: 'Search authors',
		onChange: () => undefined,
		onCommit: (value) => {
			core.addRule('author-search', fuzzy('authors', { keys: ['authors'], query: value.trim(), threshold: 0.3 }));
		},
		placeholder: 'a surname or full name...',
	});

	const isbnError = el('p', { className: 'fe-books-regex-error', text: 'Invalid pattern — showing the last valid filter.' });
	const isbnSearch = createSearchInput({
		ariaLabel: 'ISBN-13 pattern',
		onChange: () => undefined,
		onCommit: (value) => {
			commitIsbn(value);
		},
		placeholder: 'e.g. ^9780',
	});

	/**
	 * Commit an ISBN-13 regex. Empty removes the rule; a valid pattern commits it; an invalid pattern
	 * flags the field and leaves the last good rule in place — a half-typed `[` never throws.
	 */
	function commitIsbn(value: string): void {
		const trimmed = value.trim();

		if (trimmed === '') {
			isIsbnInvalid = false;
			setHidden(isbnError, true);
			core.removeRule('isbn-pattern');

			return;
		}
		const compiled = compilePattern(trimmed);

		if (compiled === null) {
			isIsbnInvalid = true;
			setHidden(isbnError, false);

			return;
		}
		isIsbnInvalid = false;
		setHidden(isbnError, true);
		core.addRule('isbn-pattern', regex('isbn13', { pattern: compiled }));
	}

	setHidden(isbnError, true);

	const body = el('div', {
		children: [
			section('Genre', genreChips.element),
			section('Genre super-groups', superGroupChips.element),
			section('Format', formatChips.element),
			section('Language', languageChips.element),
			yearSlider.element,
			ratingSlider.element,
			pageSlider.element,
			section(
				'Availability',
				el('div', {
					children: [inPrintToggle.element, audiobookToggle.element, ratedToggle.element, editorsPicksToggle.element],
					className: 'fe-books-toggles',
				}),
			),
			section('Description', descriptionSearch.element),
			section('Authors', authorSearch.element),
			section('ISBN pattern', el('div', { children: [isbnSearch.element, isbnError]})),
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
		element,
		query,
		update: (state) => {
			latest = state;
			const { bundle, rules } = state;

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

			inPrintToggle.update({ checked: (rules.get('in-print') as BooleanRule | undefined)?.config === true });
			audiobookToggle.update({ checked: (rules.get('has-audiobook') as BooleanRule | undefined)?.config === true });
			ratedToggle.update({ checked: (rules.get('has-rating') as ExistsRule | undefined) !== undefined });
			editorsPicksToggle.update({
				checked: (rules.get('editors-picks') as BloomMembershipRule | undefined) !== undefined,
			});

			descriptionSearch.update((rules.get('text-search') as TextSearchRule | undefined)?.config.query ?? '');
			authorSearch.update((rules.get('author-search') as FuzzySearchRule | undefined)?.config.query ?? '');
			if (!isIsbnInvalid) {
				isbnSearch.update(regexInputValue((rules.get('isbn-pattern') as RegexRule | undefined)?.config.pattern.source));
			}
		},
	};
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
