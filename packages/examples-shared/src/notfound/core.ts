/**
 * `notfound/core` — framework-neutral content + logic for the "filtered to zero" 404 page.
 *
 * @remarks
 * The whole 404 is an in-joke on the engine: whatever filters you toggle, the result set stays empty —
 * because a 404 *is* the empty set. This module holds the parts that don't depend on any framework (the
 * copy, the fake chip vocabulary, the toggle logic, the compute-flash timing), so the React component
 * (`@filter-enginez/examples-shared/notfound`) and the SvelteKit, Vue, Angular and vanilla 404 pages
 * render an identical page from one source. React-free by design — reachable via the
 * `./notfound-core` subpath so the non-React apps can consume it without dragging React in, exactly
 * like `./books-core`.
 *
 * @packageDocumentation
 */

/** A fake filter chip in the 404's dead-end filter row. */
export interface NotFoundChip {
	/** Stable id (also the toggle key). */
	readonly id: string;
	/** Display label. */
	readonly label: string;
}

/** The chip vocabulary — evocative of the books genres, but every one filters to nothing. */
export const NOT_FOUND_CHIPS: readonly NotFoundChip[] = [
	{ id: 'fantasy', label: 'Fantasy' },
	{ id: 'mystery', label: 'Mystery' },
	{ id: 'sci-fi', label: 'Sci-Fi' },
	{ id: 'romance', label: 'Romance' },
	{ id: 'history', label: 'History' },
	{ id: 'poetry', label: 'Poetry' },
];

/** The 404's copy — one source for every framework. */
export const NOT_FOUND_COPY = {
	/** The reimagined "404": a cyan result count that never leaves zero. */
	count: '0',
	/** CTA destination — back to the dataset hub. */
	ctaHref: '/',
	/** CTA label — "clear" the (unclearable) filters and go home. */
	ctaLabel: 'Clear filters',
	/** The status eyebrow. */
	eyebrow: 'HTTP 404 · no matches',
	/** The wry headline. */
	heading: 'No records passed this filter',
} as const;

/**
 * The 404's body copy. A function so callers can weave in the offending path when they have it (React
 * router / SvelteKit both can), falling back to a generic line otherwise.
 *
 * @param path - The unmatched pathname, if known.
 * @returns The body sentence.
 */
export function notFoundBody(path?: string | null): string {
	const where = path !== undefined && path !== null && path !== '' ? `“${path}” matched no route.` : 'That route matched nothing.';

	return `${where} Toggle every filter you like — the result set stays empty. That's what a 404 is: the empty set.`;
}

/** The result count never changes — the joke (and the truth) of the page. */
export const NOT_FOUND_RESULT_COUNT = 0;

/**
 * Toggle a chip id in/out of the selected set (symmetric difference) — pure, so React state and Svelte
 * `$state` share the exact semantics. The result count is unaffected: it is always {@link
 * NOT_FOUND_RESULT_COUNT}.
 *
 * @param selected - The currently-selected chip ids.
 * @param id - The chip id toggled.
 * @returns The next selected set.
 */
export function toggleNotFoundChip(selected: readonly string[], id: string): string[] {
	return selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
}
