<script setup lang="ts">
/**
 * `<BooksFilterPanel>` — the facet panel for the Vue books app, the port of the Svelte
 * `BooksFilterPanel` (itself the port of `examples-shared`'s `BooksFilterPanel` +
 * `BookFilterSections`). A thin assembler: it derives the chip vocabularies + the three numeric
 * baselines from the resident corpus, fires ONE `applyFiltersAndQuery` bundle per engine change (a
 * `computed` off `lastChange`), and distributes the per-candidate exclusion + filtered-except-self
 * bounds so every facet predictive-disables (books can't reach zero results). Runs synchronously on
 * the main thread.
 *
 * Filters wired (the full parity set): Genre / Format / Language (`InSetRule` chips), genre
 * super-groups (`InSetofSetsRule`), Publication year / Rating / Page count (`RangeRule` sliders), In
 * print / Has audiobook (`BooleanRule` checkboxes), Rated only (`ExistsRule`), Editor's picks
 * (`BloomMembershipRule`), Description (`TextSearchRule`), Authors (`FuzzySearchRule`), and an ISBN
 * pattern (`RegexRule`) — the same nine rule types the React/Svelte panels demo.
 *
 * Every heading, label, slider name, placeholder and the ISBN error come from the shared `BOOKS_*`
 * copy in `books-domain`, so the panel reads the same in all six apps. The checkboxes disable through
 * the shared `isToggleDisabled`, which never disables a checked box. The three searches bind
 * `useTypeaheadSearch` (debounced while typing, at once on blur / Enter / clear, never an unchanged
 * query): an empty description or author query writes a rule with an empty query, the books
 * convention in every app, and an empty ISBN pattern removes its rule.
 */
import type { Book, BookGenre } from '@filter-enginez/mock-data/books';

import {
	bloomMembership,
	type BloomMembershipRule,
	bool,
	type BooleanRule,
	exists,
	type ExistsRule,
	type FilterBundleQuery,
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
	safeApplyBundle,
	SUPER_GROUP_KEYS,
	uniqueSorted,
} from '@filter-enginez/examples-shared/books-domain';
import { toggleSetValue } from '@filter-enginez/examples-shared/selection';
import { useBusy, useEngineRefs, useFilterEngine } from '@filter-enginez/vue-signals';
import { computed, ref } from 'vue';

import CheckboxControl from '../controls/CheckboxControl.vue';
import ChipToggleGroup from '../controls/ChipToggleGroup.vue';
import RangeSlider from '../controls/RangeSlider.vue';
import SearchInput from '../controls/SearchInput.vue';
import { useTypeaheadSearch } from '../search/useTypeaheadSearch.js';
import { booksBusyTracker, markUserAction } from './booksBusy.js';

withDefaults(
	defineProps<{
		/** Whether to render the panel's own "Filters" title. */
		isHeaderVisible?: boolean;
	}>(),
	{
		isHeaderVisible: true,
	},
);

const engine = useFilterEngine<Book>();
const { activeRules, lastChange, results } = useEngineRefs(engine);
const isEngineBusy = useBusy(booksBusyTracker);

// The corpus is resident + immutable post-boot, so vocab + baselines + the bundle query are computed
// once (the Vue analogue of the React panel's `useMemo(…, [sourceData])`).
const corpus = engine.core.getSourceData();
const genres = uniqueSorted(corpus.map((book) => book.genre));
const formats = uniqueSorted(corpus.map((book) => book.format));
const languages = uniqueSorted(corpus.map((book) => book.language));

const yearBaseline = deriveBaseline(
	corpus.map((book) => book.publicationYear),
	{ max: 2025, min: 1900 },
	1,
);
const pageBaseline = deriveBaseline(
	corpus.map((book) => book.pageCount),
	{ max: 1500, min: 0 },
	10,
);
const ratingBaseline = deriveBaseline(
	corpus.map((book) => book.averageRating),
	{ max: 5, min: 0 },
	1,
);

const query: FilterBundleQuery = buildBooksBundleQuery(
	{ pageCount: pageBaseline, publicationYear: yearBaseline, rating: ratingBaseline },
	{ formats, genres, languages },
);

// ONE bundle per engine change → per-candidate exclusion + filtered-except-self slider bounds.
const bundle = computed(() => {
	// Establish the dependency on the last-change snapshot so the bundle re-runs on every commit.
	void lastChange.value;

	return safeApplyBundle(engine, query);
});

// ─── Current committed state (reactive off the active-rule map) ──────────────
const selectedGenres = computed(
	() => (activeRules.value.get('genre') as InSetRule<string> | undefined)?.config.set ?? [],
);
const selectedFormats = computed(
	() => (activeRules.value.get('format') as InSetRule<string> | undefined)?.config.set ?? [],
);
const selectedLanguages = computed(
	() => (activeRules.value.get('language') as InSetRule<string> | undefined)?.config.set ?? [],
);

const yearRule = computed(() => activeRules.value.get('publication-year') as RangeRule | undefined);
const ratingRule = computed(() => activeRules.value.get('rating') as RangeRule | undefined);
const pageRule = computed(() => activeRules.value.get('page-count') as RangeRule | undefined);

const inPrintChecked = computed(() => (activeRules.value.get('in-print') as BooleanRule | undefined)?.config === true);
const audiobookChecked = computed(
	() => (activeRules.value.get('has-audiobook') as BooleanRule | undefined)?.config === true,
);
const ratedChecked = computed(() => (activeRules.value.get('has-rating') as ExistsRule | undefined) !== undefined);

// Predictive-disable candidates for the single-value toggles (built once; probed per change).
const inPrintCandidate = bool('isInPrint', true);
const audiobookCandidate = bool('hasAudiobook', true);
const ratedCandidate = exists('averageRating');

// ─── Curated demo filters (super-groups / Editor's picks / ISBN regex) ───────
// Genre super-groups (InSetofSetsRule): the selected labels derive directly from the committed
// array-of-genre-sets, so clear-all / pill-removal stay in sync with no local mirror.
const selectedGroupKeys = computed(() =>
	deriveSelectedGroupKeys(
		(activeRules.value.get('genre-groups') as InSetofSetsRule<BookGenre> | undefined)?.config.set ?? [],
	),
);

// Editor's picks (BloomMembershipRule): the Bloom set is built once from the resident corpus's
// top-rated books; the checkbox toggles the prebuilt rule. The candidate is built once + probed per
// change for predictive-disable.
const editorsPicksFilter = buildEditorsPicksFilter(corpus);
const editorsPicksCandidate = bloomMembership('id', editorsPicksFilter);
const editorsPicksChecked = computed(
	() => (activeRules.value.get('editors-picks') as BloomMembershipRule | undefined) !== undefined,
);

// ISBN pattern (RegexRule): a local invalid flag, so a half-typed pattern flags without wiping the
// rule. The field's text is the ISBN search below.
const isbnInvalid = ref(false);

/** Toggle a chip value in an `InSetRule`, committing the new set (empty = permissive no-op). */
function toggleChip(ruleId: string, field: string, current: readonly string[], value: string): void {
	const next = toggleSetValue(current, value);

	markUserAction();
	engine.core.addRule(ruleId, inSet<string>(field, next));
}

/** Commit a range-slider change. */
function commitRange(ruleId: string, field: string, next: { readonly max: number; readonly min: number }): void {
	markUserAction();
	engine.core.addRule(ruleId, range(field, { max: next.max, min: next.min }));
}

/** Commit a boolean toggle — checked requires `field === true`; unchecked removes the constraint. */
function commitBoolean(ruleId: string, field: string, checked: boolean): void {
	markUserAction();
	engine.core.addRule(ruleId, bool(field, checked ? true : undefined));
}

/** Commit an exists toggle — checked requires the field be present; unchecked removes the rule. */
function commitExists(ruleId: string, field: string, checked: boolean): void {
	markUserAction();
	if (checked) {
		engine.core.addRule(ruleId, exists(field));
	} else {
		engine.core.removeRule(ruleId);
	}
}

/**
 * The description search: a substring `TextSearchRule` over `description`.
 *
 * @remarks
 * An empty query still writes the rule, with an empty query, as every app's books panel does.
 */
const descriptionSearch = useTypeaheadSearch({
	commit: (trimmedQuery) => {
		markUserAction();
		engine.core.addRule(
			'text-search',
			text('description', { caseSensitive: false, mode: 'substring', query: trimmedQuery }),
		);
	},
	committedQuery: () => (activeRules.value.get('text-search') as TextSearchRule | undefined)?.config.query ?? '',
});
const { query: descriptionText } = descriptionSearch;

/**
 * The author search: a typo-tolerant `FuzzySearchRule` over the array-valued `authors` field.
 *
 * @remarks
 * An empty query still writes the rule, as the description search does.
 */
const authorSearch = useTypeaheadSearch({
	commit: (trimmedQuery) => {
		markUserAction();
		engine.core.addRule('author-search', fuzzy('authors', { keys: ['authors'], query: trimmedQuery, threshold: 0.3 }));
	},
	committedQuery: () => (activeRules.value.get('author-search') as FuzzySearchRule | undefined)?.config.query ?? '',
});
const { query: authorText } = authorSearch;

/** Toggle a genre super-group — commits the new array-of-genre-sets over `genre`. */
function toggleSuperGroup(key: string): void {
	markUserAction();
	engine.core.addRule(
		'genre-groups',
		inSetofSets<BookGenre>('genre', nextSuperGroupSets(selectedGroupKeys.value, key)),
	);
}

/** Toggle the Editor's-picks Bloom pre-screen — checked adds the rule, unchecked removes it. */
function commitEditorsPicks(checked: boolean): void {
	markUserAction();
	if (checked) {
		engine.core.addRule('editors-picks', bloomMembership('id', editorsPicksFilter));
	} else {
		engine.core.removeRule('editors-picks');
	}
}

/**
 * Commit an ISBN-13 regex pattern.
 *
 * @remarks
 * Empty removes the rule; a valid pattern commits it; an invalid pattern raises
 * `BOOKS_ISBN_INVALID_MESSAGE` and leaves the last good rule in place, so a half-typed `[` never
 * throws or wipes the current filter, and writes nothing (so it marks nothing busy).
 *
 * The removal is skipped when no rule is installed: clearing a field that only ever held an invalid
 * pattern has nothing to remove, and a removal the engine ignores would mark the engine busy with no
 * change to settle it.
 *
 * @param trimmedQuery - The trimmed pattern.
 */
function commitIsbn(trimmedQuery: string): void {
	if (trimmedQuery === '') {
		isbnInvalid.value = false;
		if (activeRules.value.has('isbn-pattern')) {
			markUserAction();
			engine.core.removeRule('isbn-pattern');
		}

		return;
	}
	const compiled = compilePattern(trimmedQuery);

	if (compiled === null) {
		isbnInvalid.value = true;

		return;
	}
	isbnInvalid.value = false;
	markUserAction();
	engine.core.addRule('isbn-pattern', regex('isbn13', { pattern: compiled }));
}

/** The ISBN pattern search; its rule query is the committed pattern's source. */
const isbnSearch = useTypeaheadSearch({
	commit: commitIsbn,
	committedQuery: () =>
		regexInputValue((activeRules.value.get('isbn-pattern') as RegexRule | undefined)?.config.pattern.source),
});
const { query: isbnText } = isbnSearch;

/** Render a kebab-cased vocabulary value as spaced words (`graphic-novel` → `graphic novel`). */
function replaceHyphens(value: string): string {
	return value.replace(/-/g, ' ');
}

const yearAvailable = computed<NumericBounds>(() => fieldBounds(bundle.value, 'publication-year') ?? yearBaseline);
const ratingAvailable = computed<NumericBounds>(() => fieldBounds(bundle.value, 'rating') ?? ratingBaseline);
const pageAvailable = computed<NumericBounds>(() => fieldBounds(bundle.value, 'page-count') ?? pageBaseline);

// The committed selection per slider, defaulting to the whole track. Computed rather than written
// inline on each `:value-min` / `:value-max` because the histogram needs the same two numbers to tier
// its bars, and the fallback expression was already spelled out twice per field.
const yearSelected = computed<NumericBounds>(() => ({
	max: yearRule.value?.config.max ?? yearBaseline.max,
	min: yearRule.value?.config.min ?? yearBaseline.min,
}));
const ratingSelected = computed<NumericBounds>(() => ({
	max: ratingRule.value?.config.max ?? ratingBaseline.max,
	min: ratingRule.value?.config.min ?? ratingBaseline.min,
}));
const pageSelected = computed<NumericBounds>(() => ({
	max: pageRule.value?.config.max ?? pageBaseline.max,
	min: pageRule.value?.config.min ?? pageBaseline.min,
}));

// The distribution the engine already computed for each field. `undefined` until the first bundle
// resolves, which the slider renders as no overlay rather than as an empty 38px band.
const yearHistogram = computed(() =>
	fieldHistogram(bundle.value, 'publication-year', yearSelected.value.min, yearSelected.value.max),
);
const ratingHistogram = computed(() =>
	fieldHistogram(bundle.value, 'rating', ratingSelected.value.min, ratingSelected.value.max),
);
const pageHistogram = computed(() =>
	fieldHistogram(bundle.value, 'page-count', pageSelected.value.min, pageSelected.value.max),
);
</script>

<template>
	<div class="fe-books-panel">
		<div v-if="isHeaderVisible" class="fe-books-panel__header">
			<h2 class="fe-books-panel__title">Filters</h2>
		</div>

		<!-- Scroll container — dims + goes inert while the engine recomputes (mirrors the React panel). -->
		<div
			class="fe-filter-panel__scroller fe-books-panel__body"
			:class="{ 'fe-books-panel__body--busy': isEngineBusy }"
			:aria-busy="isEngineBusy"
		>
			<section>
				<h3 class="fe-books-section-label">{{ BOOKS_CHIP_SECTION_LABELS.genre }}</h3>
				<ChipToggleGroup
					:options="genres"
					:selected="selectedGenres"
					:exclusion="chipExclusionMap(bundle, 'genre')"
					:format-label="replaceHyphens"
					@toggle="(value) => toggleChip('genre', 'genre', selectedGenres, value)"
				/>
			</section>

			<section>
				<h3 class="fe-books-section-label">{{ BOOKS_CHIP_SECTION_LABELS.genreGroups }}</h3>
				<ChipToggleGroup
					:options="SUPER_GROUP_KEYS"
					:selected="selectedGroupKeys"
					:exclusion="chipExclusionMap(bundle, 'genre-groups')"
					@toggle="toggleSuperGroup"
				/>
			</section>

			<section>
				<h3 class="fe-books-section-label">{{ BOOKS_CHIP_SECTION_LABELS.format }}</h3>
				<ChipToggleGroup
					:options="formats"
					:selected="selectedFormats"
					:exclusion="chipExclusionMap(bundle, 'format')"
					:format-label="replaceHyphens"
					@toggle="(value) => toggleChip('format', 'format', selectedFormats, value)"
				/>
			</section>

			<section>
				<h3 class="fe-books-section-label">{{ BOOKS_CHIP_SECTION_LABELS.language }}</h3>
				<ChipToggleGroup
					:options="languages"
					:selected="selectedLanguages"
					:exclusion="chipExclusionMap(bundle, 'language')"
					@toggle="(value) => toggleChip('language', 'language', selectedLanguages, value)"
				/>
			</section>

			<RangeSlider
				:label="BOOKS_SLIDER_COPY.publicationYear.label"
				:slider-label="BOOKS_SLIDER_COPY.publicationYear.ariaLabel"
				:baseline="yearBaseline"
				:available="yearAvailable"
				:histogram="yearHistogram"
				:step="1"
				:value-min="yearSelected.min"
				:value-max="yearSelected.max"
				:format="(n) => n.toFixed(0)"
				:parse="(raw) => parseFloat(raw)"
				@change="(next) => commitRange('publication-year', 'publicationYear', next)"
			/>

			<RangeSlider
				:label="BOOKS_SLIDER_COPY.rating.label"
				:slider-label="BOOKS_SLIDER_COPY.rating.ariaLabel"
				:baseline="ratingBaseline"
				:available="ratingAvailable"
				:histogram="ratingHistogram"
				:step="0.1"
				:value-min="ratingSelected.min"
				:value-max="ratingSelected.max"
				:format="(n) => `${n.toFixed(1)}★`"
				:parse="(raw) => parseFloat(raw.replace(/[★\s]/g, ''))"
				@change="(next) => commitRange('rating', 'averageRating', next)"
			/>

			<RangeSlider
				:label="BOOKS_SLIDER_COPY.pageCount.label"
				:slider-label="BOOKS_SLIDER_COPY.pageCount.ariaLabel"
				:baseline="pageBaseline"
				:available="pageAvailable"
				:histogram="pageHistogram"
				:step="10"
				:value-min="pageSelected.min"
				:value-max="pageSelected.max"
				:format="(n) => `${n.toFixed(0)} pp`"
				:parse="(raw) => parseFloat(raw.replace(/[^0-9.]/g, ''))"
				@change="(next) => commitRange('page-count', 'pageCount', next)"
			/>

			<section class="fe-books-toggles">
				<CheckboxControl
					:label="BOOKS_TOGGLE_LABELS.inPrint"
					:is-checked="inPrintChecked"
					:is-disabled="isToggleDisabled(inPrintChecked, results, inPrintCandidate)"
					@toggle="(checked) => commitBoolean('in-print', 'isInPrint', checked)"
				/>
				<CheckboxControl
					:label="BOOKS_TOGGLE_LABELS.audiobook"
					:is-checked="audiobookChecked"
					:is-disabled="isToggleDisabled(audiobookChecked, results, audiobookCandidate)"
					@toggle="(checked) => commitBoolean('has-audiobook', 'hasAudiobook', checked)"
				/>
				<CheckboxControl
					:label="BOOKS_TOGGLE_LABELS.rated"
					:is-checked="ratedChecked"
					:is-disabled="isToggleDisabled(ratedChecked, results, ratedCandidate)"
					@toggle="(checked) => commitExists('has-rating', 'averageRating', checked)"
				/>
				<CheckboxControl
					:label="BOOKS_TOGGLE_LABELS.editorsPicks"
					:is-checked="editorsPicksChecked"
					:is-disabled="isToggleDisabled(editorsPicksChecked, results, editorsPicksCandidate)"
					@toggle="commitEditorsPicks"
				/>
			</section>

			<section>
				<h3 class="fe-books-section-label">{{ BOOKS_SEARCH_COPY.description.label }}</h3>
				<SearchInput
					:value="descriptionText"
					:placeholder="BOOKS_SEARCH_COPY.description.placeholder"
					:input-label="BOOKS_SEARCH_COPY.description.ariaLabel"
					@change="descriptionSearch.input"
					@commit="descriptionSearch.flush"
				/>
			</section>

			<section>
				<h3 class="fe-books-section-label">{{ BOOKS_SEARCH_COPY.author.label }}</h3>
				<SearchInput
					:value="authorText"
					:placeholder="BOOKS_SEARCH_COPY.author.placeholder"
					:input-label="BOOKS_SEARCH_COPY.author.ariaLabel"
					@change="authorSearch.input"
					@commit="authorSearch.flush"
				/>
			</section>

			<section>
				<h3 class="fe-books-section-label">{{ BOOKS_SEARCH_COPY.isbn.label }}</h3>
				<SearchInput
					:value="isbnText"
					:placeholder="BOOKS_SEARCH_COPY.isbn.placeholder"
					:input-label="BOOKS_SEARCH_COPY.isbn.ariaLabel"
					@change="isbnSearch.input"
					@commit="isbnSearch.flush"
				/>
				<p v-if="isbnInvalid" class="fe-books-regex-error" role="alert">{{ BOOKS_ISBN_INVALID_MESSAGE }}</p>
			</section>
		</div>
	</div>
</template>
