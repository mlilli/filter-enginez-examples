/**
 * `resultCopy` — the words and the paging window of every dataset's results column, for every app.
 *
 * @remarks
 * Six apps render the same results column for each dataset: a count with a noun, a scrolling grid of
 * cards, an empty state, and a notice once the grid stops growing. Written per app, those strings and
 * the paging window drift apart silently (an empty-state hint worded four ways, a count reading
 * "results" in one app and "bottles" in another). Each app reads them from here, so a change to one
 * dataset's wording reaches all six at once.
 *
 * Framework-free and import-free, like the rest of `./verticals`: the strings are plain data, and
 * each app renders them in its own markup.
 *
 * @packageDocumentation
 */

/** The datasets every app renders a results column for. */
export type ResultDataset = 'books' | 'real-estate' | 'wine';

/**
 * How a result grid grows: the first batch, the batch it adds each time the end of the grid scrolls
 * into view, and the most cards it ever renders at once.
 *
 * @remarks
 * Rendering a whole result set would build one card per match, which on the 150,000-wine tier locks
 * the tab and reads as a slow engine when the cost is all paint. Past the cap, the grid stops growing
 * and {@link resultCapNotice} says so.
 */
export const RESULT_GRID_WINDOW = {
	/** Cards added each time the end of the grid scrolls into view. */
	batch: 60,
	/** The most cards ever rendered at once. */
	cap: 1500,
	/** Cards rendered before any scrolling. */
	initial: 60,
} as const;

/**
 * The next render limit once the end of the grid has scrolled into view.
 *
 * @param current - The current render limit.
 * @param total - How many results there are.
 * @returns The grown limit, never past the results or {@link RESULT_GRID_WINDOW}'s cap.
 */
export function nextRenderLimit(current: number, total: number): number {
	return Math.min(current + RESULT_GRID_WINDOW.batch, total, RESULT_GRID_WINDOW.cap);
}

/**
 * Whether the grid has stopped short of the results because it reached the cap.
 *
 * @param rendered - How many cards are rendered.
 * @param total - How many results there are.
 * @returns `true` only when the cap, not the result count, is what stopped the grid.
 */
export function isRenderCapped(rendered: number, total: number): boolean {
	return rendered >= RESULT_GRID_WINDOW.cap && total > RESULT_GRID_WINDOW.cap;
}

/** One dataset's results-column copy. */
export interface ResultCopy {
	/** The empty state's second line: what to loosen. */
	readonly emptyHint: string;
	/** The empty state's headline. */
	readonly emptyTitle: string;
	/** The accessible name of the result list, for a given result count. */
	readonly listLabel: (count: number) => string;
	/** The noun after the result count in the results header, e.g. `bottles` in `1,204 bottles`. */
	readonly noun: string;
	/** The accessible name of the grid's scrolling region. */
	readonly scrollerLabel: string;
}

/** Each dataset's results-column copy. */
export const RESULT_COPY: Readonly<Record<ResultDataset, ResultCopy>> = {
	books: {
		emptyHint: 'Try widening the publication-year range or clearing a genre.',
		emptyTitle: 'No books match the current filters.',
		listLabel: (count) => `${count.toLocaleString()} matching books`,
		noun: 'results',
		scrollerLabel: 'Book results',
	},
	'real-estate': {
		emptyHint: 'Try widening the price range or the search radius, or clearing a location.',
		emptyTitle: 'No listings match the current filters.',
		listLabel: (count) => `${count.toLocaleString()} matching listings`,
		noun: 'listings',
		scrollerLabel: 'Listing results',
	},
	wine: {
		emptyHint: 'Try widening the price range or clearing a varietal.',
		emptyTitle: 'No wines match the current filters.',
		listLabel: (count) => `${count.toLocaleString()} matching wines`,
		noun: 'bottles',
		scrollerLabel: 'Wine results',
	},
};

/**
 * The notice a capped grid shows under its last card.
 *
 * @remarks
 * Only shown when {@link isRenderCapped} is `true`: below the cap the grid keeps growing as it
 * scrolls, so there is nothing to explain.
 *
 * @param rendered - How many cards are rendered.
 * @param total - How many results there are.
 * @returns The notice's three parts, so an app can style the two numbers.
 */
export function resultCapNotice(rendered: number, total: number): {
	readonly rendered: string;
	readonly suffix: string;
	readonly total: string;
} {
	return {
		rendered: rendered.toLocaleString(),
		suffix: 'matches · narrow your filters to surface the rest',
		total: total.toLocaleString(),
	};
}
