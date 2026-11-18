/**
 * The wine dataset's code half — loaded on demand by the registry's `load`, never imported statically.
 *
 * @remarks
 * Everything the `/wine` route needs beyond its hub card: the worker-tier boot, the Redux mirror it
 * wires, its progress store and `<WineApp>`. This module is the root of the route's chunk, so the wine
 * slice of `examples-shared`, the engine, Redux Toolkit and the page reach the browser when the route
 * first opens rather than at startup. See `datasets.tsx` for why the registry may only reach it through
 * `import()`.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';
import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import {
	bootWineEngine,
	getWineBootProgressSnapshot,
	subscribeWineBootProgress,
} from '@filter-enginez/examples-shared/wine';
import { primeFirstWineBundle } from '@filter-enginez/examples-shared/wine-domain';
import { spawnWineWorker } from '@filter-enginez/examples-shared/wine-worker-spawn';

import type { BootedDataset, DatasetModule } from '../datasets.js';

import { createWineStore } from '../store.js';
import { WineApp } from './WineApp.js';

/** Boots the 150,000-wine tier in a worker (see `examples-shared/wine`) and wires its mirror store. */
export const wineDataset: DatasetModule = {
	bootAndWire: async (): Promise<BootedDataset> => {
		const bundle = await bootWineEngine({ spawnWorker: spawnWineWorker });
		const { detach, store } = createWineStore(bundle.engine.core);

		return { detach, engine: bundle.engine as unknown as SignalsEngine<unknown>, store };
	},
	Component: WineApp,
	getProgressSnapshot: getWineBootProgressSnapshot,
	// The panel's first bundle, for its first frame (`primeFirstWineBundle`).
	prepareFirstRender: async (engine: SignalsEngine<unknown>): Promise<void> =>
		primeFirstWineBundle(engine as unknown as SignalsEngine<Wine>),
	subscribeProgress: subscribeWineBootProgress,
};
