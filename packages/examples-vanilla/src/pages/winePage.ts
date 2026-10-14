/**
 * `/wine` — the framework-less wine route, and this app's first WORKER-backed engine.
 *
 * @remarks
 * **This file is only the BOOT.** Everything downstream of a live engine lives in
 * `winePageShell.ts` so `/wine-server` can share it. What is here is exactly what is true of the
 * worker tier and of nothing else: how the engine is obtained, and what the boot screen says while
 * that happens.
 *
 * ## The worker tier needs nothing app-specific
 *
 * `/books` and `/real-estate` are both main-thread. Wine is 130k records behind Comlink in every
 * vertical, and here that takes no extra machinery: `spawnWineWorker` is a Vite `?worker` import and
 * this is a Vite app, so `bootWineAsyncEngine` takes it directly. `examples-shared/wine-core`'s own
 * docblock lists vanilla among the verticals that pass it.
 *
 * **The `?worker` import must stay inline at ITS import site**, which is why the spawn lives in
 * `examples-shared/wine-worker-spawn` and is imported as a function here. Vite detects worker modules
 * by static analysis; moving the import behind any indirection makes it serve the worker as an
 * ordinary module, Comlink's handshake never completes, and the boot hangs with no error.
 *
 * ## The progress readout is subscribed BEFORE the boot call
 *
 * `bootWineAsyncEngine` starts streaming the corpus the moment it is called and publishes progress
 * from inside that stream. Subscribing afterwards misses every event on a fast connection and shows
 * a counter that never moves, which reads worse than no counter at all.
 *
 * ## Three caption states, not two
 *
 * The same three every vertical renders, from `examples-shared/boot-caption`. The third state is what
 * earns it: after the last row arrives there is still a visible pause while the bitmap index builds,
 * and a caption frozen on the final count reads as a hang precisely when the user is most likely to
 * reload. A `null` progress is the pre-stream moment, and a zero total means the stream has not
 * reported a length yet — `0 / 0 bottles` would claim a failure that has not happened.
 *
 * @packageDocumentation
 */

import { appHeaderSubtitle } from '@filter-enginez/examples-shared/app-header-core';
import { bootCaptionParts } from '@filter-enginez/examples-shared/boot-caption';
import {
	bootWineAsyncEngine,
	describeWineCorpusTier,
	getWineBootProgressSnapshot,
	subscribeWineBootProgress,
	type WineBootProgress,
} from '@filter-enginez/examples-shared/wine-core';
import { spawnWineWorker } from '@filter-enginez/examples-shared/wine-worker-spawn';
import { createSignalsEngineFromAsync } from '@filter-enginez/reactive-signals/worker';

import type { RouteTeardown } from '../router.js';

import { bootCaptionValue } from '../brand/indicators.js';
import { createWineBootScreen } from '../wine/bootScreen.js';
import { mountWineRoute } from './winePageShell.js';

/**
 * Boot the worker-backed wine engine and mount the shared wine route over it.
 *
 * @param container - The route container.
 * @returns A teardown dropping every subscription and disposing the engine.
 */
export async function renderWinePage(container: HTMLElement): Promise<RouteTeardown> {
	const bootScreen = createWineBootScreen('Loading wine reviews');
	const setProgress = (progress: WineBootProgress | null): void => {
		// The three states, their wording and the `total <= 0` guard come from
		// `examples-shared/boot-caption`. What is here is the vanilla-shaped half: turning a `value`
		// segment into a cyan span, and text into text.
		bootScreen.setCaption(
			...bootCaptionParts(progress, { recordNoun: 'bottles' }).map((part) =>
				part.kind === 'value' ? bootCaptionValue(part.text) : part.text,
			),
		);
	};

	setProgress(null);
	container.append(bootScreen.element);

	// Subscribe FIRST — see the module docblock.
	const stopProgress = subscribeWineBootProgress(setProgress);

	setProgress(getWineBootProgressSnapshot());

	// `.finally` rather than a plain line after the await: a failed boot rejects out of this function,
	// and the listener would otherwise stay in a module-level set for the life of the page.
	const { asyncEngine, meta } = await bootWineAsyncEngine({ spawnWorker: spawnWineWorker }).finally(
		stopProgress,
	);
	const engine = await createSignalsEngineFromAsync(asyncEngine);

	return mountWineRoute(container, {
		compareDataset: 'wine',
		engine,
		footnote: `filter-enginez · wine demo · vanilla + reactive-signals over a Comlink worker · ${describeWineCorpusTier(meta.source)}`,
		subtitle: appHeaderSubtitle('Wine', 'vanilla', 'worker'),
	});
}
