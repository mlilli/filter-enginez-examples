/**
 * `engineBusy` — the wine route's engine-busy module, React binding included.
 *
 * @remarks
 * The tracker instance itself lives in the React-free `./engineBusyCore.js` so the non-React verticals
 * can drive busy state without importing a React hooks package; this module binds `useIsEngineBusy` to
 * **that same instance** via `withReactBusyHook` and re-exports the whole surface under the names the
 * React sections and results header import.
 *
 * Real estate is split the same way. Books calls `createEngineBusyModule()` directly, because no
 * non-React consumer needs its busy state.
 *
 * **The one thing that must not happen here** is a second `createEngineBusyCore()` call. The commit
 * helpers in `./wine-domain/commit.js` bump the version on `wineBusyCore`; a binding attached to a
 * different tracker reads a version nothing advances, and the indicator silently never lights.
 *
 * @packageDocumentation
 */

import { withReactBusyHook } from '../scheduling/createEngineBusyModule.js';
import { wineBusyCore } from './engineBusyCore.js';

/** The wine route's engine-busy module — the shared core plus the React hook. */
export const {
	captureCurrentVersion,
	getIsEngineBusy,
	markResolvedAtLeast,
	markUserAction,
	subscribeEngineBusy,
	useIsEngineBusy,
} = withReactBusyHook(wineBusyCore);
