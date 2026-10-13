/**
 * The `filterenginez.com` Worker's two decisions: send `www.` to the apex, and send the non-canonical
 * spellings of a page to its one canonical URL; serve everything else from the static assets.
 *
 * @remarks
 * Both hosts are custom domains of the one Worker (`wrangler.jsonc`), and `run_worker_first: true`
 * routes every request through it before any asset is matched — otherwise `www.filterenginez.com/`
 * would be answered straight from the assets and never redirect. The cost is one Worker invocation per
 * request to a site of three HTML pages, their stylesheets and scripts, and a few images.
 *
 * The redirect is a 301 that keeps the path and the query string, so a `www.` link to any page lands
 * on the same page at the canonical host, and search engines fold the two hosts into one.
 *
 * A page other than the home page is published at one extensionless path ({@link PAGE_PATHS}), the URL
 * its `<link rel="canonical">` and the sitemap name. Workers static assets already serve
 * `how-it-works.html` there and answer `/how-it-works.html` and `/how-it-works/` with a temporary
 * (307) redirect to it; since every request reaches this Worker first anyway, those two spellings get
 * a permanent 301 here instead, which is what tells a search engine the move is for good. The redirect
 * stays on the request's own host, so a local `wrangler dev` keeps working.
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

/**
 * Every page besides the home page, at its canonical path.
 *
 * @remarks
 * One per HTML entry in `vite.config.ts` other than `index.html` and `404.html`;
 * `tests/tooling/cloudflareDeploy.test.ts` checks this list against those entries and the sitemap.
 */
export const PAGE_PATHS: readonly string[] = ['/how-it-works'];

/**
 * The non-canonical spellings of each page (`/how-it-works.html`, `/how-it-works/`) and the canonical
 * path each redirects to.
 *
 * @remarks
 * A `Map`, because the key is an untrusted request path and an object lookup would also answer for
 * inherited names such as `/constructor`.
 */
const PAGE_ALIASES: ReadonlyMap<string, string> = new Map(
	PAGE_PATHS.flatMap((path) => [
		[`${path}.html`, path],
		[`${path}/`, path],
	]),
);

/** The Worker's bindings, as declared by `assets.binding` in `wrangler.jsonc`. */
export interface SiteWorkerEnvironment {
	/** The built landing page (`dist/`). */
	readonly ASSETS: {
		/** Answer a request from the static assets, including the `404.html` fallback. */
		fetch(request: Request): Promise<Response>;
	};
}

/**
 * Answer one request: a permanent redirect for the `www.` host or a non-canonical page path, the static
 * assets for anything else.
 *
 * @param request - The incoming request.
 * @param environment - The Worker's bindings.
 * @returns The response.
 */
export async function handleSiteRequest(request: Request, environment: SiteWorkerEnvironment): Promise<Response> {
	const url = new URL(request.url);
	const isWwwHost = url.hostname === WWW_HOST;
	const canonicalPath = PAGE_ALIASES.get(url.pathname);

	if (!isWwwHost && canonicalPath === undefined) {
		return environment.ASSETS.fetch(request);
	}

	if (isWwwHost) {
		url.hostname = CANONICAL_HOST;
		url.protocol = 'https:';
		url.port = '';
	}
	// Both fixes in one hop, so `www.…/how-it-works.html` is a single redirect rather than a chain.
	url.pathname = canonicalPath ?? url.pathname;
	// A browser never sends the fragment, and re-applies its own to a `Location` that has none.
	url.hash = '';

	return Response.redirect(url.toString(), 301);
}
