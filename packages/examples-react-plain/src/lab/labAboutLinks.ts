/**
 * The `/about` → `/lab` cross-links this app supplies, and the one place the lab's route path is
 * written down.
 *
 * @remarks
 * `/about` presents `attachSimilarity(...).findSimilar(wine)` and
 * `attachSuggestions(engine).suggestions.getSuggestions(...)` as things the demo does, and until
 * `/lab` there was no button behind either. These links close that half — the docs stop
 * over-claiming at the same moment the demo starts under-claiming less.
 *
 * ### 🔴 Why this lives in the APP and not in `aboutContent.ts`
 *
 * `ABOUT_SECTIONS` is shared by all six verticals through the React-free `./about-core` subpath.
 * `/lab` exists on one. A link added to the content array would render on SvelteKit, Vue, Angular
 * and vanilla too, where it points at a route their routers answer with a 404 — a confident link
 * into a dead end, on four apps that have no lab. Supplying the link from the app that owns
 * the route is what makes it impossible to be wrong somewhere else.
 *
 * @packageDocumentation
 */

import type { AboutDemoLink } from '@filter-enginez/examples-shared/about';

/**
 * The lab's route path.
 *
 * @remarks
 * Exported so the router and these links cannot disagree. They did not have to be separate strings,
 * and a `/lab` that silently became `/laboratory` in one of two places is the kind of drift that
 * shows up as a 404 nobody can reproduce.
 */
export const LAB_ROUTE_PATH = '/lab';

/**
 * Which `/about` sections get a link to the running demonstration, keyed by section id.
 *
 * @remarks
 * Exactly the three capabilities `/lab` actually runs — `memoization` is the projections pane,
 * `similarity` the neighbor pane, `bayesian` the suggestion pane. Deliberately NOT the other five
 * sections: `roaring`, `exclusion`, `rtree`, `bloom` and `textindex` are acceleration internals with
 * no pane, and linking them would restate the over-claim this exists to fix.
 *
 * The labels name what the visitor will see rather than repeating the section title, because the
 * link sits directly under a heading that already says it.
 */
export const LAB_ABOUT_LINKS: Readonly<Record<string, AboutDemoLink>> = {
	bayesian: { label: 'See it suggesting, on the books corpus', to: LAB_ROUTE_PATH },
	memoization: { label: 'See it projecting, on the books corpus', to: LAB_ROUTE_PATH },
	similarity: { label: 'See it finding neighbors, on the books corpus', to: LAB_ROUTE_PATH },
};
