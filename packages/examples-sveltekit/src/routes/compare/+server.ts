/**
 * `GET /compare` — a permanent redirect to the comparison page, on the landing site, keeping the
 * query.
 *
 * @remarks
 * The page that opens one filter state in all six stacks lives once, on the landing site at
 * `filterenginez.com/compare`, and every app answers its own `/compare` address with a permanent
 * redirect there, so a link shared from any app keeps working. The five static-asset apps do it with
 * a Workers static-assets `_redirects` file; this app is served by its own Worker (adapter-cloudflare)
 * or Node server (adapter-node), which `_redirects` never sees, so SvelteKit answers it here — the
 * same under either adapter, and in `pnpm dev`.
 *
 * **The query string is carried over verbatim.** It is the whole point of a `/compare` link: the
 * dataset to open (`dataset`) and the filter state to show (`f`, a serialized engine config). The
 * search is appended exactly as it arrived (`url.search`, percent-encoding and all) rather than
 * re-encoded from parsed parameters, so the state that reaches the landing site is byte for byte the
 * state the link carried. A bare `/compare` has an empty `search` and lands on the page itself.
 *
 * The target is resolved from the request URL like every cross-app link (`siteUrl`): the deployed
 * page from a deployed host, the local site server from a loopback one. `HEAD` falls back to this
 * handler, as SvelteKit does for any `GET`. `routes/about/+server.ts` answers `/about` the same way.
 *
 * @packageDocumentation
 */

import { siteUrl } from '@filter-enginez/examples-shared/compare-core';
import { COMPARE_PATH } from '@filter-enginez/examples-shared/verticals';
import { redirect, type RequestHandler } from '@sveltejs/kit';

/** Answer `/compare` with a 301 to the landing site's comparison page, with the request's query. */
export const GET: RequestHandler = ({ url }) => redirect(301, `${siteUrl(COMPARE_PATH, url)}${url.search}`);
