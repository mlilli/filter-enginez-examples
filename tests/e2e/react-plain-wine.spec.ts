/**
 * `/wine` on the plain-React app — the worker tier over `reactive-signals`, no Redux mirror.
 *
 * @remarks
 * **Every case lives in `./wineFlow.ts`**, run identically by all six verticals. What is specific
 * here is only the origin: Playwright's `baseURL` is the RTK app, so this suite navigates with
 * absolute URLs from `./reactPlainBase.ts`.
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

import { reactPlainUrl } from './reactPlainBase.js';
import { describeWineVertical } from './wineFlow.js';

describeWineVertical({
	id: 'react-plain',
	label: 'React plain',
	url: reactPlainUrl,
});
