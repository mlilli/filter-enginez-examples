/**
 * `workerRequestHandler.ts` — the same pure `handleRequest` brain, adapted to a Cloudflare Worker's
 * `fetch(request, env)`.
 *
 * @remarks
 * In development, each browser app with a server-backed route reaches this package through its dev
 * server's same-origin `/api` proxy (`vite.config.ts`, or Angular's `proxy.config.json`), which strips
 * the prefix and forwards to `server.ts` on port 8787. Deployed, there is no Node process to forward
 * to: each of those apps is a Worker with static assets, and its `wrangler.jsonc` names
 * `cloudflareWorker.ts` as the Worker script with `run_worker_first: ["/api/*"]`. So the browser makes
 * exactly the requests it makes in development — same origin, same `/api` prefix, same bodies — and
 * the isomorphic core answers them from the Worker, the third runtime it runs on unchanged (after the
 * browser and Node).
 *
 * Like `server.ts`, this is a thin adapter: it strips `/api`, reads the body, calls
 * {@link handleRequest}, and writes the JSON. Anything outside `/api` is handed to the static-assets
 * binding, so a request that reaches the Worker by some other path is answered exactly as the
 * assets-only configuration would answer it.
 *
 * **Why the entry point is a separate file.** The Workers runtime reads every named export of the
 * Worker's main module as an entry point, and refuses to start when one is not a handler — a module
 * exporting {@link API_PATH_PREFIX} fails with "Incorrect type for map entry". So the logic and its
 * tests live here, and `cloudflareWorker.ts` exports nothing but the default handler.
 *
 * **No bitmap acceleration.** `server.ts` awaits `initializeBitmapAcceleration()` before it listens;
 * this does not call it, because Workers refuse to compile WebAssembly from bytes at runtime, which is
 * what `roaring-wasm` does. The engine's predicate path returns identical results.
 *
 * Structural types rather than `@cloudflare/workers-types`: the adapter touches one binding method and
 * the standard `Request` / `Response`, so a dependency on the full runtime typings would buy nothing
 * this file uses.
 *
 * @packageDocumentation
 */

import { handleRequest } from './requestHandler.js';

/** The path prefix the browser apps put in front of every API route, in development and deployed. */
export const API_PATH_PREFIX = '/api';

/** The one method of the Workers static-assets binding this Worker calls. */
export interface StaticAssetsBinding {
	/**
	 * Answer a request from the deployed static assets (including the single-page-application
	 * fallback configured in `wrangler.jsonc`).
	 */
	fetch(request: Request): Promise<Response>;
}

/** The Worker's bindings, as declared by `assets.binding` in each app's `wrangler.jsonc`. */
export interface ApiWorkerEnvironment {
	/** The app's static assets. */
	readonly ASSETS: StaticAssetsBinding;
}

/**
 * Whether a request path belongs to the API rather than to the app's static assets.
 *
 * @param pathname - The request URL's path.
 * @returns `true` for `/api` and anything under `/api/`; `false` for `/apiary` and everything else.
 */
export function isApiPath(pathname: string): boolean {
	return pathname === API_PATH_PREFIX || pathname.startsWith(`${API_PATH_PREFIX}/`);
}

/**
 * Answer one request: an `/api` route through the shared handler, anything else from the assets.
 *
 * @param request - The incoming request.
 * @param environment - The Worker's bindings.
 * @returns The response.
 */
export async function handleWorkerRequest(request: Request, environment: ApiWorkerEnvironment): Promise<Response> {
	const { pathname } = new URL(request.url);

	if (!isApiPath(pathname)) {
		return environment.ASSETS.fetch(request);
	}

	// The same rewrite the dev proxies apply (`path.replace(/^\/api/, '')`), so a route answers here
	// exactly when it answers on port 8787.
	const path = pathname.slice(API_PATH_PREFIX.length) || '/';
	const body = request.method === 'POST' ? await request.text() : undefined;
	const { body: payload, status } = await handleRequest(request.method, path, body);

	return Response.json(payload, { status });
}
