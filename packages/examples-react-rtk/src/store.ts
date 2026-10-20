/**
 * `store.ts` — the Redux store for the wine RTK route, wired to the engine via
 * `@filter-enginez/redux-bridge`.
 *
 * @remarks
 * **What this proves.** `examples-react-plain` runs the same engine on signals alone;
 * `examples-react-rtk` demonstrates the redux-bridge path — the engine stays the single source of
 * truth, and a read-only Redux slice MIRRORS its state so consumers can read filter metadata via
 * ordinary `useSelector` calls + DevTools time-travel of intents.
 *
 * The store wiring (mirror slice with `includeResults: false`, the prepended forwarding middleware,
 * `attachEngineToStore`) is dataset-agnostic and lives in {@link createMirrorStore}; this module
 * is just the wine binding — `createWineStore` + the typed `useSelector` / `useDispatch`.
 *
 * @packageDocumentation
 */

import type { FilterEngine } from '@filter-enginez/core';
import type { Wine } from '@filter-enginez/mock-data/wine';
import type { ForwardAction } from '@filter-enginez/redux-bridge';
import type { UnknownAction } from '@reduxjs/toolkit';

import { type TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

import { createMirrorStore, type MirrorRootState } from './mirrorStore.js';

/** A wired wine store plus the bridge's detach handle. */
export interface WineStoreBundle {
	/** Detaches the engine→mirror subscription. Call on route teardown. */
	readonly detach: () => void;
	/** The configured Redux store. */
	readonly store: ReturnType<typeof createMirrorStore<Wine>>['store'];
}

/**
 * Create + wire the wine store for a resolved engine core.
 *
 * @param engineCore - The engine to mirror + forward to (typically `bundle.engine.core`).
 * @returns The store + the bridge `detach` handle.
 */
export function createWineStore(engineCore: FilterEngine<Wine>): WineStoreBundle {
	return createMirrorStore<Wine>(engineCore);
}

/** The combined Redux state — a single `filters` mirror slice (the whole tree for this route). */
export type WineRootState = MirrorRootState<Wine>;

/** Typed `useSelector`: `useWineSelector((s) => s.filters.resultCount)`. */
export const useWineSelector: TypedUseSelectorHook<WineRootState> = useSelector;

/**
 * Dispatch for the wine store — accepts ordinary actions AND redux-bridge forward intents.
 * `ForwardAction` (a closed interface) isn't structurally assignable to react-redux's default
 * `Dispatch<UnknownAction>`, so the parameter is widened + the single `as` bridges the hook type.
 */
export type WineDispatch = (action: ForwardAction | UnknownAction) => void;

/** `useDispatch` typed to accept forward intents: `useWineDispatch()(forwardToEngine('removeRule', { ruleId }))`. */
export const useWineDispatch: () => WineDispatch = useDispatch as unknown as () => WineDispatch;
