/**
 * The `filterenginez.com` Worker's one decision: send `www.` to the apex, serve everything else from
 * the static assets.
 *
 * @remarks
 * Both hosts are custom domains of the one Worker (`wrangler.jsonc`), and `run_worker_first: true`
 * routes every request through it before any asset is matched — otherwise `www.filterenginez.com/`
 * would be answered straight from the assets and never redirect. The cost is one Worker invocation per
 * request to a page that is a single HTML file, a stylesheet and a few images.
 *
 * The redirect is a 301 that keeps the path and the query string, so a `www.` link to any page lands
 * on the same page at the canonical host, and search engines fold the two hosts into one.
 *
 * The logic lives here rather than in `worker.ts` because the Workers runtime reads every named export
 * of the main module as an entry point and refuses to start on one that is not a handler, and these
 * constants are needed by the tests.
 *
 * Structural types rather than `@cloudflare/workers-types`: the Worker touches one binding method and
 * the standard `Request` / `Response`.
 *
 * @packageDocumentation
 */

/** The canonical host. The page's `<link rel="canonical">` and the sitemap name it. */
export const CANONICAL_HOST = 'filterenginez.com';

/** The alias that redirects to {@link CANONICAL_HOST}. */
export const WWW_HOST = `www.${CANONICAL_HOST}`;

/** The Worker's bindings, as declared by `assets.binding` in `wrangler.jsonc`. */
export interface SiteWorkerEnvironment {
	/** The built landing page (`dist/`). */
	readonly ASSETS: {
		/** Answer a request from the static assets, including the `404.html` fallback. */
		fetch(request: Request): Promise<Response>;
	};
}

/**
 * Answer one request: a permanent redirect for the `www.` host, the static assets for anything else.
 *
 * @param request - The incoming request.
 * @param environment - The Worker's bindings.
 * @returns The response.
 */
export async function handleSiteRequest(request: Request, environment: SiteWorkerEnvironment): Promise<Response> {
	const url = new URL(request.url);

	if (url.hostname === WWW_HOST) {
		url.hostname = CANONICAL_HOST;
		url.protocol = 'https:';
		url.port = '';
		// A browser never sends the fragment, and re-applies its own to a `Location` that has none.
		url.hash = '';

		return Response.redirect(url.toString(), 301);
	}

	return environment.ASSETS.fetch(request);
}
