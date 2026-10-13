/**
 * `cloudflareWorker.ts` — the Worker entry point (`main`) in the `wrangler.jsonc` of every app with a
 * server-backed route: React RTK, React plain and Angular (`/books-server`), and vanilla
 * (`/wine-server`). Deployed, it answers their same-origin `/api/*` requests with the engine.
 *
 * @remarks
 * Deliberately nothing but the default export. The Workers runtime treats every named export of the
 * main module as an entry point and refuses to start on one that is not a handler, so the request
 * logic, its constants and its types live in `workerRequestHandler.ts`, and `cloudflareWorker.test.ts`
 * pins this module's export list.
 *
 * @packageDocumentation
 */

import { handleWorkerRequest } from './workerRequestHandler.js';

export default {
	fetch: handleWorkerRequest,
};
