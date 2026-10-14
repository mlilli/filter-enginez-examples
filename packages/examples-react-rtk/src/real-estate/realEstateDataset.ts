/**
 * The real-estate dataset's code half — loaded on demand by the registry's `load`, never imported
 * statically.
 *
 * @remarks
 * Everything the `/real-estate` route needs beyond its hub card: the main-thread boot over the
 * streamed default tier, the Redux mirror it wires, its progress store and `<RealEstateApp>`. This
 * module is the root of the route's chunk; see `datasets.tsx` for why the registry may only reach it
 * through `import()`. Leaflet is not in this chunk either: the radius map loads it when the map first
 * mounts (`examples-shared/src/real-estate/LeafletRadiusMap.tsx`).
 *
 * @packageDocumentation
 */

import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import {
	bootRealEstateEngine,
	getRealEstateBootProgressSnapshot,
	subscribeRealEstateBootProgress,
} from '@filter-enginez/examples-shared/real-estate';

import type { BootedDataset, DatasetModule } from '../datasets.js';

import { RealEstateApp } from './RealEstateApp.js';
import { createRealEstateStore } from './store.js';

/**
 * The geo-heavy dataset (GeoProximity / R-tree, DateRange, metro→neighborhood tree), booting the
 * bundled default tier on the main thread (see `examples-shared/real-estate`) and wiring its mirror
 * store.
 */
export const realEstateDataset: DatasetModule = {
	bootAndWire: async (): Promise<BootedDataset> => {
		const bundle = await bootRealEstateEngine();
		const { detach, store } = createRealEstateStore(bundle.engine.core);

		return { detach, engine: bundle.engine as unknown as SignalsEngine<unknown>, store };
	},
	Component: RealEstateApp,
	getProgressSnapshot: getRealEstateBootProgressSnapshot,
	subscribeProgress: subscribeRealEstateBootProgress,
};
