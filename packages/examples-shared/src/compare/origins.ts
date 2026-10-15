/**
 * Where each vertical lives, resolved at runtime rather than baked in at build time.
 *
 * @remarks
 * The comparison page names an origin per vertical, and every app links to the landing site at the
 * apex — its home page from every header, the one "How the engine works" page, and the comparison
 * page from every Compare button — so each has to name an origin it is not currently served from.
 * Three constraints shaped the answer:
 *
 * 1. **Angular cannot read `import.meta.env`.** `@angular/build` does not define Vite's constants —
 *    `examples-angular/src/main.ts` says so in as many words, and its one build-time switch comes from
 *    an `angular.json` `define` constant instead. A build-time origin scheme would therefore need that
 *    second mechanism for Angular alone, permanently.
 * 2. **Six env configs are six copies of one contract.** Nothing would keep six `VITE_FE_ORIGIN_*`
 *    files in step.
 * 3. **A production build is also served locally.** `vite preview`, `ng serve --configuration
 *    production` and `wrangler dev` all run the production bundle on a loopback host, where the
 *    links must still reach the other local servers rather than the deployed sites.
 *
 * So this is a **pure function of `(id, location, layout)`**. It behaves identically in all six
 * verticals because it touches no build constants, it is unit-testable without a browser, and the
 * question "am I deployed?" is answered by the one input that actually knows: the host serving the
 * page.
 *
 * Deployed, every vertical is its own site on its own subdomain (`react-rtk.filterenginez.com`,
 * `svelte.filterenginez.com`, …), so the production origin is a registry lookup — see
 * {@link VerticalDescriptor.productionOrigin}.
 *
 * @packageDocumentation
 */

import {
	DEMOS_SECTION_ID,
	HOW_IT_WORKS_PATH,
	SITE,
	vertical,
	type VerticalDescriptor,
	type VerticalId,
} from '../verticals/verticals.js';

/**
 * The parts of `window.location` this module reads.
 *
 * @remarks
 * Structural rather than `Location`, for the same reason `attachSimilarity` takes a structural
 * engine target: it keeps the module testable without a DOM, and makes the input it actually
 * depends on visible in the signature instead of hidden inside a global.
 */
export interface CompareLocation {
	/** Host without port — the dev check. */
	readonly hostname: string;
	/** Scheme + host + port. */
	readonly origin: string;
}

/**
 * How the six verticals are addressed: their local dev servers, or their deployed subdomains.
 */
export type DeploymentLayout = 'dev' | 'production';

/** Hostnames that mean "a developer is running the app on this machine right now". */
const DEV_HOSTNAMES = new Set(['0.0.0.0', '127.0.0.1', '::1', 'localhost']);

/**
 * Which layout applies, given where the page is currently served from.
 *
 * @remarks
 * Runtime detection rather than configuration, because the alternative is asking every vertical to
 * declare its own mode and then keeping six declarations honest. A developer on `pnpm dev` (or a
 * local preview of a production build) and a visitor on the deployed site are distinguishable from
 * `hostname` alone.
 *
 * @param location - The current location; only `hostname` is read.
 * @returns `'dev'` on a loopback host, otherwise `'production'`.
 */
export function deploymentLayout(location: CompareLocation): DeploymentLayout {
	return DEV_HOSTNAMES.has(location.hostname) || location.hostname.endsWith('.localhost')
		? 'dev'
		: 'production';
}

/**
 * The origin serving a given vertical.
 *
 * @remarks
 * In `dev` this is the registry's `devOrigin`, which `tests/tooling/devServerPorts.test.ts` pins
 * against `playwright.config.ts`; in `production` it is the registry's `productionOrigin`, which
 * `tests/tooling/cloudflareDeploy.test.ts` pins against the app's own `wrangler.jsonc`. Neither
 * origin can drift out from under this without a gate failing.
 *
 * @param id - Which vertical to locate.
 * @param location - The current location.
 * @param layout - Override the detected layout. Present for tests and for rendering a preview of
 *   the other deployment shape; production callers should omit it.
 * @returns An absolute origin with no trailing slash, e.g. `http://127.0.0.1:5191` or
 *   `https://react-rtk.filterenginez.com`.
 */
export function resolveVerticalOrigin(
	id: VerticalId,
	location: CompareLocation,
	layout: DeploymentLayout = deploymentLayout(location),
): string {
	const descriptor: VerticalDescriptor = vertical(id);

	return layout === 'dev' ? descriptor.devOrigin : descriptor.productionOrigin;
}

/**
 * The origin serving the landing site at the apex ({@link SITE}).
 *
 * @remarks
 * The same decision as {@link resolveVerticalOrigin}, over the site's two origins instead of a
 * vertical's: its local dev server on a loopback host, `https://filterenginez.com` anywhere else.
 *
 * @param location - The current location.
 * @param layout - Override the detected layout; production callers should omit it.
 * @returns An absolute origin with no trailing slash.
 */
export function resolveSiteOrigin(location: CompareLocation, layout: DeploymentLayout = deploymentLayout(location)): string {
	return layout === 'dev' ? SITE.devOrigin : SITE.productionOrigin;
}

/**
 * The absolute URL of a page on the landing site, for a link from any app.
 *
 * @remarks
 * Every cross-origin link to the apex goes through here, so "where does the landing site live" is
 * decided once, by {@link resolveSiteOrigin}: a developer on `pnpm dev` reaches the local site server
 * and a visitor reaches `https://filterenginez.com`.
 *
 * @param path - A root-relative path on the site, with any fragment, e.g. `/how-it-works` or `/#demos`.
 * @param location - The current location.
 * @param layout - Override the detected layout; production callers should omit it.
 * @returns The absolute URL, e.g. `https://filterenginez.com/how-it-works`.
 */
export function siteUrl(
	path: string,
	location: CompareLocation,
	layout: DeploymentLayout = deploymentLayout(location),
): string {
	return `${resolveSiteOrigin(location, layout)}${path}`;
}

/**
 * The absolute URL of the landing site's home page — where the logo in every app's header leads.
 *
 * @param location - The current location.
 * @param layout - Override the detected layout; production callers should omit it.
 * @returns The home page's absolute URL, e.g. `https://filterenginez.com/`.
 */
export function siteHomeUrl(location: CompareLocation, layout: DeploymentLayout = deploymentLayout(location)): string {
	return siteUrl('/', location, layout);
}

/**
 * The absolute URL of the landing page's list of every demo — where each app's "All demos" link leads.
 *
 * @param location - The current location.
 * @param layout - Override the detected layout; production callers should omit it.
 * @returns The section's absolute URL, e.g. `https://filterenginez.com/#demos`.
 */
export function allDemosUrl(location: CompareLocation, layout: DeploymentLayout = deploymentLayout(location)): string {
	return siteUrl(`/#${DEMOS_SECTION_ID}`, location, layout);
}

/**
 * The absolute URL of the "How the engine works" page, for a link from any app.
 *
 * @remarks
 * There is one such page, on the landing site, rather than a copy in each app, so the link always leaves
 * the current origin; see {@link siteUrl}.
 *
 * @param location - The current location.
 * @param layout - Override the detected layout; production callers should omit it.
 * @returns The page's absolute URL, e.g. `https://filterenginez.com/how-it-works`.
 *
 * @example
 * ```ts
 * link.href = howItWorksUrl(window.location);
 * ```
 */
export function howItWorksUrl(location: CompareLocation, layout: DeploymentLayout = deploymentLayout(location)): string {
	return siteUrl(HOW_IT_WORKS_PATH, location, layout);
}
