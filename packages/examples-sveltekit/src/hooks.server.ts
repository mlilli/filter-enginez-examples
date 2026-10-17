/**
 * Server hooks: every page announces its first screen's brand fonts, beside its scripts and
 * stylesheets, from its head.
 *
 * @remarks
 * SvelteKit's default `preload` announces scripts and stylesheets only. `preloadFirstScreenAsset`
 * (`$lib/server/preload.ts`, which says which fonts and why) adds the two brand faces every first
 * screen sets. A prerendered page — the hub — carries them as `<link rel="preload" as="font">` tags;
 * a server-rendered page as `Link` response headers. The option is read for every rendered page, so
 * this is the whole of it.
 *
 * @packageDocumentation
 */

import type { Handle } from '@sveltejs/kit';

import { preloadFirstScreenAsset } from '$lib/server/preload.js';

/**
 * Render every page with the first-screen preloads.
 *
 * @param input - The request event and SvelteKit's renderer.
 * @param input.event - The request.
 * @param input.resolve - Renders the route for the request.
 * @returns The rendered response.
 */
export const handle: Handle = async ({ event, resolve }) => resolve(event, { preload: preloadFirstScreenAsset });
