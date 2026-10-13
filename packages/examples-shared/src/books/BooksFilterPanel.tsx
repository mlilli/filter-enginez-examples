/**
 * `<BooksFilterPanel />` — the facet panel for the React books apps.
 *
 * @remarks
 * A thin assembler, like the wine panel: it derives the chip vocabularies + the three numeric
 * baselines from the corpus, then fires ONE `applyFiltersAndQuery` bundle per engine change and
 * distributes the per-candidate exclusion + filtered-except-self bounds through `BooksBundleContext`
 * so every facet predictive-disables (books can't reach zero results). Runs synchronously on the
 * main thread (no worker). The bundle also carries each slider field's distribution, which the three
 * `<RangeSection>`s draw as an overlay.
 *
 * Filters wired: Genre / Format / Language (`InSetRule` chips), Publication year / Rating / Page
 * count (`RangeRule` sliders), In print / Has audiobook (`BooleanRule` checkboxes), Rated only
 * (`ExistsRule` over nullable `averageRating`), Description (`TextSearchRule`), Authors
 * (`FuzzySearchRule`, typo-tolerant), an ISBN pattern (`RegexRule` over `isbn13`), genre super-groups
 * (`InSetofSetsRule`), and Editor's picks (`BloomMembershipRule`, a Bloom pre-screen). That
 * exercises nine of the fifteen rule types through the same commit contract the SvelteKit, Vue,
 * Angular and vanilla books panels reuse.
 *
 * @packageDocumentation
 */

import type { FilterBundleQuery } from '@filter-enginez/core';
import type { Book } from '@filter-enginez/mock-data/books';

import { useFilterEngine } from '@filter-enginez/react-signals';
import { deriveBaselineBounds, type NumericBounds } from '@filter-enginez/react-ui';
import { useMemo } from 'react';

import { uniqueSorted } from '../vocabulary/index.js';
import { buildEditorsPicksFilter, FeaturedSection, SuperGroupSection } from './BookCuratedFilterSections.js';
import { BooleanSection, ChipSection, ExistsSection, FuzzySection, RangeSection, RegexSection, TextSection } from './BookFilterSections.js';
import { buildBooksBundleQuery } from './books-domain/bundle.js';
import { useIsEngineBusy } from './engineBusy.js';
import { BooksBundleContext, useFetchBooksBundle } from './filterBundle.js';

/**
 * Props for `<BooksFilterPanel />`.
 */
export interface BooksFilterPanelProps {
	/**
	 * Whether to render the panel's own "Filters" title. `true` for the desktop sidebar; the mobile
	 * drawer passes `false` (the drawer supplies its own titled header).
	 */
	readonly isHeaderVisible?: boolean;
}

/**
 * The books filter panel — vocabulary/baseline derivation + section stack.
 */
export const BooksFilterPanel = (props: BooksFilterPanelProps = {}): React.ReactElement => {
	const { isHeaderVisible = true } = props;
	const engine = useFilterEngine<Book>();
	const isBusy = useIsEngineBusy();
	const sourceData = engine.core.getSourceData();

	// Editor's-picks Bloom filter — built once from the corpus's top-rated books (the prebuilt set the
	// BloomMembershipRule probes). Rebuilds only on a source-data swap.
	const editorsPicksFilter = useMemo(() => buildEditorsPicksFilter(sourceData), [sourceData]);

	// Chip vocabularies — every distinct value in the corpus, sorted for stable ordering.
	const genres = useMemo(() => uniqueSorted(sourceData.map((b) => b.genre)), [sourceData]);
	const formats = useMemo(() => uniqueSorted(sourceData.map((b) => b.format)), [sourceData]);
	const languages = useMemo(() => uniqueSorted(sourceData.map((b) => b.language)), [sourceData]);

	// Numeric baselines — the full-corpus track extents for each range slider.
	const yearBaseline = useMemo<NumericBounds>(
		() => deriveBaselineBounds(sourceData.map((b) => b.publicationYear), { max: 2025, min: 1900 }, 1),
		[sourceData],
	);
	const pageBaseline = useMemo<NumericBounds>(
		() => deriveBaselineBounds(sourceData.map((b) => b.pageCount), { max: 1500, min: 0 }, 10),
		[sourceData],
	);
	// `averageRating` is nullable — drop the nulls before deriving the rating track.
	const ratingBaseline = useMemo<NumericBounds>(
		() => deriveBaselineBounds(
			sourceData.map((b) => b.averageRating).filter((r): r is number => r !== null),
			{ max: 5, min: 0 },
		),
		[sourceData],
	);

	// One bundle per engine change → per-candidate exclusion (chips + super-groups) + filtered-
	// except-self slider bounds + the per-field distribution the sliders draw. Books is main-thread,
	// so this resolves synchronously (no worker).
	const bundleQuery = useMemo<FilterBundleQuery>(
		() => buildBooksBundleQuery(
			{ pageCount: pageBaseline, publicationYear: yearBaseline, rating: ratingBaseline },
			{ formats, genres, languages },
		),
		[genres, formats, languages, yearBaseline, ratingBaseline, pageBaseline],
	);
	const bundle = useFetchBooksBundle(bundleQuery);
	const bundleValue = useMemo(() => ({ bundle }), [bundle]);

	return (
		<div className="fe-filter-panel">
			{isHeaderVisible ? <PanelHeader /> : null}
			{/* Scroll container — overflow plus the dim-during-compute treatment, both from the shared
			    class. Dimmed and pointer-locked while the engine recomputes so a burst of clicks can't
			    outrun the engine. */}
			<div
				className={`fe-filter-panel__scroller fe-filter-panel__body${isBusy ? ' fe-filter-panel__body--busy' : ''}`}
				aria-busy={isBusy}
			>
				<BooksBundleContext value={bundleValue}>
					<ChipSection ruleId="genre" field="genre" label="Genre" options={genres} formatLabel={replaceHyphens} />
					<SuperGroupSection />
					<ChipSection ruleId="format" field="format" label="Format" options={formats} formatLabel={replaceHyphens} />
					<ChipSection ruleId="language" field="language" label="Language" options={languages} />
					<RangeSection ruleId="publication-year" field="publicationYear" label="Publication year" ariaLabel="Publication-year range" baseline={yearBaseline} step={1} format={(n) => n.toFixed(0)} parse={(raw) => parseFloat(raw)} />
					<RangeSection ruleId="rating" field="averageRating" label="Rating" ariaLabel="Average-rating range" baseline={ratingBaseline} step={0.1} format={(n) => `${n.toFixed(1)}★`} parse={(raw) => parseFloat(raw.replace(/[★\s]/g, ''))} />
					<RangeSection ruleId="page-count" field="pageCount" label="Page count" ariaLabel="Page-count range" baseline={pageBaseline} step={10} format={(n) => `${n.toFixed(0)} pp`} parse={(raw) => parseFloat(raw.replace(/[^0-9.]/g, ''))} />
					<section className="flex flex-col gap-1">
						<BooleanSection ruleId="in-print" field="isInPrint" label="In print only" />
						<BooleanSection ruleId="has-audiobook" field="hasAudiobook" label="Has audiobook" />
						<ExistsSection ruleId="has-rating" field="averageRating" label="Rated only" />
						<FeaturedSection filter={editorsPicksFilter} />
					</section>
					<TextSection ruleId="text-search" field="description" label="Description search" placeholder="dystopia, seafaring, coming of age..." ariaLabel="Search descriptions" />
					<FuzzySection ruleId="author-search" field="authors" label="Author (typo-tolerant)" placeholder="a surname or full name..." ariaLabel="Search authors with typo tolerance" threshold={0.3} keys={['authors']} />
					<RegexSection ruleId="isbn-pattern" field="isbn13" label="ISBN pattern (regex)" placeholder="e.g. ^9780" ariaLabel="Filter by ISBN-13 pattern (regular expression)" />
				</BooksBundleContext>
			</div>
		</div>
	);
};

/**
 * Panel title — fixed at the aside's top (outside the scroller). Suppressed in the mobile drawer,
 * which supplies its own titled header.
 *
 * @internal
 */
const PanelHeader = (): React.ReactElement => {
	return (
		<div
			className="fe-filter-panel__header"
		>
			<h2 className="fe-filter-panel__title">Filters</h2>
		</div>
	);
};

/**
 * Chip-label formatter — renders a kebab-cased vocabulary value as spaced words
 * (`graphic-novel` → `graphic novel`).
 *
 * @internal
 */
function replaceHyphens(value: string): string {
	return value.replace(/-/g, ' ');
}
