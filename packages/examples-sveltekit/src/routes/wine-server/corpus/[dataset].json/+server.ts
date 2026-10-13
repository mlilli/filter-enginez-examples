/**
 * `GET /wine-server/corpus/wine.json` — the wine corpus, prerendered into a static file at build time.
 *
 * @remarks
 * The browser transport (`createHttpFilterEngine<Wine>`, `baseUrl: '/wine-server'`) fetches this once
 * at boot to hold a resident corpus copy: it turns the server's result INDICES back into records and
 * derives the wine panel's slider baselines, chip vocabularies and origin tree (exactly like the
 * worker tier ships its corpus to the main thread once). This is the data, not the decisions — the
 * server remains the filtering authority. The body is examples-server's corpus document
 * (`{ dataset, label, records }`), the same bytes as its `GET /corpus/<dataset>.json`, so the shared
 * transport is reusable verbatim.
 *
 * **Prerendered, so no request runs this.** The deployed app is a Cloudflare Worker on the Workers Free
 * plan, which allows 10 ms of CPU per request; serializing the corpus takes several times that. With
 * `prerender = true`, `vite build` writes the response to `wine-server/corpus/wine.json` in the build
 * output, `adapter-cloudflare` places it among the static assets (answered before the Worker runs) and
 * `adapter-node` serves it as a file. `pnpm dev` still answers it dynamically. {@link entries} names the
 * one dataset `/wine-server` fetches; any other id is not prerendered, so it is not served.
 *
 * The `[dataset]` param (rather than a literal `wine.json`) keeps this route the same shape as the
 * books one and as the transport's `/corpus/${dataset}.json`.
 *
 * @packageDocumentation
 */

import { corpusDocumentResponse } from '$lib/server/datasetFilterService.js';

import type { EntryGenerator, RequestHandler } from './$types.js';

/** Build the response into a static file; never answer it at request time in production. */
export const prerender = true;

/** The datasets `/wine-server` fetches: wine only. */
export const entries: EntryGenerator = () => [{ dataset: 'wine' }];

/** Return the dataset's corpus document, or 404 for an unregistered one. */
export const GET: RequestHandler = ({ params }) => corpusDocumentResponse(params.dataset);
