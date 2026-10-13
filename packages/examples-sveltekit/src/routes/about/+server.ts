/**
 * `GET /about` — a permanent redirect to the one "How the engine works" page, on the landing site.
 *
 * @remarks
 * A link to any demo app's `/about` keeps working: every app answers that address with a permanent
 * redirect to `filterenginez.com/how-it-works`. The five static-asset apps do it with a Workers
 * static-assets `_redirects` file; this app is served by its own Worker (adapter-cloudflare)
 * or Node server (adapter-node), which `_redirects` never sees, so SvelteKit answers it here — the
 * same under either adapter, and in `pnpm dev`.
 *
 * The target is resolved from the request URL like every cross-app link (`howItWorksUrl`): the
 * deployed page from a deployed host, the local site server from a loopback one. `HEAD` falls back to
 * this handler, as SvelteKit does for any `GET`.
 *
 * @packageDocumentation
 */

import { howItWorksUrl } from '@filter-enginez/examples-shared/compare-core';
import { redirect, type RequestHandler } from '@sveltejs/kit';

/** Answer `/about` with a 301 to the how-it-works page. */
export const GET: RequestHandler = ({ url }) => redirect(301, howItWorksUrl(url));
