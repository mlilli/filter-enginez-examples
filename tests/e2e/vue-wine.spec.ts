/**
 * End-to-end tests for the Vue wine app — the worker-backed filter flow.
 *
 * @remarks
 * **The cases live in `./wineFlow.ts`**, shared by all six verticals: one suite of cases, one boot
 * signal and one settle tempo, so this file is three lines of configuration.
 *
 * What is specific to this vertical:
 *
 *   - **Absolute URLs.** Playwright's `baseURL` is the React app, so the suite navigates via
 *     `vueUrl(...)`.
 *   - Nothing else. Vue's wine route runs the identical flow, which is the claim the shared suite
 *     exists to make checkable rather than assumed.
 *
 * @packageDocumentation
 */

import { vueUrl } from './vueBase.js';
import { describeWineVertical } from './wineFlow.js';

describeWineVertical({ id: 'vue', label: 'Vue', url: vueUrl });
