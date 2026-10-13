/**
 * End-to-end tests for the SvelteKit wine app — the worker-backed filter flow.
 *
 * @remarks
 * **The cases live in `./wineFlow.ts`**, shared by all six verticals.
 *
 * What is specific to this vertical:
 *
 *   - **Absolute URLs.** Playwright's `baseURL` is the React app, so the suite navigates via
 *     `svelteUrl(...)`.
 *   - **The registry id is `sveltekit`, not `svelte`** — the package, this file and the URL helper
 *     all say `svelte`, and the header subtitle says `SvelteKit`. Passing the wrong one would not
 *     fail loudly: the boot wait would simply never match and every case would time out claiming
 *     the app never booted. `WineVerticalSpec['id']` is typed as `VerticalId` so it cannot compile.
 *
 * The chip-flicker case matters here as much as anywhere: this panel uses the same writable-derived
 * pattern the case is about.
 *
 * @packageDocumentation
 */

import { svelteUrl } from './svelteBase.js';
import { describeWineVertical } from './wineFlow.js';

describeWineVertical({ id: 'sveltekit', label: 'SvelteKit', url: svelteUrl });
