/**
 * `reviveSignalsEngine` — hand a route a live signals facade over its dataset's cached engine.
 *
 * @remarks
 * Each dataset boots its engine once per page load and caches the bundle, so a route that is left and
 * revisited reuses the same corpus and indexes rather than booting again. The Svelte, Vue and vanilla
 * routes dispose the signals facade when they unmount, which unsubscribes it from the engine for good:
 * its signals stop moving. Handing that disposed facade back on the next visit would render the new
 * page over signals that never update, so the filters would change the engine while the count, the
 * pills and the controls stayed where the last visit left them. The React and Angular routes never
 * dispose the cached facade, so for them this is the identity.
 *
 * A disposed facade is replaced by a fresh one over the same engine, seeded from the engine's
 * current state, so every app shows the state the engine is in.
 *
 * @packageDocumentation
 */

import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { createSignalsEngineFromAsync } from '@filter-enginez/reactive-signals/worker';

/**
 * Return the facade when it is live, or a fresh facade over the same main-thread engine when it has
 * been disposed.
 *
 * @typeParam T - The record type.
 * @param engine - The cached facade.
 * @returns A facade whose signals follow the engine.
 */
export function reviveSignalsEngine<T>(engine: SignalsEngine<T>): SignalsEngine<T> {
	return engine.isDisposed ? createSignalsEngine<T>(engine.core) : engine;
}

/**
 * {@link reviveSignalsEngine} for a facade that may sit over a worker: a disposed worker facade is
 * replaced by a fresh one over the same worker engine, so the corpus is not generated again.
 *
 * @typeParam T - The record type.
 * @param engine - The cached facade.
 * @returns A facade whose signals follow the engine.
 */
export async function reviveSignalsEngineOverWorker<T>(engine: SignalsEngine<T>): Promise<SignalsEngine<T>> {
	const { asyncEngine } = engine;

	return engine.isDisposed && asyncEngine !== undefined ? createSignalsEngineFromAsync<T>(asyncEngine) : reviveSignalsEngine(engine);
}
