/**
 * The wine dataset's code half — loaded on demand by the registry's `load`, never imported statically.
 *
 * @remarks
 * Everything the `/wine` route needs beyond its hub card: the worker-tier boot, its progress store and
 * `<WineApp>`. This module is the root of the route's chunk, so the wine slice of `examples-shared`,
 * the engine and the page reach the browser when the route first opens rather than at startup. See
 * `datasets.tsx` for why the registry may only reach it through `import()`.
 *
 * @packageDocumentation
 */

import type { SignalsEngine } from '@filter-enginez/reactive-signals';

import {
	bootWineEngine,
	getWineBootProgressSnapshot,
	subscribeWineBootProgress,
} from '@filter-enginez/examples-shared/wine';
import { spawnWineWorker } from '@filter-enginez/examples-shared/wine-worker-spawn';

import type { BootedDataset, DatasetModule } from '../datasets.js';

import { WineApp } from './WineApp.js';

/** Boots the 150,000-wine tier in a worker (see `examples-shared/wine`). */
export const wineDataset: DatasetModule = {
	boot: async (): Promise<BootedDataset> => {
		const bundle = await bootWineEngine({ spawnWorker: spawnWineWorker });

		return { engine: bundle.engine as unknown as SignalsEngine<unknown> };
	},
	Component: WineApp,
	getProgressSnapshot: getWineBootProgressSnapshot,
	subscribeProgress: subscribeWineBootProgress,
};
