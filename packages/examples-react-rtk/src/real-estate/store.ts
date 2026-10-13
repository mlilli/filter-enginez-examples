/**
 * `real-estate/store.ts` — the Redux mirror store binding for the real-estate route.
 *
 * @remarks
 * The store wiring is shared (`createMirrorStore`); this is just the real-estate typing —
 * `createRealEstateStore` + the typed `useSelector` / `useDispatch`. Mirror of the books/wine
 * `store.ts`.
 *
 * @packageDocumentation
 */

import type { FilterEngine } from '@filter-enginez/core';
import type { Listing } from '@filter-enginez/mock-data/real-estate';
import type { ForwardAction } from '@filter-enginez/redux-bridge';
import type { UnknownAction } from '@reduxjs/toolkit';

import { type TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

import { createMirrorStore, type MirrorRootState } from '../mirrorStore.js';

/** A wired real-estate store plus the bridge's detach handle. */
export interface RealEstateStoreBundle {
	readonly detach: () => void;
	readonly store: ReturnType<typeof createMirrorStore<Listing>>['store'];
}

/** Create + wire the real-estate store for a resolved engine core. */
export function createRealEstateStore(engineCore: FilterEngine<Listing>): RealEstateStoreBundle {
	return createMirrorStore<Listing>(engineCore);
}

/** The combined Redux state for the real-estate route. */
export type RealEstateRootState = MirrorRootState<Listing>;

/** Typed `useSelector`: `useRealEstateSelector((s) => s.filters.resultCount)`. */
export const useRealEstateSelector: TypedUseSelectorHook<RealEstateRootState> = useSelector;

/** Dispatch typed to accept redux-bridge forward intents (see wine `store.ts` for the rationale). */
export type RealEstateDispatch = (action: ForwardAction | UnknownAction) => void;

/** `useDispatch` typed to accept forward intents. */
export const useRealEstateDispatch: () => RealEstateDispatch =
	useDispatch as unknown as () => RealEstateDispatch;
