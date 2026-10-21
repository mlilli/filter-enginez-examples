/**
 * Real-estate engine boot — the **signals-surface** wrapper.
 *
 * @remarks
 * Mirrors `booksEngine`: the ~10k default tier builds directly on the main thread (no worker /
 * static corpus serving), and the public API (`bootRealEstateEngine` + the progress
 * `subscribe`/`getSnapshot` pair + the `RealEstateEngineBundle`) matches the other datasets so the
 * registry treats them uniformly.
 *
 * The surface-neutral half — acceleration init, corpus streaming, engine construction, and progress
 * reporting — lives in `./bootRealEstateCore.ts`. This module only adds the `reactive-signals`
 * wrapper, so the Angular vertical can boot via `bootRealEstateCore()` without dragging
 * `@preact/signals-core` into its graph. Both share ONE cached core.
 *
 * @packageDocumentation
 */

import type { Listing } from '@filter-enginez/mock-data/real-estate';

import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';

import { reviveSignalsEngine } from '../data/reviveSignalsEngine.js';
import { bootRealEstateCore, type RealEstateBootMeta } from './bootRealEstateCore.js';

/** Boot result — the signals-wrapped engine plus boot metadata. */
export interface RealEstateEngineBundle {
	/** The engine, wrapped in the `@preact/signals-core` reactive surface. */
	readonly engine: SignalsEngine<Listing>;
	/** Boot metadata (record count, boot duration, tier) for the results header. */
	readonly meta: RealEstateBootMeta;
}

/** Cached so repeated calls return the same signals wrapper over the same core. */
let cachedBoot: Promise<RealEstateEngineBundle> | null = null;

/**
 * Boot the real-estate engine on the main thread, wrapped in the signals surface. Idempotent —
 * repeated calls return the cached bundle, with a fresh facade over the same core when a route that
 * left disposed the cached one (see `reviveSignalsEngine`).
 *
 * @returns The booted {@link RealEstateEngineBundle}.
 */
export async function bootRealEstateEngine(): Promise<RealEstateEngineBundle> {
	cachedBoot ??= bootInternal();

	const bundle = await cachedBoot;
	const engine = reviveSignalsEngine(bundle.engine);

	if (engine === bundle.engine) {
		return bundle;
	}
	// A route that left disposed the cached facade; hand the next visit a live one over the same core.
	const revived = { ...bundle, engine };

	cachedBoot = Promise.resolve(revived);

	return revived;
}

/**
 * Wrap the shared bare core in the signals surface.
 *
 * @internal
 */
async function bootInternal(): Promise<RealEstateEngineBundle> {
	const { core, meta } = await bootRealEstateCore();

	return { engine: createSignalsEngine<Listing>(core), meta };
}
