/**
 * Tests for `real-estate/radiusMap` — the lazy Leaflet wrapper and its buffered view.
 *
 * @remarks
 * ### Why a sibling suite rather than more cases in `real-estate/view.test.ts`
 *
 * That spec reaches this module the only way the app does — through `panel.ts` → `geoSection.ts` —
 * and `geoSection.update` calls `mount` → `setCenter` → `setRadius` in ONE synchronous turn, before
 * the dynamic `import()` can possibly have resolved. So every live-controller path and every
 * second-call path is unreachable from there without contorting a view test into a lifecycle test.
 * The module's whole job is the gap between those two moments, and it is testable directly.
 *
 * ### 🔴 Only the sites no other suite reaches
 *
 * A throw-mutant probe against the WHOLE `packages/examples-vanilla` suite — not against
 * `view.test.ts` alone, because coverage is transitive — shows the rest of the suite already drives
 * `destroy` and `invalidateSize` reaching a live controller (the dispose and breakpoint-cross cases
 * in `view.test.ts`), and `setCenter` / `setRadius` being called before the controller exists —
 * which is precisely the synchronous turn described above. The cases below cover the rest.
 *
 * Because those *null* arms are reached elsewhere, several cases below assert BOTH arms in one test.
 * A negative assertion ("no second map was created") is only worth reading beside a positive one
 * that would catch a fake staying silent for the wrong reason.
 *
 * ### Every test loads the module fresh
 *
 * `vi.resetModules()` + `vi.doMock` per test rather than one hoisted `vi.mock`, because one case
 * needs the dynamic `import()` itself to REJECT. A hoisted mock cannot express that without making
 * the whole file order-dependent: vitest caches a module registry, so "the import fails" would leak
 * into or out of its neighbors depending on which ran first — an assertion whose meaning depends on
 * test order is the kind that stops meaning anything quietly.
 *
 * @packageDocumentation
 */

import type {
	RadiusMapOptions as ControllerOptions,
	RadiusMapController,
	RadiusMapCoords,
} from '@filter-enginez/examples-shared/real-estate-map';

import { REDUCED_MOTION_QUERY } from '@filter-enginez/brand/motion';
import { METERS_PER_KM } from '@filter-enginez/examples-shared/real-estate-domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RadiusMap } from './radiusMap.js';

import { installMatchMedia } from '../test-support/matchMedia.js';

/** What the stubbed controller was constructed with. */
interface CreationRecord {
	readonly center: RadiusMapCoords;
	readonly radiusMeters: number;
	readonly shouldReduceMotion: boolean | undefined;
}

/** Everything the stubbed controller recorded. */
interface ControllerLog {
	/** Every `setCenter` that reached a LIVE controller. */
	readonly centers: RadiusMapCoords[];
	/** One entry per controller constructed — length is the double-init counter. */
	readonly creations: CreationRecord[];
	destroyedCount: number;
	measuredCount: number;
	/** Every `setRadius` that reached a LIVE controller, in METERS. */
	readonly radiiMeters: number[];
}

/** San Francisco — the module's own default, and where a map opens with no `?f` state. */
const SAN_FRANCISCO: RadiusMapCoords = { lat: 37.7749, lng: -122.4194 };

/** Denver — the "a shared link asked for somewhere else" half of the docblock's buffering story. */
const DENVER: RadiusMapCoords = { lat: 39.7392, lng: -104.9903 };

/**
 * Let the dynamic `import()`'s promise chain run to completion.
 *
 * @remarks
 * A macrotask rather than a couple of `await Promise.resolve()`s: the number of microtask ticks
 * between `import()` and the controller existing is an implementation detail of the module graph,
 * and a test that counts them passes for a reason that has nothing to do with the module.
 */
async function settleImport(): Promise<void> {
	await new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

/**
 * Load `radiusMap` over a stubbed controller module.
 *
 * @param options - `shouldImportFail` makes the dynamic `import()` reject, as a missing chunk does.
 * @returns The recorder and a fresh map.
 */
async function loadRadiusMap(options: { shouldImportFail?: boolean } = {}): Promise<{
	log: ControllerLog;
	map: RadiusMap;
}> {
	const log: ControllerLog = {
		centers: [],
		creations: [],
		destroyedCount: 0,
		measuredCount: 0,
		radiiMeters: [],
	};

	vi.resetModules();
	vi.doMock('@filter-enginez/examples-shared/real-estate-map', () => {
		if (options.shouldImportFail === true) {
			throw new Error('Failed to fetch dynamically imported module');
		}

		return {
			createRadiusMapController: (
				_container: HTMLElement,
				controllerOptions: ControllerOptions,
			): RadiusMapController => {
				log.creations.push({
					center: controllerOptions.center,
					radiusMeters: controllerOptions.radiusMeters,
					shouldReduceMotion: controllerOptions.shouldReduceMotion,
				});

				return {
					destroy: () => {
						log.destroyedCount += 1;
					},
					invalidateSize: () => {
						log.measuredCount += 1;
					},
					isDestroyed: () => false,
					setCenter: (next) => {
						log.centers.push(next);
					},
					setRadius: (radiusMeters) => {
						log.radiiMeters.push(radiusMeters);
					},
				};
			},
		};
	});

	const { createRadiusMap } = await import('./radiusMap.js');

	return { log, map: createRadiusMap({ onCenterChange: () => undefined }) };
}

afterEach(() => {
	vi.doUnmock('@filter-enginez/examples-shared/real-estate-map');
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('mounting', () => {
	it('creates one map, at the requested center and radius in METERS', async () => {
		// The control the negatives below lean on: if this ever stops recording a creation, every
		// "no second map" assertion in this file goes green having measured nothing.
		const { log, map } = await loadRadiusMap();

		map.mount(SAN_FRANCISCO, 24);
		await settleImport();

		expect(log.creations).toHaveLength(1);
		expect(log.creations[0]?.center).toEqual(SAN_FRANCISCO);
		expect(log.creations[0]?.radiusMeters).toBe(24 * METERS_PER_KM);
	});

	it('creates no SECOND map when the section enables the facet again', async () => {
		// `geoSection.update` calls `mount` on every rule change while the facet is on, and its comment
		// leans on this being idempotent. A second Leaflet instance over a live container is the one
		// map defect with a visible symptom, and it only shows on the second visit.
		const { log, map } = await loadRadiusMap();

		map.mount(SAN_FRANCISCO, 24);
		await settleImport();
		map.mount(DENVER, 40);
		await settleImport();

		expect(log.creations).toHaveLength(1);
	});

	it('records the latest view when mounted again while the first load is in flight', async () => {
		// Two enables inside one tick — a URL-state hydration landing on top of a click.
		//
		// 🔴 READ WHAT THIS DOES AND DOES NOT PROVE. It reaches the in-flight (`isLoading`) guard,
		// and it pins that the second call still records the requested view.
		// It does NOT prove the guard prevents a second load, and no test in this runner can:
		// Mutant W3 removes the guard and SURVIVES, because a second
		// concurrent `import()` of the same specifier does not settle inside the test. Measured, not
		// assumed — instrumenting the module under W3 shows TWO `import()` calls and ONE `.then`.
		// So "only one map was created" passes on *not yet* rather than on *never*, and asserting it
		// here would be a vacuous check wearing a passing one's clothes. The creations assertion below
		// is deliberately about WHICH view won, not about how many maps exist.
		const { log, map } = await loadRadiusMap();

		map.mount(SAN_FRANCISCO, 24);
		map.mount(DENVER, 40);
		await settleImport();

		// The half that IS observable: `mount`'s contract says a second call "only records the
		// requested center + radius", so the map must open where the second call asked. A guard that
		// returned before recording would open on the stale center, and W8 is the mutant for it.
		expect(log.creations[0]?.center).toEqual(DENVER);
		expect(log.creations[0]?.radiusMeters).toBe(40 * METERS_PER_KM);
	});

	it('never creates a map for a mount issued after destroy', async () => {
		// A late `update` arriving after the route tore down. Creating here would attach a Leaflet
		// instance to a detached container that nothing will ever destroy.
		const { log, map } = await loadRadiusMap();

		map.destroy();
		map.mount(SAN_FRANCISCO, 24);
		await settleImport();

		expect(log.creations).toHaveLength(0);
	});
});

describe('the buffered view', () => {
	it('opens on a center that arrived BEFORE the controller did', async () => {
		// The module's stated reason for existing. `geoSection.update` fires mount → setCenter →
		// setRadius in one synchronous turn, so with the buffer dropped the map opens on the default
		// San Francisco pin after a shared `?f` link asked for Denver — which reads to a user as the
		// URL state having failed to load, rather than as a race.
		const { log, map } = await loadRadiusMap();

		map.mount(SAN_FRANCISCO, 24);
		map.setCenter(DENVER);
		map.setRadius(40);
		await settleImport();

		expect(log.creations).toHaveLength(1);
		expect(log.creations[0]?.center).toEqual(DENVER);
		expect(log.creations[0]?.radiusMeters).toBe(40 * METERS_PER_KM);
		// Nothing was forwarded, because there was nothing to forward to. Asserted so a future
		// implementation that queued the calls INSTEAD of the values is not silently accepted.
		expect(log.centers).toHaveLength(0);
		expect(log.radiiMeters).toHaveLength(0);
	});

	it('forwards to the live controller once it exists, converting km to meters', async () => {
		const { log, map } = await loadRadiusMap();

		map.mount(SAN_FRANCISCO, 24);
		await settleImport();
		map.setCenter(DENVER);
		map.setRadius(40);

		expect(log.centers).toEqual([DENVER]);
		expect(log.radiiMeters).toEqual([40 * METERS_PER_KM]);
	});
});

describe('teardown', () => {
	it('destroys the controller once, and only when there is one', async () => {
		// Both arms in one case deliberately: the route calls `dispose` on every visit, including the
		// ones where the visitor never opened the distance filter, so the no-controller arm is the
		// COMMON path rather than the exotic one.
		const { log, map } = await loadRadiusMap();

		map.destroy();

		expect(log.destroyedCount).toBe(0);

		const second = await loadRadiusMap();

		second.map.mount(SAN_FRANCISCO, 24);
		await settleImport();
		second.map.destroy();
		// Twice, because the interface promises idempotence and a route can dispose along two paths
		// (navigation and the section's own teardown). Leaflet's `remove()` throws on a second call
		// against some layer configurations, so "harmless" here is a claim worth holding.
		second.map.destroy();

		expect(second.log.destroyedCount).toBe(1);
	});

	it('leaves no map behind when it is destroyed while the chunk is in flight', async () => {
		// The window this module cannot avoid: the section can be torn down between `mount` and the
		// chunk landing. A controller constructed here would never be destroyed by anyone — `destroy`
		// has already run and set `controller` back to null.
		const { log, map } = await loadRadiusMap();

		map.mount(SAN_FRANCISCO, 24);
		map.destroy();
		await settleImport();

		expect(log.creations).toHaveLength(0);
		expect(log.destroyedCount).toBe(0);
	});

	it('re-measures only once a controller exists', async () => {
		// The drawer opening on a route where the facet was never enabled calls this with nothing
		// behind it. Paired with the live arm so the no-op half cannot pass vacuously.
		const { log, map } = await loadRadiusMap();

		map.invalidateSize();

		expect(log.measuredCount).toBe(0);

		map.mount(SAN_FRANCISCO, 24);
		await settleImport();
		map.invalidateSize();

		expect(log.measuredCount).toBe(1);
	});
});

describe('a chunk that fails to load', () => {
	it('degrades to a mapless distance filter rather than taking the route down', async () => {
		// The dropdown, the radius slider and the rule all work without a map, so a failed chunk must
		// not reject into an unhandled rejection or leave the section in a half-mounted state. Every
		// later call has to stay a silent no-op — this is the one path where `controller` is null
		// forever and the module still has to answer.
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { log, map } = await loadRadiusMap({ shouldImportFail: true });

		map.mount(SAN_FRANCISCO, 24);
		await settleImport();

		expect(errorSpy).toHaveBeenCalledWith(
			'[real-estate] the radius map failed to load:',
			expect.anything(),
		);
		expect(log.creations).toHaveLength(0);

		expect(() => {
			map.setCenter(DENVER);
			map.setRadius(40);
			map.invalidateSize();
			map.destroy();
		}).not.toThrow();
	});
});

describe('motion preference', () => {
	it('reads the reduced-motion preference at CREATION and hands it to Leaflet', async () => {
		// Leaflet takes its animation options at construction and caches them, so this is read once
		// and cannot be re-applied later without rebuilding the map — which is why it is worth pinning
		// that it is read at all: reduced motion must be honored.
		installMatchMedia(REDUCED_MOTION_QUERY, true);

		const { log, map } = await loadRadiusMap();

		map.mount(SAN_FRANCISCO, 24);
		await settleImport();

		expect(log.creations[0]?.shouldReduceMotion).toBe(true);
	});
});
