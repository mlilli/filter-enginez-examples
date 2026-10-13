/**
 * `engineBusy` — the books route's engine-busy module (one tracker instance for the whole route).
 *
 * @remarks
 * A thin binding over the shared `createEngineBusyModule` factory
 * (`@filter-enginez/examples-shared/scheduling`) with its OWN tracker instance, so the books route's
 * busy state is independent of wine's (only one dataset route is mounted at a time, but keeping the
 * trackers separate avoids any cross-dataset bleed). Destructured into named exports so call sites
 * import the functions directly.
 *
 * @packageDocumentation
 */

import { createEngineBusyModule } from '../scheduling/createEngineBusyModule.js';

/** The books route's engine-busy module — one tracker instance for the whole route. */
export const {
	captureCurrentVersion,
	getIsEngineBusy,
	markResolvedAtLeast,
	markUserAction,
	subscribeEngineBusy,
	useIsEngineBusy,
} = createEngineBusyModule();
