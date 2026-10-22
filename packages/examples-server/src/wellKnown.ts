/**
 * `wellKnown.ts` — every site's answer under `/.well-known/`: a 404, because none of them publishes
 * anything there.
 *
 * @remarks
 * `/.well-known/` (RFC 8615) is where clients look for a site's machine-readable metadata by name: an
 * agent or tool catalog (`ai-catalog.json`), a security contact, app links, and so on. These sites
 * publish none of it: they offer no agents, tools or services to discover, only pages. A client that
 * asks must hear "not here". A single-page app's assets answer a path they have no file for with the
 * app's not-found page and a 404 (`not_found_handling: "404-page"`): the right status, in an HTML
 * document that boots the whole app to say it.
 *
 * So every single-page app sends `/.well-known/*` to a Worker first (`run_worker_first` in its
 * `wrangler.jsonc`), and the Worker answers it here, with a plain-text 404. The apps with a
 * server-backed route already have a Worker, examples-server's API Worker (`workerRequestHandler.ts`);
 * the documentation site and the Vue app, which have none, run `staticAssetsWorker.ts`, which is this
 * module and nothing else. Every other request on those two hosts stays with the assets: the Worker
 * runs for `/.well-known/*` alone, so no page or asset request becomes a Worker invocation.
 *
 * The landing site and the SvelteKit app need neither: the landing site's assets answer unknown paths
 * with its static `404.html` and a 404, and SvelteKit's router answers a path no route matches with
 * its error page and a 404. `tests/tooling/wellKnownNotFound.test.ts` holds every host to one of the
 * three.
 *
 * Structural types rather than `@cloudflare/workers-types`, as in `workerRequestHandler.ts`, whose
 * environment type this module reuses (a type-only import, so the static Worker's bundle holds none of
 * that module's code).
 *
 * @packageDocumentation
 */

import type { ApiWorkerEnvironment } from './workerRequestHandler.js';

/** The path every well-known URI sits under. */
export const WELL_KNOWN_PATH = '/.well-known';

/**
 * Whether a request path is a well-known URI, or the directory they sit in.
 *
 * @param pathname - The request URL's path.
 * @returns `true` for `/.well-known` and anything under `/.well-known/`; `false` for everything else.
 */
export function isWellKnownPath(pathname: string): boolean {
	return pathname === WELL_KNOWN_PATH || pathname.startsWith(`${WELL_KNOWN_PATH}/`);
}

/**
 * The answer to every well-known URI: a plain-text 404.
 *
 * @remarks
 * A new response per call, because a `Response` body can be read only once.
 *
 * @returns The response.
 */
export function wellKnownNotFound(): Response {
	return new Response('Not found\n', { headers: { 'content-type': 'text/plain; charset=utf-8' }, status: 404 });
}

/**
 * Answer one request on a host with no Worker logic of its own: a 404 under `/.well-known/`, the
 * static assets for anything else.
 *
 * @remarks
 * `run_worker_first: ["/.well-known/*"]` keeps every other path away from the Worker, so the second
 * branch answers only a request that reached it some other way, exactly as the assets alone would.
 *
 * @param request - The incoming request.
 * @param environment - The Worker's bindings.
 * @returns The response.
 */
export async function handleStaticAssetsRequest(request: Request, environment: ApiWorkerEnvironment): Promise<Response> {
	return isWellKnownPath(new URL(request.url).pathname) ? wellKnownNotFound() : environment.ASSETS.fetch(request);
}
