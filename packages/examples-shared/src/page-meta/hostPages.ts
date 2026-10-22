/**
 * `page-meta/hostPages` — every page each host serves, with its head: the list every router is held
 * to, and the one each client-routed host's build writes an HTML shell per page from.
 *
 * @remarks
 * A single-page app's assets answer a path they have no file for one of two ways: with the app's
 * `index.html` and a 200, or with a `404.html` and a 404. The first makes every unknown address a page
 * that exists to a crawler. So each client-routed host's build writes a shell for every page it
 * serves, from the lists below, and a `404.html` for everything else, which the host serves with
 * status 404 (`not_found_handling: "404-page"` in its `wrangler.jsonc`). Every shell is the app's own
 * built `index.html` with that page's title, description and canonical URL written into its head, so
 * a crawler that does not run the app reads the head the app writes as it navigates. The app boots on
 * any of them, the not-found page included, and renders the route the address names.
 *
 * The lists are the ones the sitemap and every page's head already read: each demo app's own pages
 * from {@link verticalIndexablePaths}, and, where an app serves the documentation, every documentation
 * page from {@link docsPagePaths}, under `/docs`. The documentation site serves the documentation
 * alone, at its root. The SvelteKit app's server renders every route and answers an unknown one with
 * its error page and a 404, so it needs no shells; its routes are held to its list all the same.
 *
 * Read at build time by `scripts/write-route-shells.mjs` and `scripts/check-app-routes.mjs`, which
 * also hold every router's route list to {@link hostPagePaths}. No app imports it: the documentation
 * catalog it reads is tens of kilobytes of text.
 *
 * @packageDocumentation
 */

import { vertical, type VerticalId, VERTICALS } from '../verticals/verticals.js';
import { DOCS_HOME_TITLE, docsPageMeta, docsPagePaths } from './docsPageMeta.js';
import {
	DOCS_APP_BASE_PATH,
	DOCS_SITE_BASE_PATH,
	isDocsPath,
	notFoundPageMeta,
	type PageMeta,
	verticalIndexablePaths,
	verticalPageMeta,
} from './pageMeta.js';

/** A host with a router of its own: one of the six demo apps, or the documentation site. */
export type RoutedHost = VerticalId | 'docs';

/** A host whose build writes a shell per page: every routed host but SvelteKit, which renders on the server. */
export type ShellHost = Exclude<RoutedHost, 'sveltekit'>;

/** Every routed host: the six demo apps in the registry's order, then the documentation site. */
export const ROUTED_HOSTS: readonly RoutedHost[] = [...VERTICALS.map(({ id }) => id), 'docs'];

/** One page a host serves: its path and its head. */
export interface HostPage {
	/** The path, without a trailing slash except the home's `/`. */
	readonly path: string;
	/** Its title, description and canonical URL. */
	readonly meta: PageMeta;
}

/**
 * Whether a host's build writes a shell per page.
 *
 * @param host - A routed host.
 * @returns `true` for every host but SvelteKit.
 */
export function isShellHost(host: RoutedHost): host is ShellHost {
	return host !== 'sveltekit';
}

/**
 * Every page a host serves.
 *
 * @param host - The host.
 * @returns The paths, the home first: for a demo app its own pages, then the documentation under
 *   `/docs` where it serves it; for the documentation site every documentation page at its root.
 */
export function hostPagePaths(host: RoutedHost): readonly string[] {
	if (host === 'docs') {
		return docsPagePaths(DOCS_SITE_BASE_PATH);
	}

	const docsPaths = vertical(host).routes.includes(DOCS_APP_BASE_PATH) ? docsPagePaths(DOCS_APP_BASE_PATH) : [];

	return [...verticalIndexablePaths(host), ...docsPaths];
}

/**
 * Every page a host serves, each with the head it carries.
 *
 * @param host - The host.
 * @returns The pages, in {@link hostPagePaths} order.
 */
export function hostPages(host: ShellHost): readonly HostPage[] {
	return hostPagePaths(host).map((path) => {
		if (host === 'docs') {
			return { meta: docsPageMeta(path, DOCS_SITE_BASE_PATH), path };
		}

		return { meta: isDocsPath(path) ? docsPageMeta(path, DOCS_APP_BASE_PATH) : verticalPageMeta(host, path), path };
	});
}

/**
 * The head of a host's not-found page, the `404.html` it answers every other path with.
 *
 * @param host - The host.
 * @returns A title naming the host, no description, no canonical.
 */
export function hostNotFoundMeta(host: ShellHost): PageMeta {
	return notFoundPageMeta(host === 'docs' ? DOCS_HOME_TITLE : vertical(host).pageTitle);
}

/**
 * The file a page's shell is written to, relative to the build output, for Workers static assets'
 * default `html_handling` (`auto-trailing-slash`) to serve at the page's path.
 *
 * @remarks
 * `/` is `index.html`; any other path is the path plus `.html` (`/wine` → `wine.html`,
 * `/docs/rules/range` → `docs/rules/range.html`), which the assets serve at the path itself, and
 * whose `.html` and trailing-slash spellings they redirect to it.
 *
 * @param path - A page's path.
 * @returns The file's path, `/`-separated, without a leading `/`.
 */
export function shellFileName(path: string): string {
	return path === '/' ? 'index.html' : `${path.slice(1)}.html`;
}
