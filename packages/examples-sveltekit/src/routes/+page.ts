/**
 * The hub is prerendered: written to a static HTML file at build time and served from the assets,
 * with no server render per visit.
 *
 * @remarks
 * The hub has no data and no per-request state: a header, a hero and the dataset cards. Rendered on
 * every visit, it would cost each first visitor a Worker invocation and a server render before the
 * first byte. Prerendered, both adapters write it beside the client assets (`adapter-cloudflare`
 * under `build/cloudflare/`, where Workers static assets answer `/` before the Worker runs), and it
 * carries its script, stylesheet and font preloads as `<link>` tags in its head.
 *
 * What the page renders from the request is the header's links to the landing site, which
 * `appHeaderLinks($page.url)` resolves from the hostname. At prerender time that hostname is
 * SvelteKit's prerender origin, which is not a development host, so the links point at the
 * production site — the address the prerendered file is served from. The development server renders
 * the hub per request as before, so `pnpm dev` keeps its local links.
 *
 * @packageDocumentation
 */

/** Render this page at build time. */
export const prerender = true;
