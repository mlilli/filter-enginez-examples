/**
 * Types for `route-shells.mjs`.
 *
 * @remarks
 * The module is plain JavaScript so a build step runs it with bare `node`, after bundlers that take no
 * plugin; `tests/tooling` imports it, and typed lint cannot read types out of an unchecked `.mjs`, the
 * same seam as `deploy-targets.d.mts`. The catalog's types are restated structurally rather than
 * imported from `examples-shared`, whose source this directory does not compile.
 *
 * @packageDocumentation
 */

/** A host with a router of its own: one of the six demo apps, or the documentation site. */
export type RoutedHost = 'angular' | 'docs' | 'react-plain' | 'react-rtk' | 'sveltekit' | 'vanilla' | 'vue';

/** A host whose build writes a shell per page. */
export type ShellHost = Exclude<RoutedHost, 'sveltekit'>;

/** A page's head, as `examples-shared/page-meta` decides it. */
export interface ShellPageMeta {
	readonly canonicalUrl: string | null;
	readonly description: string;
	readonly title: string;
}

/** The functions of `packages/examples-shared/src/page-meta/hostPages.ts` the build calls. */
export interface HostPagesModule {
	readonly ROUTED_HOSTS: readonly RoutedHost[];
	readonly hostNotFoundMeta: (host: ShellHost) => ShellPageMeta;
	readonly hostPagePaths: (host: RoutedHost) => readonly string[];
	readonly hostPages: (host: ShellHost) => readonly { readonly meta: ShellPageMeta; readonly path: string }[];
	readonly isShellHost: (host: RoutedHost) => host is ShellHost;
	readonly shellFileName: (path: string) => string;
}

/** The constants a route table names its paths by. */
export interface RouteConstants {
	readonly DOCS_APP_BASE_PATH: string;
	readonly DOCS_SITE_BASE_PATH: string;
}

/** The catalog, and the constants, as {@link loadRouteCatalog} loads them. */
export interface RouteCatalog {
	readonly constants: RouteConstants & { readonly LAB_ROUTE_PATH: string };
	readonly hostPages: HostPagesModule;
}

/** The repository root. */
export const REPO_ROOT: string;

/** The page catalog's path. */
export const HOST_PAGES_MODULE: string;

/** The file a host answers every unknown path with. */
export const NOT_FOUND_SHELL: '404.html';

/** Each routed host's package directory under `packages/`. */
export const HOST_PACKAGES: Readonly<Record<RoutedHost, string>>;

/**
 * Load the page catalog and the constants a router names its paths by.
 *
 * @returns The catalog.
 */
export function loadRouteCatalog(): Promise<RouteCatalog>;

/**
 * The route patterns a host's router declares, other than its catch-all.
 *
 * @param host - The host.
 * @param constants - The values a route table names paths by.
 * @returns The file the routes are read from, and the patterns.
 */
export function routerPatterns(host: RoutedHost, constants: RouteCatalog['constants']): { readonly patterns: readonly string[]; readonly source: string };

/**
 * Whether a path matches a route pattern.
 *
 * @param path - A page's path.
 * @param pattern - A route pattern.
 * @returns Whether it matches.
 */
export function pathMatchesPattern(path: string, pattern: string): boolean;

/**
 * Where a router and a host's page list disagree.
 *
 * @param patterns - The router's patterns.
 * @param paths - The host's pages.
 * @returns The routes no page uses, and the pages no route renders.
 */
export function routeMismatches(patterns: readonly string[], paths: readonly string[]): { readonly unlisted: readonly string[]; readonly unrouted: readonly string[] };

/**
 * Check a host's router against its page list.
 *
 * @param host - The host.
 * @param catalog - The catalog.
 * @returns The host's pages.
 */
export function checkRouterAgainstCatalog(host: RoutedHost, catalog: RouteCatalog): readonly string[];

/**
 * Write a page's head into a built page.
 *
 * @param html - The built page.
 * @param meta - The page's head.
 * @returns The page with that head.
 */
export function writeShellHead(html: string, meta: ShellPageMeta): string;
