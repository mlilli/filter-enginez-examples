/**
 * The `filterenginez.com` Worker entry point (`main` in `wrangler.jsonc`).
 *
 * @remarks
 * Deliberately nothing but the default export: the Workers runtime treats every named export of the
 * main module as an entry point and refuses to start on one that is not a handler. The logic is in
 * `siteRequestHandler.ts`, and `worker.test.ts` pins this module's export list.
 *
 * @packageDocumentation
 */

import { handleSiteRequest } from './siteRequestHandler.js';

export default {
	fetch: handleSiteRequest,
};
