/**
 * `/wine` on the plain-React app — the worker tier over `reactive-signals`, no Redux mirror.
 *
 * @remarks
 * **Every case lives in `./wineFlow.ts`**, run identically by all six verticals. What is specific
 * here is only the origin (Playwright's `baseURL` is the RTK app) and the drawer — react-ui renders
 * the mobile filter panel as an off-canvas `<dialog>`, which the shared suite needs both as its
 * open-readiness signal and as the thing to dismiss before touching the results column. See
 * `WineVerticalSpec.filterDrawer`.
 *
 * ## Why this vertical is worth a suite rather than a smoke test
 *
 * It is the RTK app minus Redux. Both render the same `<WineApp>` shape over the same
 * `examples-shared/wine` slice, so a case that passes on RTK and fails here isolates the
 * `redux-bridge` mirror as the difference — and the mirror is what backs RTK's result-count readout
 * (`playwright.config.ts` says the suite chose RTK for exactly that reason). Running both turns that
 * stated rationale into something checkable instead of assumed.
 *
 * @packageDocumentation
 */

import type { Locator, Page } from '@playwright/test';

import { reactPlainUrl } from './reactPlainBase.js';
import { describeWineVertical } from './wineFlow.js';

/**
 * react-ui renders the mobile filter panel as an off-canvas `dialog` named for the dataset.
 *
 * The `role` is applied only while the drawer is open, which is why it — and not a chip inside it —
 * is the readiness signal: `<FilterDrawer>` is `keepMounted`, so the facet chips are in the DOM the
 * whole time and would resolve before anything opened.
 */
function filterDrawer(page: Page): Locator {
	return page.getByRole('dialog', { name: 'Wine filters' });
}

describeWineVertical({
	filterDrawer,
	id: 'react-plain',
	label: 'React plain',
	url: reactPlainUrl,
});
