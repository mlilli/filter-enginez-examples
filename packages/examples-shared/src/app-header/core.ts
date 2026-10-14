/**
 * `@filter-enginez/examples-shared/app-header-core` — what every app's header says and where its
 * links lead, React-free.
 *
 * @remarks
 * Every page of every demo app, and the documentation, carries the same compact header: the logomark
 * and the `FILTER ENGINEZ` wordmark, both linking home to the landing site at `filterenginez.com`; a
 * mono subtitle naming the page and the app, whose app name links back to that app's own dataset hub;
 * and, on desktop widths, an explicit "All demos" link to the landing page's list of every demo.
 *
 * Six apps render that header in five framework idioms, so the strings and the URLs live here once
 * and each framework contributes markup only. The URLs are resolved from the page's location by the
 * same rule as every other cross-app link (`../compare/origins.ts`): a developer on `pnpm dev`
 * reaches the local site server, a visitor reaches the deployed site.
 *
 * The markup and its classes (`fe-books-app__brand` and its elements, in `ui-styles`) are the one
 * shared header family, described where they are defined.
 *
 * @packageDocumentation
 */

import { allDemosUrl, type CompareLocation, type DeploymentLayout, siteHomeUrl } from '../compare/origins.js';
import { type EngineTier, stackLabel, vertical, type VerticalId, verticalSubtitle } from '../verticals/verticals.js';

/** The accessible name of the header's logomark link to the landing site. */
export const SITE_HOME_LABEL = 'Filter EngineZ home';

/** The visible text of the header's link to the landing page's list of every demo. */
export const ALL_DEMOS_LABEL = 'All demos';

/**
 * The accessible name of the header's `<nav>`, which holds its links to the landing site and the hub.
 *
 * @remarks
 * Named, because a page with more than one navigation landmark (the documentation's sidebar, the
 * landing site's own page links) needs each told apart by name.
 */
export const BRAND_NAV_LABEL = 'Filter EngineZ';

/** The path of an app's own start page, its dataset hub. */
export const APP_HUB_PATH = '/';

/**
 * The page part of the subtitle on the pages that are not a dataset route.
 *
 * @remarks
 * A dataset route names its dataset (`Wine · SvelteKit (server)`); these name the page instead, on
 * the same axis, so every header in every app reads `Page · App`.
 */
export const HEADER_PAGE_LABELS = {
	docs: 'Docs',
	hub: 'Datasets',
	lab: 'Lab',
	notFound: 'Not found',
} as const;

/** The subtitle's link to the app's own hub. */
export interface AppHubLink {
	/** Where it leads: the app's start page, {@link APP_HUB_PATH}. */
	readonly href: string;
	/** Its accessible name, which starts with its visible text — see {@link appHubLabel}. */
	readonly label: string;
	/** Its visible text, the app's name, e.g. `SvelteKit`. */
	readonly text: string;
}

/**
 * The header subtitle, split around the part that links to the app's hub.
 *
 * @remarks
 * `lead + hub.text + trail` is always exactly {@link verticalSubtitle}'s text, so a page asserting on
 * the whole subtitle (the e2e boot signal does) reads the same string whether or not the app name in
 * the middle of it is a link.
 */
export interface AppHeaderSubtitle {
	/** The link to the app's hub, or `null` outside the six apps (the documentation site). */
	readonly hub: AppHubLink | null;
	/** Everything before the app name, e.g. `Wine · `. The whole subtitle when there is no app. */
	readonly lead: string;
	/** The full subtitle, e.g. `Wine · SvelteKit (server)`. */
	readonly text: string;
	/** Everything after the app name — the engine tier, e.g. ` (server)` — or an empty string. */
	readonly trail: string;
}

/**
 * The accessible name of the subtitle's link to an app's hub.
 *
 * @remarks
 * It starts with the visible link text (the app's name), so speech-input users can activate it by
 * saying what they see, and says where it goes, which the visible name alone does not.
 *
 * @param verticalId - The app whose hub the link opens.
 * @returns For example `SvelteKit dataset hub`.
 */
export function appHubLabel(verticalId: VerticalId): string {
	return `${vertical(verticalId).name} dataset hub`;
}

/**
 * Split a page's subtitle around the app name that links to the hub.
 *
 * @param page - The dataset or page the header belongs to, e.g. `Wine` or {@link HEADER_PAGE_LABELS}.
 * @param verticalId - The app rendering the page, or `undefined` outside any app (the documentation
 *   site), where the subtitle is the page label alone.
 * @param tier - The engine tier the route runs, when it names one.
 * @returns The subtitle's parts and its full text.
 *
 * @example
 * ```ts
 * appHeaderSubtitle('Wine', 'sveltekit', 'server');
 * // {
 * //   hub: { href: '/', label: 'SvelteKit dataset hub', text: 'SvelteKit' },
 * //   lead: 'Wine · ', text: 'Wine · SvelteKit (server)', trail: ' (server)',
 * // }
 * ```
 */
export function appHeaderSubtitle(page: string, verticalId?: VerticalId, tier?: EngineTier): AppHeaderSubtitle {
	if (verticalId === undefined) {
		return { hub: null, lead: page, text: page, trail: '' };
	}

	const { name } = vertical(verticalId);

	return {
		hub: { href: APP_HUB_PATH, label: appHubLabel(verticalId), text: name },
		lead: `${page} · `,
		text: verticalSubtitle(page, verticalId, tier),
		// Derived from the stack label rather than restating its tier wording, so the parts cannot drift
		// from the one string `verticalSubtitle` builds.
		trail: stackLabel(verticalId, tier).slice(name.length),
	};
}

/** Where the header's two links to the landing site lead. */
export interface AppHeaderLinks {
	/** The landing page's list of every demo, for the "All demos" link. */
	readonly allDemosHref: string;
	/** The landing site's home page, for the logomark and the wordmark. */
	readonly homeHref: string;
}

/**
 * Resolve the header's links to the landing site for the page's location.
 *
 * @param location - The current location; only `hostname` and `origin` are read.
 * @param layout - Override the detected layout. Tests and previews only.
 * @returns Both absolute URLs.
 */
export function appHeaderLinks(location: CompareLocation, layout?: DeploymentLayout): AppHeaderLinks {
	return {
		allDemosHref: allDemosUrl(location, layout),
		homeHref: siteHomeUrl(location, layout),
	};
}
