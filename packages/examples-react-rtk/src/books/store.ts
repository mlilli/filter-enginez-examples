/**
 * `books/store.ts` — the Redux mirror store binding for the books route.
 *
 * @remarks
 * The store wiring is shared (`createMirrorStore`); this is just the books typing — `createBooksStore`
 * + the typed `useSelector` / `useDispatch`. Mirror of the wine `store.ts`.
 *
 * @packageDocumentation
 */

import type { FilterEngine } from '@filter-enginez/core';
import type { Book } from '@filter-enginez/mock-data/books';
import type { ForwardAction } from '@filter-enginez/redux-bridge';
import type { UnknownAction } from '@reduxjs/toolkit';

import { type TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';

import { createMirrorStore, type MirrorRootState } from '../mirrorStore.js';

/** A wired books store plus the bridge's detach handle. */
export interface BooksStoreBundle {
	readonly detach: () => void;
	readonly store: ReturnType<typeof createMirrorStore<Book>>['store'];
}

/** Create + wire the books store for a resolved engine core. */
export function createBooksStore(engineCore: FilterEngine<Book>): BooksStoreBundle {
	return createMirrorStore<Book>(engineCore);
}

/** The combined Redux state for the books route. */
export type BooksRootState = MirrorRootState<Book>;

/** Typed `useSelector`: `useBooksSelector((s) => s.filters.resultCount)`. */
export const useBooksSelector: TypedUseSelectorHook<BooksRootState> = useSelector;

/** Dispatch typed to accept redux-bridge forward intents (see wine `store.ts` for the rationale). */
export type BooksDispatch = (action: ForwardAction | UnknownAction) => void;

/** `useDispatch` typed to accept forward intents. */
export const useBooksDispatch: () => BooksDispatch = useDispatch as unknown as () => BooksDispatch;
