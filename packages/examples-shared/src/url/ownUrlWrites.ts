/**
 * `ownUrlWrites` — keeps the React apps' `<FilterEngineUrlSync>` from loading its own stale `?f=` back
 * into the engine.
 *
 * @remarks
 * ### The race
 *
 * `<FilterEngineUrlSync>` writes the engine's state to `?f=` a debounce after each change, and loads
 * any `?f=` it did not write itself. It knows "itself" by ONE remembered value: the last string it
 * wrote. The two React apps navigate inside transitions (`<BrowserRouter>`'s default), so React can
 * commit the location of one write after the sync has already made the NEXT one. The sync then reads
 * the older of its own two strings, sees it differs from the last one it wrote, and loads it: the
 * change made in between is dropped from the engine, and the next write puts the older state in the
 * link as well. On the wine worker tier that is a facet clicked a moment after another one vanishing
 * along with its pill, a few hundred milliseconds after it appeared. The other four apps read `?f=`
 * once, at boot, so they never meet it.
 *
 * ### The guard
 *
 * {@link createOwnUrlWrites} wraps the sync's serializer and engine as a pair. The serializer
 * remembers every string it encoded, the most recent {@link OWN_URL_WRITES_REMEMBERED} of them, and
 * notes whether the string the sync just decoded is one of them. The engine's `loadConfig` then skips
 * a config decoded from one of the sync's own writes: such a string is the state this page already
 * moved through, never news from outside. Every other member of the engine passes straight through.
 *
 * The sync always decodes immediately before it loads, so the note is consumed by the very next
 * `loadConfig`. A decode that throws leaves the previous note in place, but no load follows it.
 *
 * @packageDocumentation
 */

import type { FilterEngine, FilterEngineConfig } from '@filter-enginez/core';
import type { EngineStateSerializer } from '@filter-enginez/url-state-router/serializers';

/**
 * How many of its own writes a guard remembers.
 *
 * @remarks
 * Only writes still waiting for React to commit their location can come back, and with a 150 ms
 * write debounce that is two or three. Thirty-two leaves a wide margin while bounding the memory a
 * long session spends on links.
 */
export const OWN_URL_WRITES_REMEMBERED = 32;

/** The paired wrappers one URL sync takes. */
export interface OwnUrlWrites {
	/**
	 * Wrap the engine the sync loads into, so it skips a config decoded from one of the sync's own writes.
	 *
	 * @param engine - The engine core the sync is given.
	 * @returns The same engine, with `loadConfig` guarded.
	 */
	readonly guardEngine: <T>(engine: FilterEngine<T>) => FilterEngine<T>;
	/**
	 * Wrap the sync's serializer, so it remembers what it encoded and notes each decode's origin.
	 *
	 * @param serializer - The serializer the sync would otherwise be given.
	 * @returns The remembering serializer, under the same name.
	 */
	readonly guardSerializer: (serializer: EngineStateSerializer) => EngineStateSerializer;
}

/**
 * Create the guard for one mounted URL sync.
 *
 * @remarks
 * Create one per mounted sync and keep it for the mount's life, and pass the serializer through
 * `guardSerializer` again whenever the link format changes: the remembered writes live in the guard,
 * not in any one serializer.
 *
 * @param limit - How many writes to remember; {@link OWN_URL_WRITES_REMEMBERED} by default.
 * @returns The paired wrappers.
 */
export function createOwnUrlWrites(limit: number = OWN_URL_WRITES_REMEMBERED): OwnUrlWrites {
	const written: string[] = [];
	let isLastDecodeOwn = false;

	return {
		guardEngine: <T>(engine: FilterEngine<T>): FilterEngine<T> => new Proxy(engine, {
			get: (target, property): unknown => {
				if (property === 'loadConfig') {
					return (config: FilterEngineConfig): void => {
						const isOwn = isLastDecodeOwn;

						isLastDecodeOwn = false;
						if (!isOwn) {
							target.loadConfig(config);
						}
					};
				}
				const member: unknown = Reflect.get(target, property, target);

				// Bound, so a class-based engine's methods still see the real instance as `this`.
				return typeof member === 'function' ? (member as (...args: unknown[]) => unknown).bind(target) : member;
			},
		}),
		guardSerializer: (serializer: EngineStateSerializer): EngineStateSerializer => ({
			decode: (serialized: string): FilterEngineConfig => {
				const config = serializer.decode(serialized);

				isLastDecodeOwn = written.includes(serialized);

				return config;
			},
			encode: (config: FilterEngineConfig): string => {
				const serialized = serializer.encode(config);

				written.push(serialized);
				if (written.length > limit) {
					written.shift();
				}

				return serialized;
			},
			name: serializer.name,
		}),
	};
}
