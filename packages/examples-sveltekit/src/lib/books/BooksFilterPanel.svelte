<script lang="ts">
	/**
	 * `<BooksFilterPanel>` — the facet panel for the Svelte books app, the port of
	 * `examples-shared`'s `BooksFilterPanel` + `BookFilterSections`, rendered on both `/books` (a
	 * main-thread engine) and `/books-server` (an HTTP engine). A thin assembler: it derives the chip
	 * vocabularies + the three numeric baselines from the resident corpus, fetches ONE predictive-disable
	 * bundle per engine change, and distributes the per-candidate exclusion + filtered-except-self
	 * bounds so every facet predictive-disables. Every word it shows comes from the `BOOKS_*` copy in
	 * `books-domain`, shared with every app's books panel.
	 *
	 * Filters wired (the full parity set): Genre / Format / Language (`InSetRule` chips), genre
	 * super-groups (`InSetofSetsRule`), Publication year / Rating / Page count (`RangeRule` sliders),
	 * In print / Has audiobook (`BooleanRule` checkboxes), Rated only (`ExistsRule`), Editor's picks
	 * (`BloomMembershipRule`), Description (`TextSearchRule`), Authors (`FuzzySearchRule`), and an ISBN
	 * pattern (`RegexRule`) — the same nine rule types the React panel demos.
	 *
	 * ### The bundle, on either engine
	 *
	 * `createBundleFetcher` asks the engine the panel was given: the main-thread engine answers in the
	 * same tick through `core.applyFiltersAndQuery`, and the HTTP engine through
	 * `asyncEngine.applyFiltersAndQuery`, because its sync `core` shim has no `applyFiltersAndQuery`.
	 * A failed fetch keeps the previous bundle: predictive disable is an enhancement, and slightly stale
	 * hints beat every control blanking.
	 *
	 * ### Chips paint at once
	 *
	 * Each chip group's selection is a WRITABLE `$derived` off its own rule store: the click paints the
	 * chip, the write goes to the engine, and an external change (Clear all, a pill's ×, Undo, a `?f`
	 * link) re-derives it. On `/books-server` a write is a round trip, and a read-only derivation would
	 * leave the chip dark until the server answered. Per-rule stores rather than the `activeRules` map,
	 * so one group's settle never re-derives (and un-paints) another group's pending click.
	 *
	 * ### Searches
	 *
	 * The three search fields are `<TypeaheadSearch>`es. Description and author write a rule with an
	 * empty query when emptied (the books convention in every app); the ISBN pattern removes its rule,
	 * and flags a pattern that does not compile without writing it.
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
		createBundleFetcher,
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
	import { toggleSetValue } from '@filter-enginez/examples-shared/selection';
	// The fetch loop is dataset-neutral (it lives in `filter-bundle/`); `wine-domain` is the subpath
	// that exports it to the non-React apps.
	import { createEngineStores, getFilterEngine } from '@filter-enginez/svelte-signals';
	import CheckboxControl from '$lib/controls/CheckboxControl.svelte';
	import ChipToggleGroup from '$lib/controls/ChipToggleGroup.svelte';
	import RangeSlider from '$lib/controls/RangeSlider.svelte';
	import TypeaheadSearch from '$lib/controls/TypeaheadSearch.svelte';
	import { onDestroy } from 'svelte';

	import { isEngineBusy, markUserAction } from './booksBusy.js';

	interface Props {
		/** Whether to render the panel's own "Filters" title. */
		readonly isHeaderVisible?: boolean;
	}

	const { isHeaderVisible = true }: Props = $props();

	const engine = getFilterEngine<Book>();
	const { activeRules, lastChange, results, rule } = createEngineStores(engine);

	// The corpus is resident + immutable post-boot, so vocab + baselines + the bundle query are computed
	// once (the Svelte analogue of the React panel's `useMemo(…, [sourceData])`).
	const corpus = engine.core.getSourceData();
	const genres = uniqueSorted(corpus.map((book) => book.genre));
	const formats = uniqueSorted(corpus.map((book) => book.format));
	const languages = uniqueSorted(corpus.map((book) => book.language));

	const yearBaseline = deriveBaseline(corpus.map((book) => book.publicationYear), { max: 2025, min: 1900 }, 1);
	const pageBaseline = deriveBaseline(corpus.map((book) => book.pageCount), { max: 1500, min: 0 }, 10);
	const ratingBaseline = deriveBaseline(corpus.map((book) => book.averageRating), { max: 5, min: 0 }, 1);

	const query: FilterBundleQuery = buildBooksBundleQuery(
		{ pageCount: pageBaseline, publicationYear: yearBaseline, rating: ratingBaseline },
		{ formats, genres, languages },
	);

	// `$state.raw`: the bundle carries typed arrays, which Svelte's deep proxy would wrap.
	let bundle = $state.raw<FilterBundle | null>(null);

	// ONE bundle per engine change → per-candidate exclusion + filtered-except-self slider bounds. See
	// the docblock for why this is a fetcher rather than a synchronous read.
	const fetcher = createBundleFetcher(engine, {
		onBundle: (next) => {
			bundle = next;
		},
	});

	// Reading `$lastChange` is what registers the dependency; the value itself is unused.
	$effect(() => {
		void $lastChange;
		fetcher.request(query);
	});

	onDestroy(() => {
		fetcher.dispose();
	});

	// ─── Chip groups: writable deriveds off each group's own rule (see the docblock) ──
	const genreRule = rule('genre');
	const formatRule = rule('format');
	const languageRule = rule('language');
	const superGroupRule = rule('genre-groups');

	let selectedGenres = $derived(($genreRule as InSetRule<string> | undefined)?.config.set ?? []);
	let selectedFormats = $derived(($formatRule as InSetRule<string> | undefined)?.config.set ?? []);
	let selectedLanguages = $derived(($languageRule as InSetRule<string> | undefined)?.config.set ?? []);

	// Genre super-groups (InSetofSetsRule): the selected labels derive from the committed
	// array-of-genre-sets, so clear-all / pill-removal reach them with no local mirror.
	let selectedGroupKeys = $derived(
		deriveSelectedGroupKeys(($superGroupRule as InSetofSetsRule<BookGenre> | undefined)?.config.set ?? []),
	);

	// ─── Sliders and toggles (reactive off the active-rule map) ──────────────
	const yearRule = $derived($activeRules.get('publication-year') as RangeRule | undefined);
	const ratingRule = $derived($activeRules.get('rating') as RangeRule | undefined);
	const pageRule = $derived($activeRules.get('page-count') as RangeRule | undefined);

	const inPrintChecked = $derived(($activeRules.get('in-print') as BooleanRule | undefined)?.config === true);
	const audiobookChecked = $derived(($activeRules.get('has-audiobook') as BooleanRule | undefined)?.config === true);
	const ratedChecked = $derived(($activeRules.get('has-rating') as ExistsRule | undefined) !== undefined);

	// Predictive-disable candidates for the single-value toggles (built once; probed per change).
	const inPrintCandidate = bool('isInPrint', true);
	const audiobookCandidate = bool('hasAudiobook', true);
	const ratedCandidate = exists('averageRating');

	// Editor's picks (BloomMembershipRule): the Bloom set is built once from the resident corpus's
	// top-rated books; the checkbox toggles the prebuilt rule, which is also its disable candidate.
	const editorsPicksFilter = buildEditorsPicksFilter(corpus);
	const editorsPicksCandidate = bloomMembership('id', editorsPicksFilter);
	const editorsPicksChecked = $derived(($activeRules.get('editors-picks') as BloomMembershipRule | undefined) !== undefined);

	// ─── Searches: the committed query each field adopts ─────────────────────
	const descriptionRule = rule('text-search');
	const authorRule = rule('author-search');
	const isbnRule = rule('isbn-pattern');

	const descriptionQuery = $derived(($descriptionRule as TextSearchRule | undefined)?.config.query ?? '');
	const authorQuery = $derived(($authorRule as FuzzySearchRule | undefined)?.config.query ?? '');
	const isbnQuery = $derived(regexInputValue(($isbnRule as RegexRule | undefined)?.config.pattern.source));

	/** Whether the last ISBN pattern committed failed to compile (and so was not written). */
	let isbnInvalid = $state(false);

	/**
	 * Toggle a chip value in an `InSetRule`: paint the chip, then commit the new set (empty =
	 * permissive no-op, the books convention).
	 *
	 * @param ruleId - The chip group's rule.
	 * @param field - The `Book` field.
	 * @param next - The next selection, already painted by the caller.
	 */
	function commitChips(ruleId: string, field: string, next: readonly string[]): void {
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

	/** Commit a substring text search over `description`; an empty query is written as a rule too. */
	function commitDescription(trimmed: string): void {
		markUserAction();
		engine.core.addRule('text-search', text('description', { caseSensitive: false, mode: 'substring', query: trimmed }));
	}

	/** Commit a typo-tolerant fuzzy search over the array-valued `authors` field. */
	function commitAuthor(trimmed: string): void {
		markUserAction();
		engine.core.addRule('author-search', fuzzy('authors', { keys: ['authors'], query: trimmed, threshold: 0.3 }));
	}

	/** Toggle a genre super-group — paint it, then commit the new array-of-genre-sets over `genre`. */
	function toggleSuperGroup(key: string): void {
		const nextSets = nextSuperGroupSets(selectedGroupKeys, key);

		selectedGroupKeys = deriveSelectedGroupKeys(nextSets);
		markUserAction();
		engine.core.addRule('genre-groups', inSetofSets<BookGenre>('genre', nextSets));
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
	 * Empty removes the rule (and writes nothing, so marks nothing busy, when there is no rule to
	 * remove: a removal the engine has nothing to do for emits no change, and a busy mark would then
	 * never clear). A valid pattern commits it. An invalid one flags the box with
	 * `BOOKS_ISBN_INVALID_MESSAGE` and leaves the last good rule in place, so a half-typed `[` never
	 * throws or wipes the current filter.
	 *
	 * @param trimmed - The trimmed pattern.
	 */
	function commitIsbn(trimmed: string): void {
		if (trimmed === '') {
			isbnInvalid = false;
			if ($isbnRule !== undefined) {
				markUserAction();
				engine.core.removeRule('isbn-pattern');
			}

			return;
		}
		const compiled = compilePattern(trimmed);

		if (compiled === null) {
			isbnInvalid = true;

			return;
		}
		isbnInvalid = false;
		markUserAction();
		engine.core.addRule('isbn-pattern', regex('isbn13', { pattern: compiled }));
	}

	/** Render a kebab-cased vocabulary value as spaced words (`graphic-novel` → `graphic novel`). */
	function replaceHyphens(value: string): string {
		return value.replace(/-/g, ' ');
	}

	const yearAvailable = $derived<NumericBounds>(fieldBounds(bundle, 'publication-year') ?? yearBaseline);
	const ratingAvailable = $derived<NumericBounds>(fieldBounds(bundle, 'rating') ?? ratingBaseline);
	const pageAvailable = $derived<NumericBounds>(fieldBounds(bundle, 'page-count') ?? pageBaseline);

	// The committed selection per slider, defaulting to the whole track. Derived rather than written
	// inline on each `valueMin` / `valueMax` because the histogram needs the same two numbers to tier
	// its bars, so the fallback expression is spelled once per field.
	const yearSelected = $derived<NumericBounds>({
		max: yearRule?.config.max ?? yearBaseline.max,
		min: yearRule?.config.min ?? yearBaseline.min,
	});
	const ratingSelected = $derived<NumericBounds>({
		max: ratingRule?.config.max ?? ratingBaseline.max,
		min: ratingRule?.config.min ?? ratingBaseline.min,
	});
	const pageSelected = $derived<NumericBounds>({
		max: pageRule?.config.max ?? pageBaseline.max,
		min: pageRule?.config.min ?? pageBaseline.min,
	});

	// The distribution the engine already computed for each field. `undefined` until the first bundle
	// resolves, which the slider renders as no overlay rather than as an empty 38px band.
	const yearHistogram = $derived(
		fieldHistogram(bundle, 'publication-year', yearSelected.min, yearSelected.max),
	);
	const ratingHistogram = $derived(fieldHistogram(bundle, 'rating', ratingSelected.min, ratingSelected.max));
	const pageHistogram = $derived(fieldHistogram(bundle, 'page-count', pageSelected.min, pageSelected.max));
</script>

<div class="fe-books-panel">
	{#if isHeaderVisible}
		<div class="fe-books-panel__header">
			<h2 class="fe-books-panel__title">Filters</h2>
		</div>
	{/if}

	<!-- Scroll container — dims + goes inert while the engine recomputes (mirrors the React panel). -->
	<div
		class="fe-filter-panel__scroller fe-books-panel__body"
		class:fe-books-panel__body--busy={$isEngineBusy}
		aria-busy={$isEngineBusy}
	>
		<section>
			<h3 class="fe-books-section-label">{BOOKS_CHIP_SECTION_LABELS.genre}</h3>
			<ChipToggleGroup
				options={genres}
				selected={selectedGenres}
				exclusion={chipExclusionMap(bundle, 'genre')}
				formatLabel={replaceHyphens}
				onToggle={(value) => {
					selectedGenres = toggleSetValue(selectedGenres, value);
					commitChips('genre', 'genre', selectedGenres);
				}}
			/>
		</section>

		<section>
			<h3 class="fe-books-section-label">{BOOKS_CHIP_SECTION_LABELS.genreGroups}</h3>
			<ChipToggleGroup
				options={SUPER_GROUP_KEYS}
				selected={selectedGroupKeys}
				exclusion={chipExclusionMap(bundle, 'genre-groups')}
				onToggle={toggleSuperGroup}
			/>
		</section>

		<section>
			<h3 class="fe-books-section-label">{BOOKS_CHIP_SECTION_LABELS.format}</h3>
			<ChipToggleGroup
				options={formats}
				selected={selectedFormats}
				exclusion={chipExclusionMap(bundle, 'format')}
				formatLabel={replaceHyphens}
				onToggle={(value) => {
					selectedFormats = toggleSetValue(selectedFormats, value);
					commitChips('format', 'format', selectedFormats);
				}}
			/>
		</section>

		<section>
			<h3 class="fe-books-section-label">{BOOKS_CHIP_SECTION_LABELS.language}</h3>
			<ChipToggleGroup
				options={languages}
				selected={selectedLanguages}
				exclusion={chipExclusionMap(bundle, 'language')}
				onToggle={(value) => {
					selectedLanguages = toggleSetValue(selectedLanguages, value);
					commitChips('language', 'language', selectedLanguages);
				}}
			/>
		</section>

		<RangeSlider
			label={BOOKS_SLIDER_COPY.publicationYear.label}
			ariaLabel={BOOKS_SLIDER_COPY.publicationYear.ariaLabel}
			baseline={yearBaseline}
			available={yearAvailable}
			histogram={yearHistogram}
			step={1}
			valueMin={yearSelected.min}
			valueMax={yearSelected.max}
			format={(n) => n.toFixed(0)}
			parse={(raw) => parseFloat(raw)}
			onChange={(next) => commitRange('publication-year', 'publicationYear', next)}
		/>

		<RangeSlider
			label={BOOKS_SLIDER_COPY.rating.label}
			ariaLabel={BOOKS_SLIDER_COPY.rating.ariaLabel}
			baseline={ratingBaseline}
			available={ratingAvailable}
			histogram={ratingHistogram}
			step={0.1}
			valueMin={ratingSelected.min}
			valueMax={ratingSelected.max}
			format={(n) => `${n.toFixed(1)}★`}
			parse={(raw) => parseFloat(raw.replace(/[★\s]/g, ''))}
			onChange={(next) => commitRange('rating', 'averageRating', next)}
		/>

		<RangeSlider
			label={BOOKS_SLIDER_COPY.pageCount.label}
			ariaLabel={BOOKS_SLIDER_COPY.pageCount.ariaLabel}
			baseline={pageBaseline}
			available={pageAvailable}
			histogram={pageHistogram}
			step={10}
			valueMin={pageSelected.min}
			valueMax={pageSelected.max}
			format={(n) => `${n.toFixed(0)} pp`}
			parse={(raw) => parseFloat(raw.replace(/[^0-9.]/g, ''))}
			onChange={(next) => commitRange('page-count', 'pageCount', next)}
		/>

		<!-- `isToggleDisabled`: an unchecked box is disabled when checking it would empty the results; a
		     checked one never is, so a filter can always be turned back off. -->
		<section class="fe-books-toggles">
			<CheckboxControl
				label={BOOKS_TOGGLE_LABELS.inPrint}
				isChecked={inPrintChecked}
				isDisabled={isToggleDisabled(inPrintChecked, $results, inPrintCandidate)}
				onToggle={(checked) => commitBoolean('in-print', 'isInPrint', checked)}
			/>
			<CheckboxControl
				label={BOOKS_TOGGLE_LABELS.audiobook}
				isChecked={audiobookChecked}
				isDisabled={isToggleDisabled(audiobookChecked, $results, audiobookCandidate)}
				onToggle={(checked) => commitBoolean('has-audiobook', 'hasAudiobook', checked)}
			/>
			<CheckboxControl
				label={BOOKS_TOGGLE_LABELS.rated}
				isChecked={ratedChecked}
				isDisabled={isToggleDisabled(ratedChecked, $results, ratedCandidate)}
				onToggle={(checked) => commitExists('has-rating', 'averageRating', checked)}
			/>
			<CheckboxControl
				label={BOOKS_TOGGLE_LABELS.editorsPicks}
				isChecked={editorsPicksChecked}
				isDisabled={isToggleDisabled(editorsPicksChecked, $results, editorsPicksCandidate)}
				onToggle={commitEditorsPicks}
			/>
		</section>

		<section>
			<h3 class="fe-books-section-label">{BOOKS_SEARCH_COPY.description.label}</h3>
			<TypeaheadSearch
				ariaLabel={BOOKS_SEARCH_COPY.description.ariaLabel}
				placeholder={BOOKS_SEARCH_COPY.description.placeholder}
				ruleQuery={descriptionQuery}
				commit={commitDescription}
			/>
		</section>

		<section>
			<h3 class="fe-books-section-label">{BOOKS_SEARCH_COPY.author.label}</h3>
			<TypeaheadSearch
				ariaLabel={BOOKS_SEARCH_COPY.author.ariaLabel}
				placeholder={BOOKS_SEARCH_COPY.author.placeholder}
				ruleQuery={authorQuery}
				commit={commitAuthor}
			/>
		</section>

		<section>
			<h3 class="fe-books-section-label">{BOOKS_SEARCH_COPY.isbn.label}</h3>
			<TypeaheadSearch
				ariaLabel={BOOKS_SEARCH_COPY.isbn.ariaLabel}
				placeholder={BOOKS_SEARCH_COPY.isbn.placeholder}
				ruleQuery={isbnQuery}
				commit={commitIsbn}
			/>
			{#if isbnInvalid}
				<p class="fe-books-regex-error" role="alert">{BOOKS_ISBN_INVALID_MESSAGE}</p>
			{/if}
		</section>
	</div>
</div>
