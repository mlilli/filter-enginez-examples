/**
 * Tests for handing a revisited route a live facade over its cached engine.
 *
 * @packageDocumentation
 */

import { createFilterEngine, inSet } from '@filter-enginez/core';
import { createSignalsEngine, type SignalsEngine } from '@filter-enginez/reactive-signals';
import { describe, expect, it, vi } from 'vitest';

const workerFacade = { isDisposed: false };

vi.mock('@filter-enginez/reactive-signals/worker', () => ({
	createSignalsEngineFromAsync: vi.fn(async () => Promise.resolve(workerFacade)),
}));

const { reviveSignalsEngine, reviveSignalsEngineOverWorker } = await import('./reviveSignalsEngine.js');

/** A two-row engine, wrapped. */
function liveFacade(): SignalsEngine<{ readonly kind: string }> {
	return createSignalsEngine(createFilterEngine({ sourceData: [{ kind: 'a' }, { kind: 'b' }]}));
}

describe('reviveSignalsEngine', () => {
	it('returns a live facade as it is', () => {
		const engine = liveFacade();

		expect(reviveSignalsEngine(engine)).toBe(engine);
	});

	it('replaces a disposed facade with one whose signals follow the same engine', () => {
		// The failure this guards: a revisited route rendering over signals that never move again.
		const engine = liveFacade();

		engine.dispose();
		engine.core.addRule('kind', inSet('kind', ['a']));
		expect(engine.resultCount.value).toBe(2);

		const revived = reviveSignalsEngine(engine);

		expect(revived).not.toBe(engine);
		expect(revived.core).toBe(engine.core);
		expect(revived.resultCount.value).toBe(1);

		revived.core.removeRule('kind');
		expect(revived.resultCount.value).toBe(2);
	});
});

describe('reviveSignalsEngineOverWorker', () => {
	it('returns a live facade as it is', async () => {
		const engine = liveFacade();

		expect(await reviveSignalsEngineOverWorker(engine)).toBe(engine);
	});

	it('rewraps a disposed worker facade over the same worker engine', async () => {
		const asyncEngine = {};
		const engine = { asyncEngine, isDisposed: true } as unknown as SignalsEngine<unknown>;
		const { createSignalsEngineFromAsync } = await import('@filter-enginez/reactive-signals/worker');

		expect(await reviveSignalsEngineOverWorker(engine)).toBe(workerFacade);
		expect(createSignalsEngineFromAsync).toHaveBeenCalledWith(asyncEngine);
	});

	it('rewraps a disposed main-thread facade over its core', async () => {
		const engine = liveFacade();

		engine.dispose();

		const revived = await reviveSignalsEngineOverWorker(engine);

		expect(revived).not.toBe(engine);
		expect(revived.core).toBe(engine.core);
	});
});
