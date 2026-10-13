/**
 * `<fe-books-filter-panel>` — the full nine-rule books panel.
 *
 * @remarks
 * Every rule type in the demo lives here: `InSetRule` chips (genre / format / language),
 * `InSetofSetsRule` super-groups, `RangeRule` sliders (year / rating / pages), `BooleanRule` toggles,
 * `ExistsRule`, `BloomMembershipRule` (editor's picks), `TextSearchRule`, `FuzzySearchRule` and
 * `RegexRule`.
 *
 * ### Nothing here re-implements domain logic
 *
 * Vocabularies, baselines, super-group arithmetic, the editor's-picks Bloom filter, regex compilation
 * and the predictive-disable projections all come from `@filter-enginez/examples-shared/books-domain`
 * — the same framework-neutral module React, Svelte, Vue and vanilla use. What is Angular-specific is
 * the rendering and the signal wiring, and that is the point of the whole exercise.
 *
 * ### Three patterns worth naming
 *
 * **Selection is derived, never mirrored.** Every control reads its current value back out of
 * `activeRules$`. So "Clear all", removing a pill in the header, and a URL restore all flow into the
 * controls for free — there is no second copy of the truth to keep in sync. The exception is the three
 * text inputs, which need a local mirror for uncommitted keystrokes; those re-seed from engine state
 * via an effect.
 *
 * **The bundle is anchored on `lastChange`.** `applyFiltersAndQuery` is a plain call over engine
 * state, not a stream, so it needs something to tell it when to re-run. `toObservable(_lastChangeEvent)`
 * is that anchor — remove it and the predictions silently freeze at their boot values.
 *
 * **The bundle has a sync branch and an async one, and it has to.** `/books` holds a main-thread
 * engine, so the bundle is read straight off `engine.core`. `/books-server` holds an engine whose
 * `.core` is the `createRxJsEngineFromAsync` shim, and that shim *throws* on `applyFiltersAndQuery`
 * (it points you at `engine.asyncEngine` instead). `safeApplyBundleFromCore` would dutifully catch
 * that throw and hand back `null` — predictive-disable would vanish, chips would stop dimming, the
 * sliders would lose their available zone, and nothing anywhere would look broken. So the bundle
 * routes through `asyncEngine.applyFiltersAndQuery` whenever an async engine is present. This is the
 * same one-branch rule the React apps' shared `filterBundle` module applies; here it is the only
 * concession the panel makes to running server-backed at all. The sync path stays fully synchronous,
 * down to the `initialValue` on the first render.
 *
 * **`bool(field, undefined)` rather than `removeRule`.** An unchecked boolean stays registered as a
 * permissive rule; `exists` and `bloomMembership` are added and removed instead. That asymmetry is
 * deliberate and load-bearing — matching it keeps clear-all behavior identical across verticals.
 *
 * @packageDocumentation
 */

import type { Book, BookGenre } from '@filter-enginez/mock-data/books';

import { ChangeDetectionStrategy, Component, computed, effect, input, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { injectEngineBusy, injectFilterEngine } from '@filter-enginez/angular-rxjs';
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
	type ExclusionMap,
	fieldBounds,
	fieldHistogram,
	nextSuperGroupSets,
	type NumericBounds,
	regexInputValue,
	safeApplyBundleFromCore,
	SUPER_GROUP_KEYS,
	toggleWouldBeEmpty,
	uniqueSorted,
} from '@filter-enginez/examples-shared/books-domain';
import { toggleSetValue } from '@filter-enginez/examples-shared/selection';
import { catchError, from, type Observable, of, switchMap } from 'rxjs';

import { CheckboxControlComponent } from '../controls/checkbox-control.component.js';
import { ChipToggleGroupComponent } from '../controls/chip-toggle-group.component.js';
import { type RangeSliderChange, RangeSliderComponent } from '../controls/range-slider.component.js';
import { SearchInputComponent } from '../controls/search-input.component.js';

/** Fuse.js distance threshold for the typo-tolerant author search. */
const FUZZY_THRESHOLD = 0.3;

/** Genre and format values are hyphenated in the corpus; humans prefer spaces. */
function replaceHyphens(value: string): string {
	return value.replace(/-/g, ' ');
}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		CheckboxControlComponent,
		ChipToggleGroupComponent,
		RangeSliderComponent,
		SearchInputComponent,
	],
	selector: 'fe-books-filter-panel',
	// The ONLY CSS this app authors, and it exists because Angular inserts an element the other
	// verticals do not have.
	//
	// `.fe-books-app__sidebar` is a flex column, and `.fe-books-panel` claims `flex: 1 1 0%` plus
	// `min-height: 0` to become the bounded scroll container. In React, Vue, Svelte and vanilla the
	// panel is a DIRECT child of the sidebar, so that works. Here `<fe-books-filter-panel>` sits
	// between them, and an unknown element defaults to `display: inline` — it is not a flex container,
	// so the panel inside it never receives a bounded height and the filter list simply overflows
	// instead of scrolling.
	//
	// Making the host transparent to the layout restores the chain. This is a host-geometry fix, not
	// styling: everything visual still comes from ui-styles.
	styles: [':host { display: flex; flex: 1 1 0%; flex-direction: column; min-height: 0; }'],
	templateUrl: './books-filter-panel.component.html',
})
export class BooksFilterPanelComponent {
	/** Whether to render the "Filters" heading (hidden in the mobile drawer). */
	public readonly isHeaderVisible = input<boolean>(true);

	private readonly _busy = injectEngineBusy();
	private readonly _engine = injectFilterEngine<Book>();

	/** Every rule currently on the engine — the single source every control derives its value from. */
	private readonly _activeRules = toSignal(this._engine.activeRules$, { requireSync: true });

	/**
	 * The resident corpus. Immutable post-boot, so everything derived from it is computed once.
	 *
	 * @remarks
	 * Synchronous on both engines. On `/books` this reads the main-thread engine's own array; on
	 * `/books-server` it reads the adapter's resident mirror, which `createRxJsEngineFromAsync` seeds
	 * by awaiting `asyncEngine.getSourceData()` before it resolves. Since the route resolver awaits
	 * that promise before activation, the corpus is fully populated by the time this field runs —
	 * which is what keeps the vocabularies and slider baselines from booting empty.
	 */
	private readonly _corpus: readonly Book[] = this._engine.core.getSourceData();

	/** The current result set. Feeds the cheap one-pass checkbox disable projections. */
	private readonly _results = toSignal(this._engine.results$, { requireSync: true });

	/**
	 * Anchor for {@link bundle} — read, never displayed. See the class remarks.
	 *
	 * @remarks
	 * The change EVENT, not the timestamp: a timestamp is a millisecond-resolution value that two
	 * commits can share, and the second would re-run no projection, leaving the panel dimming chips
	 * against a filter state it never re-projected. An event is freshly allocated per emission, so its
	 * identity always differs. Same reasoning as the settle anchor in `books-page.component`.
	 */
	private readonly _lastChangeEvent = toSignal(this._engine.lastChangeEvent$, {
		initialValue: null,
	});

	// ─── Vocabularies + baselines (computed once) ─────────────────────────────────────────────────
	protected readonly formats = uniqueSorted(this._corpus.map((book) => book.format));
	protected readonly genres = uniqueSorted(this._corpus.map((book) => book.genre));
	protected readonly languages = uniqueSorted(this._corpus.map((book) => book.language));
	protected readonly pageBaseline = deriveBaseline(
		this._corpus.map((book) => book.pageCount),
		{ max: 1500, min: 0 },
		10,
	);

	protected readonly ratingBaseline = deriveBaseline(
		this._corpus.map((book) => book.averageRating),
		{ max: 5, min: 0 },
		1,
	);

	protected readonly superGroupKeys = SUPER_GROUP_KEYS;

	protected readonly yearBaseline = deriveBaseline(
		this._corpus.map((book) => book.publicationYear),
		{ max: 2025, min: 1900 },
		1,
	);

	/** Prebuilt so the Bloom filter is constructed once, not per keystroke. */
	private readonly _editorsPicksFilter = buildEditorsPicksFilter(this._corpus);

	/** Candidate rules for the cheap `toggleWouldBeEmpty` checkbox projection. */
	private readonly _audiobookCandidate = bool('hasAudiobook', true);
	private readonly _editorsPicksCandidate = bloomMembership('id', this._editorsPicksFilter);
	private readonly _inPrintCandidate = bool('isInPrint', true);
	private readonly _ratedCandidate = exists('averageRating');

	/**
	 * The projection query. A plain field, not a computed: it depends only on the corpus vocabularies
	 * and baselines, which never change after boot.
	 */
	private readonly _query: FilterBundleQuery = buildBooksBundleQuery(
		{ pageCount: this.pageBaseline, publicationYear: this.yearBaseline, rating: this.ratingBaseline },
		{ formats: this.formats, genres: this.genres, languages: this.languages },
	);

	/**
	 * The predictive-disable projection, re-read once per commit.
	 *
	 * @remarks
	 * A stream rather than a `computed` because one of its two branches is asynchronous — see the
	 * class remarks. `switchMap` (not `mergeMap`) is load-bearing on the server-backed branch: a new
	 * commit unsubscribes from the previous request, so a slow early response is discarded rather than
	 * landing after — and overwriting — a newer one. It can't abort the `fetch` itself, but the
	 * out-of-order result never reaches the signal, which is the property that matters.
	 */
	private readonly _bundle$: Observable<FilterBundle | null> = toObservable(this._lastChangeEvent).pipe(
		switchMap(() => {
			const { asyncEngine } = this._engine;

			return asyncEngine === undefined
				? of(safeApplyBundleFromCore(this._engine.core, this._query))
				: from(asyncEngine.applyFiltersAndQuery(this._query)).pipe(catchError(() => of(null)));
		}),
	);

	/**
	 * The engine's predictive-disable projection, or `null` until one is available.
	 *
	 * @remarks
	 * The `initialValue` is the SYNCHRONOUS read, which gives `/books` a projection on first render:
	 * `toObservable` emits on the next effect flush, so without it the first render would briefly show
	 * chips with no projection. On the server-backed engine the same call throws inside
	 * `safeApplyBundleFromCore` and yields `null`, which is the honest answer until the first
	 * round-trip lands.
	 */
	protected readonly bundle = toSignal(this._bundle$, {
		initialValue: safeApplyBundleFromCore(this._engine.core, this._query),
	});

	/** Whether the engine is mid-recompute — dims the panel. */
	protected readonly isEngineBusy = toSignal(this._busy.isBusy$, { requireSync: true });

	// ─── Chip exclusions (lifted out of the template so they compute once per commit) ─────────────
	protected readonly formatExclusion = computed<ExclusionMap>(() =>
		chipExclusionMap(this.bundle(), 'format'),
	);

	protected readonly genreExclusion = computed<ExclusionMap>(() =>
		chipExclusionMap(this.bundle(), 'genre'),
	);

	protected readonly groupExclusion = computed<ExclusionMap>(() =>
		chipExclusionMap(this.bundle(), 'genre-groups'),
	);

	protected readonly languageExclusion = computed<ExclusionMap>(() =>
		chipExclusionMap(this.bundle(), 'language'),
	);

	// ─── Slider available zones, falling back to baseline when the engine has no projection ────────────────────────
	protected readonly pageAvailable = computed<NumericBounds>(
		() => fieldBounds(this.bundle(), 'page-count') ?? this.pageBaseline,
	);

	protected readonly ratingAvailable = computed<NumericBounds>(
		() => fieldBounds(this.bundle(), 'rating') ?? this.ratingBaseline,
	);

	protected readonly yearAvailable = computed<NumericBounds>(
		() => fieldBounds(this.bundle(), 'publication-year') ?? this.yearBaseline,
	);

	// ─── Selections, derived from engine state ────────────────────────────────────────────────────
	protected readonly pageRule = computed(
		() => this._activeRules().get('page-count') as RangeRule | undefined,
	);

	protected readonly ratingRule = computed(
		() => this._activeRules().get('rating') as RangeRule | undefined,
	);

	// ─── Committed slider selections. Extracted from the template, where each `?? baseline` fallback
	// was spelled out twice per field, because the histograms need the same numbers to tier their bars.
	protected readonly pageSelected = computed<NumericBounds>(() => ({
		max: this.pageRule()?.config.max ?? this.pageBaseline.max,
		min: this.pageRule()?.config.min ?? this.pageBaseline.min,
	}));

	protected readonly ratingSelected = computed<NumericBounds>(() => ({
		max: this.ratingRule()?.config.max ?? this.ratingBaseline.max,
		min: this.ratingRule()?.config.min ?? this.ratingBaseline.min,
	}));

	protected readonly yearRule = computed(
		() => this._activeRules().get('publication-year') as RangeRule | undefined,
	);

	// ─── Slider distributions. `undefined` until the first bundle resolves, which the slider renders
	// as no overlay rather than as an empty band above the track. ─────────────────────────────────
	protected readonly pageHistogram = computed(() =>
		fieldHistogram(this.bundle(), 'page-count', this.pageSelected().min, this.pageSelected().max),
	);

	protected readonly ratingHistogram = computed(() =>
		fieldHistogram(this.bundle(), 'rating', this.ratingSelected().min, this.ratingSelected().max),
	);

	protected readonly selectedFormats = computed<readonly string[]>(
		() => (this._activeRules().get('format') as InSetRule<string> | undefined)?.config.set ?? [],
	);

	protected readonly selectedGenres = computed<readonly string[]>(
		() => (this._activeRules().get('genre') as InSetRule<string> | undefined)?.config.set ?? [],
	);

	protected readonly selectedGroupKeys = computed<readonly string[]>(() =>
		deriveSelectedGroupKeys(
			(this._activeRules().get('genre-groups') as InSetofSetsRule<BookGenre> | undefined)?.config
				.set ?? [],
		),
	);

	protected readonly selectedLanguages = computed<readonly string[]>(
		() => (this._activeRules().get('language') as InSetRule<string> | undefined)?.config.set ?? [],
	);

	protected readonly yearSelected = computed<NumericBounds>(() => ({
		max: this.yearRule()?.config.max ?? this.yearBaseline.max,
		min: this.yearRule()?.config.min ?? this.yearBaseline.min,
	}));

	protected readonly yearHistogram = computed(() =>
		fieldHistogram(this.bundle(), 'publication-year', this.yearSelected().min, this.yearSelected().max),
	);

	// ─── Checkbox states. Note booleans read config; exists/bloom read PRESENCE. ───────────────────
	protected readonly isAudiobookChecked = computed<boolean>(
		() => (this._activeRules().get('has-audiobook') as BooleanRule | undefined)?.config === true,
	);

	protected readonly isEditorsPicksChecked = computed<boolean>(
		() =>
			(this._activeRules().get('editors-picks') as BloomMembershipRule | undefined) !== undefined,
	);

	protected readonly isInPrintChecked = computed<boolean>(
		() => (this._activeRules().get('in-print') as BooleanRule | undefined)?.config === true,
	);

	protected readonly isRatedChecked = computed<boolean>(
		() => (this._activeRules().get('has-rating') as ExistsRule | undefined) !== undefined,
	);

	// ─── Checkbox disable projections — one pass over results, no re-query ────────────────────────
	protected readonly isAudiobookDisabled = computed<boolean>(
		() =>
			!this.isAudiobookChecked() && toggleWouldBeEmpty(this._results(), this._audiobookCandidate),
	);

	protected readonly isEditorsPicksDisabled = computed<boolean>(
		() =>
			!this.isEditorsPicksChecked()
			&& toggleWouldBeEmpty(this._results(), this._editorsPicksCandidate),
	);

	protected readonly isInPrintDisabled = computed<boolean>(
		() => !this.isInPrintChecked() && toggleWouldBeEmpty(this._results(), this._inPrintCandidate),
	);

	protected readonly isRatedDisabled = computed<boolean>(
		() => !this.isRatedChecked() && toggleWouldBeEmpty(this._results(), this._ratedCandidate),
	);

	// ─── Text mirrors: local while typing, re-seeded from the engine on commit ────────────────────
	protected readonly authorText = signal('');
	protected readonly descriptionText = signal('');
	protected readonly isbnText = signal('');

	/** Set when the ISBN pattern won't compile. Purely local — the last good rule stays applied. */
	protected readonly isIsbnInvalid = signal(false);

	/** Display transform for the hyphenated genre / format vocabularies. */
	protected readonly formatLabel = replaceHyphens;

	// ─── Slider formatters / parsers ──────────────────────────────────────────────────────────────
	// Class fields rather than inline arrows: Angular templates can't declare functions, and a new
	// closure per change-detection pass would defeat the `input()` identity check downstream.
	/** `1998` */
	protected readonly formatYear = (value: number): string => value.toFixed(0);
	/** `4.3★` */
	protected readonly formatRating = (value: number): string => `${value.toFixed(1)}★`;
	/** `320 pp` */
	protected readonly formatPages = (value: number): string => `${value.toFixed(0)} pp`;
	/** Plain numeric parse, for the year field. */
	protected readonly parseNumber = (raw: string): number => Number.parseFloat(raw);
	/** Tolerates the trailing star the rating field renders. */
	protected readonly parseRating = (raw: string): number =>
		Number.parseFloat(raw.replace(/[★\s]/g, ''));
	/** Tolerates the trailing "pp" the page field renders. */
	protected readonly parsePages = (raw: string): number =>
		Number.parseFloat(raw.replace(/[^0-9.]/g, ''));

	private readonly _committedAuthor = computed<string>(
		() =>
			(this._activeRules().get('author-search') as { config: { query: string }} | undefined)
				?.config.query ?? '',
	);

	private readonly _committedDescription = computed<string>(
		() => (this._activeRules().get('text-search') as TextSearchRule | undefined)?.config.query ?? '',
	);

	private readonly _committedIsbn = computed<string>(() =>
		regexInputValue((this._activeRules().get('isbn-pattern') as RegexRule | undefined)?.config.pattern.source),
	);

	public constructor() {
		// Re-seed each mirror whenever the COMMITTED value changes. This is what makes "Clear all" and
		// pill removal reach into the text inputs.
		effect(() => {
			this.descriptionText.set(this._committedDescription());
		});
		effect(() => {
			this.authorText.set(this._committedAuthor());
		});
		effect(() => {
			this.isbnText.set(this._committedIsbn());
		});
	}

	/** Commit a chip toggle for one of the flat `InSetRule` groups. */
	protected toggleChip(ruleId: RuleId, field: string, current: readonly string[], value: string): void {
		const next = toggleSetValue(current, value);

		this._busy.markUserAction();
		this._engine.core.addRule(ruleId, inSet<string>(field, next));
	}

	/** Commit a super-group toggle. The set-of-sets arithmetic lives in the shared module. */
	protected toggleSuperGroup(key: string): void {
		this._busy.markUserAction();
		this._engine.core.addRule(
			'genre-groups',
			inSetofSets<BookGenre>('genre', nextSuperGroupSets(this.selectedGroupKeys(), key)),
		);
	}

	/** Commit a slider range. */
	protected commitRange(ruleId: RuleId, field: string, next: RangeSliderChange): void {
		this._busy.markUserAction();
		this._engine.core.addRule(ruleId, range(field, { max: next.max, min: next.min }));
	}

	/**
	 * Commit a boolean toggle.
	 *
	 * @remarks
	 * Unchecked registers a PERMISSIVE rule rather than removing it — see the class remarks.
	 *
	 * @param ruleId - Rule id.
	 * @param field - Boolean field on `Book`.
	 * @param isChecked - The next state.
	 */
	protected commitBoolean(ruleId: RuleId, field: string, isChecked: boolean): void {
		this._busy.markUserAction();
		this._engine.core.addRule(ruleId, bool(field, isChecked ? true : undefined));
	}

	/** Commit the "Rated only" existence filter — added and removed, not made permissive. */
	protected commitRated(isChecked: boolean): void {
		this._busy.markUserAction();

		if (isChecked) {
			this._engine.core.addRule('has-rating', exists('averageRating'));

			return;
		}
		this._engine.core.removeRule('has-rating');
	}

	/** Commit the editor's-picks Bloom pre-screen. */
	protected commitEditorsPicks(isChecked: boolean): void {
		this._busy.markUserAction();

		if (isChecked) {
			this._engine.core.addRule('editors-picks', bloomMembership('id', this._editorsPicksFilter));

			return;
		}
		this._engine.core.removeRule('editors-picks');
	}

	/** Commit the substring description search. */
	protected commitDescription(value: string): void {
		const trimmed = value.trim();

		this._busy.markUserAction();

		if (trimmed === '') {
			this._engine.core.removeRule('text-search');

			return;
		}
		this._engine.core.addRule(
			'text-search',
			text('description', { caseSensitive: false, mode: 'substring', query: trimmed }),
		);
	}

	/** Commit the typo-tolerant author search. */
	protected commitAuthor(value: string): void {
		const trimmed = value.trim();

		this._busy.markUserAction();

		if (trimmed === '') {
			this._engine.core.removeRule('author-search');

			return;
		}
		this._engine.core.addRule(
			'author-search',
			fuzzy('authors', { keys: ['authors'], query: trimmed, threshold: FUZZY_THRESHOLD }),
		);
	}

	/**
	 * Commit the ISBN regex.
	 *
	 * @remarks
	 * A pattern that will not compile returns early WITHOUT marking a user action — the previous good rule
	 * stays applied and the results don't flinch while you're mid-typing a character class.
	 *
	 * @param value - The raw pattern text.
	 */
	protected commitIsbn(value: string): void {
		const trimmed = value.trim();

		if (trimmed === '') {
			this.isIsbnInvalid.set(false);
			this._busy.markUserAction();
			this._engine.core.removeRule('isbn-pattern');

			return;
		}

		const compiled = compilePattern(trimmed);

		if (compiled === null) {
			this.isIsbnInvalid.set(true);

			return;
		}
		this.isIsbnInvalid.set(false);
		this._busy.markUserAction();
		this._engine.core.addRule('isbn-pattern', regex('isbn13', { pattern: compiled }));
	}
}
