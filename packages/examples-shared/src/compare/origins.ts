/**
 * Where each vertical lives, resolved at runtime rather than baked in at build time.
 *
 * @remarks
 * `/compare` is the only page in the repo that has to name an origin it is not currently served
 * from, so it is the only place this question arises. Three constraints shaped the answer:
 *
 * 1. **Angular cannot read `import.meta.env`.** `@angular/build` does not define Vite's constants —
 *    `examples-angular/src/main.ts` says so in as many words, and pays for it with a runtime
 *    `isDevMode()` guard. A build-time origin scheme would therefore need a second mechanism for
 *    Angular alone, permanently.
 * 2. **Six env configs are six copies of one contract.** Nothing would keep six `VITE_FE_ORIGIN_*`
 *    files in step.
 * 3. **Two production layouts are supported.** `paths` serves every app under its own base on one
 *    origin; `subdomains` gives each app its own host. Both branches are implemented and tested.
 *
 * So this is a **pure function of `(id, location, layout)`**. It behaves identically in all six
 * verticals because it touches no build constants, it is unit-testable without a browser, and
 * switching layouts means editing {@link PRODUCTION_LAYOUT} rather than six configurations.
 *
 * @packageDocumentation
 */

import { vertical, type VerticalId } from '../verticals/verticals.js';

/**
 * The parts of `window.location` this module reads.
 *
 * @remarks
 * Structural rather than `Location`, for the same reason `attachSimilarity` takes a structural
 * engine target: it keeps the module testable without a DOM, and makes the two inputs it actually
 * depends on visible in the signature instead of hidden inside a global.
 */
export interface CompareLocation {
	/** Host without port — the dev check. */
	readonly hostname: string;
	/** Scheme + host + port — the base for the `paths` layout. */
	readonly origin: string;
}

/** How the six verticals are addressed. */
export type DeploymentLayout = 'dev' | 'paths' | 'subdomains';

/**
 * The production layout: how a deployed (non-loopback) page addresses the six verticals.
 *
 * @remarks
 * `paths` — one origin with each app under a `base`, so `/compare`'s links stay same-origin and the
 * shareable `?f=` round-trip needs no CORS story. `subdomains` is the alternative for a deployment
 * that hosts each app separately; its branch is implemented and tested too.
 *
 * This is deliberately NOT read from an environment variable. See the module docblock.
 */
export const PRODUCTION_LAYOUT: Exclude<DeploymentLayout, 'dev'> = 'paths';

/** The apex the `subdomains` layout hangs off. */
const SUBDOMAIN_APEX = 'innov8.io';

/** Prefix distinguishing a vertical's subdomain from anything else on the apex. */
const SUBDOMAIN_PREFIX = 'fe-';

/** Hostnames that mean "a developer is running `pnpm dev` right now". */
const DEV_HOSTNAMES = new Set(['0.0.0.0', '127.0.0.1', '::1', 'localhost']);

/**
 * Which layout applies, given where the page is currently served from.
 *
 * @remarks
 * Runtime detection rather than configuration, because the alternative is asking every vertical to
 * declare its own mode and then keeping six declarations honest. A developer on `pnpm dev` and a
 * visitor on the deployed site are distinguishable from `hostname` alone.
 *
 * @param location - The current location; only `hostname` is read.
 * @returns `'dev'` on a loopback host, otherwise {@link PRODUCTION_LAYOUT}.
 */
export function deploymentLayout(location: CompareLocation): DeploymentLayout {
	return DEV_HOSTNAMES.has(location.hostname) || location.hostname.endsWith('.localhost')
		? 'dev'
		: PRODUCTION_LAYOUT;
}

/**
 * The origin serving a given vertical.
 *
 * @remarks
 * In `dev` this is the registry's `devOrigin`, which `tests/tooling/devServerPorts.test.ts` already
 * pins against `playwright.config.ts` — so the ports cannot drift out from under this without a
 * gate failing.
 *
 * @param id - Which vertical to locate.
 * @param location - The current location.
 * @param layout - Override the detected layout. Present for tests and for rendering a preview of
 *   the other deployment shape; production callers should omit it.
 * @returns An absolute origin with no trailing slash, e.g. `http://127.0.0.1:5174`.
 */
export function resolveVerticalOrigin(
	id: VerticalId,
	location: CompareLocation,
	layout: DeploymentLayout = deploymentLayout(location),
): string {
	switch (layout) {
		case 'dev':
			return vertical(id).devOrigin;
		case 'paths':
			return `${location.origin}/${id}`;
		case 'subdomains':
			return `https://${SUBDOMAIN_PREFIX}${id}.${SUBDOMAIN_APEX}`;
	}
}
