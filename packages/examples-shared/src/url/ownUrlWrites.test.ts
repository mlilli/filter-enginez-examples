/**
 * Tests for `createOwnUrlWrites`: the guard pair that keeps a URL sync from loading its own writes.
 *
 * @remarks
 * The serializer and the engine are tested as the pair the sync uses: a decode is always followed by
 * the load it decided, so each case decodes and then loads. The engine is a real `FilterEngine`, whose
 * class methods read private state, so the pass-through is checked to keep `this` intact.
 */

import { createFilterEngine, type FilterEngineConfig, inSet } from '@filter-enginez/core';
import { type EngineStateSerializer } from '@filter-enginez/url-state-router/serializers';
import { describe, expect, it, type MockInstance, vi } from 'vitest';

import { createLinkSerializer } from './linkSerializer.js';
import { createOwnUrlWrites, OWN_URL_WRITES_REMEMBERED } from './ownUrlWrites.js';

/** A record the engine filters. */
interface Row {
	/** The faceted field. */
	readonly color: string;
}

/** Three rows, one per color. */
const ROWS: readonly Row[] = [{ color: 'red' }, { color: 'white' }, { color: 'rosé' }];

/** The synchronous engine core. */
type Core = ReturnType<typeof createFilterEngine<Row>>;

/**
 * An engine over {@link ROWS}, its `loadConfig` spied on, and the guarded pair around it.
 *
 * @param limit - How many writes the guard remembers.
 * @returns The engine, the spy, and the guarded engine and serializer.
 */
function setUp(limit?: number): {
	readonly core: Core;
	readonly engine: Core;
	readonly loadConfig: MockInstance<Core['loadConfig']>;
	readonly serializer: EngineStateSerializer;
} {
	const core = createFilterEngine<Row>({ sourceData: ROWS });
	const loadConfig = vi.spyOn(core, 'loadConfig');
	const guard = createOwnUrlWrites(limit);

	return { core, engine: guard.guardEngine(core), loadConfig, serializer: guard.guardSerializer(createLinkSerializer('human-readable')) };
}

/**
 * The config of an engine filtering to the given colors.
 *
 * @param colors - The colors to keep.
 * @returns The exported config.
 */
function configFor(colors: readonly string[]): FilterEngineConfig {
	const donor = createFilterEngine<Row>({ sourceData: ROWS });

	donor.addRule('color', inSet<string>('color', colors));

	return donor.exportConfig();
}

describe('createOwnUrlWrites', () => {
	it('loads a link the sync did not write', () => {
		const { engine, loadConfig, serializer } = setUp();
		const foreign = createLinkSerializer('human-readable').encode(configFor(['red']));

		engine.loadConfig(serializer.decode(foreign));

		expect(loadConfig).toHaveBeenCalledTimes(1);
		expect(engine.getResultCount()).toBe(1);
	});

	it('skips a link the sync wrote itself, however long ago within the limit', () => {
		const { core, engine, loadConfig, serializer } = setUp();
		const older = serializer.encode(configFor(['red']));

		serializer.encode(configFor(['red', 'white']));
		core.addRule('color', inSet<string>('color', ['red', 'white']));
		engine.loadConfig(serializer.decode(older));

		// The newer state stands: the older write is a state the page already moved through.
		expect(loadConfig).not.toHaveBeenCalled();
		expect(core.getResultCount()).toBe(2);
	});

	it('consumes the note with the load it decided, so the next foreign link loads', () => {
		const { engine, loadConfig, serializer } = setUp();
		const own = serializer.encode(configFor(['red']));
		const foreign = createLinkSerializer('human-readable').encode(configFor(['white']));

		engine.loadConfig(serializer.decode(own));
		engine.loadConfig(serializer.decode(foreign));

		expect(loadConfig).toHaveBeenCalledTimes(1);
		expect(engine.getResultCount()).toBe(1);
		expect(engine.getRule('color')).toBeDefined();
	});

	it('forgets its oldest writes past the limit', () => {
		const { engine, loadConfig, serializer } = setUp(2);
		const oldest = serializer.encode(configFor(['red']));

		serializer.encode(configFor(['white']));
		serializer.encode(configFor(['rosé']));
		engine.loadConfig(serializer.decode(oldest));

		expect(loadConfig).toHaveBeenCalledTimes(1);
	});

	it('remembers OWN_URL_WRITES_REMEMBERED writes by default', () => {
		const { engine, loadConfig, serializer } = setUp();
		const first = serializer.encode(configFor(['red']));

		for (let index = 1; index < OWN_URL_WRITES_REMEMBERED; index++) {
			serializer.encode(configFor([`color-${String(index)}`]));
		}
		engine.loadConfig(serializer.decode(first));

		expect(loadConfig).not.toHaveBeenCalled();
	});

	it('keeps the serializer\'s name and encoding', () => {
		const { serializer } = setUp();
		const plain = createLinkSerializer('human-readable');
		const config = configFor(['red']);

		expect(serializer.name).toBe(plain.name);
		expect(serializer.encode(config)).toBe(plain.encode(config));
		expect(serializer.decode(plain.encode(config))).toEqual(plain.decode(plain.encode(config)));
	});

	it('passes every other member through, methods bound to the real engine', () => {
		const { core, engine } = setUp();
		const listener = vi.fn();
		const off = engine.subscribe(listener);

		engine.addRule('color', inSet<string>('color', ['red']));

		expect(listener).toHaveBeenCalled();
		expect(core.getResultCount()).toBe(1);
		expect(engine.getResultCount()).toBe(1);
		expect(engine.isDestroyed).toBe(false);
		expect(engine.exportConfig()).toEqual(core.exportConfig());
		off();
	});
});
