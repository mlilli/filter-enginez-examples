/**
 * `@filter-enginez/examples-shared/viewport-core` — the React-FREE half of the viewport slice.
 *
 * @remarks
 * The `./viewport` barrel exports `useMediaQuery` / `useIsDesktop`, which are React hooks, so a
 * non-React vertical importing it for one number would drag `react` into its bundle — exactly what
 * `./books-boot-core` exists to prevent for the books boot. This subpath carries the number alone.
 *
 * There is precisely one thing in here, and it earns its own entry point because it is a value all
 * six verticals and one stylesheet must agree on. A `1024` literal in each Vue, Svelte, Angular and
 * vanilla view plus `useMediaQuery.ts` would be many spellings of one breakpoint, with nothing to
 * fail if one of them changed alone.
 *
 * @packageDocumentation
 */

/**
 * The `lg` breakpoint, in px — where a filter panel stops collapsing behind a button and becomes a sidebar.
 *
 * @remarks
 * Load-bearing in both directions. Above it, `ui-styles`' `.fe-sidebar-app__main` /
 * `.fe-books-app__main` switch to a two-column grid and each shell stops rendering its "Filters"
 * button; below it, the panel is hidden behind that button. A script that disagreed with the
 * stylesheet by a pixel would give someone a viewport with no visible panel AND no button to open
 * one — so the media queries here and the `@media (min-width: 1024px)` blocks in `ui-styles` are one
 * decision expressed twice, and this constant is the half that code can share.
 */
export const DESKTOP_MIN_WIDTH_PX = 1024;

/** The `matchMedia` query every shell uses for the switch above. */
export const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`;
