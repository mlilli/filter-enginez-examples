/**
 * `engineBusy` — the real-estate route's engine-busy module, React binding included.
 *
 * @remarks
 * The tracker instance itself lives in the React-free `./engineBusyCore.js` so the non-React verticals
 * can drive busy state without importing a React hooks package; this module binds `useIsEngineBusy` to
 * **that same instance** via `withReactBusyHook` and re-exports the whole surface under the names the
 * React sections and results header import.
 *
 * Wine is split the same way. Books calls `createEngineBusyModule()` directly, because no non-React
 * consumer needs its busy state, so the split would be ceremony there.
 *
 * @packageDocumentation
 */

import { withReactBusyHook } from '../scheduling/createEngineBusyModule.js';
import { realEstateBusyCore } from './engineBusyCore.js';

/** The real-estate route's engine-busy module — the shared core plus the React hook. */
export const {
	captureCurrentVersion,
	getIsEngineBusy,
	markResolvedAtLeast,
	markUserAction,
	subscribeEngineBusy,
	useIsEngineBusy,
} = withReactBusyHook(realEstateBusyCore);
