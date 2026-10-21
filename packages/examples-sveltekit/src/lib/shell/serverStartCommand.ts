/**
 * `serverStartCommand` — the command that starts this app's filter server, for the offline screens of
 * `/books-server` and `/wine-server`.
 *
 * @remarks
 * SvelteKit serves the routes' `query` endpoints from its own server tier, so the server to start is
 * this app's dev server rather than the examples API the other apps query
 * (`EXAMPLES_SERVER_START_COMMAND` in `@filter-enginez/examples-shared/boot-caption`). The words
 * around the command are the shared `SERVER_ROUTE_SCREEN_COPY`.
 *
 * @packageDocumentation
 */

/** Starts this app, whose server tier answers the server-backed routes' queries. */
export const SVELTEKIT_SERVER_START_COMMAND = 'pnpm --filter @filter-enginez/examples-sveltekit dev';
