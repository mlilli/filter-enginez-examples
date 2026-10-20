/**
 * `staticAssetsWorker.ts` — the Worker entry point (`main`) in the `wrangler.jsonc` of the sites with
 * no server-backed route: the documentation site and the Vue app. Deployed, it answers their
 * `/.well-known/*` requests with a 404, and nothing else (`wellKnown.ts` says why).
 *
 * @remarks
 * Deliberately nothing but the default export, for the reason `cloudflareWorker.ts` gives: the Workers
 * runtime treats every named export of the main module as an entry point. `staticAssetsWorker.test.ts`
 * pins the export list. It imports only `wellKnown.ts`, so the Worker it bundles holds no engine.
 *
 * @packageDocumentation
 */

import { handleStaticAssetsRequest } from './wellKnown.js';

export default {
	fetch: handleStaticAssetsRequest,
};
