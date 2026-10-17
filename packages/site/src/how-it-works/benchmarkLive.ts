/**
 * `how-it-works/benchmarkLive` — when and how the live benchmark loads its engine, and where its bar
 * ends.
 *
 * @remarks
 * The widget (`benchmarkWidget.ts`) renders at once on the committed reference numbers. The engine and
 * the corpus a live measurement needs are fetched only when the widget is about to be seen or is used:
 * {@link whenNearViewport} says when, {@link createLiveBenchmarkLoader} fetches both once and lets a
 * failed fetch be retried. {@link liveBarStyle} places the timing bar with a transform, which the
 * browser animates on the compositor, rather than with a width, which it would lay out every frame.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import type * as BenchmarkEngine from './benchmarkEngine.js';

/**
 * How far below the viewport the widget starts loading its engine: one viewport height, so a reader
 * scrolling down meets a widget that has already measured.
 */
export const LIVE_LOAD_MARGIN = '0px 0px 100% 0px';

/** What a live measurement needs: the engine's workload and the corpus it runs over. */
export interface LiveBenchmark {
	/** The 10,000 wines the workload filters. */
	readonly corpus: readonly Wine[];
	/** Build an engine for a configuration and time the facet sweep (`benchmarkEngine.ts`). */
	readonly measureConfig: typeof BenchmarkEngine.measureConfig;
}

/**
 * Call `onNear` once, when `element` comes within {@link LIVE_LOAD_MARGIN} of the viewport.
 *
 * @remarks
 * Where `IntersectionObserver` is missing, `onNear` runs at once, as if the widget were in view from
 * the start: the measurement then still happens, only sooner than it needs to.
 *
 * @param element - The element to watch.
 * @param onNear - What to do when it nears the viewport.
 * @returns A teardown that stops watching. Safe to call more than once, and after `onNear` has run.
 */
export function whenNearViewport(element: Element, onNear: () => void): () => void {
	if (typeof IntersectionObserver === 'undefined') {
		onNear();

		return () => {
			// Nothing was observed, so there is nothing to disconnect.
		};
	}

	const observer = new IntersectionObserver(
		(entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				observer.disconnect();
				onNear();
			}
		},
		{ rootMargin: LIVE_LOAD_MARGIN },
	);

	observer.observe(element);

	return () => {
		observer.disconnect();
	};
}

/**
 * A function that fetches the engine and then the corpus, once.
 *
 * @remarks
 * Every call while a fetch is in flight, or after it has succeeded, returns the same promise, so the
 * engine is fetched once however many things ask for it. A failed fetch (a network error, a chunk the
 * server no longer has) is forgotten, so the next call tries again: that is what the widget's "retry
 * live" does.
 *
 * @param importEngine - Load `benchmarkEngine.ts`. The widget passes a dynamic `import()`, which is
 *   what keeps the engine out of the page's startup JavaScript.
 * @returns The loader.
 *
 * @example
 * ```ts
 * const loadLive = createLiveBenchmarkLoader(async () => import('./benchmarkEngine.js'));
 * const { corpus, measureConfig } = await loadLive();
 * ```
 */
export function createLiveBenchmarkLoader(importEngine: () => Promise<typeof BenchmarkEngine>): () => Promise<LiveBenchmark> {
	let pending: Promise<LiveBenchmark> | null = null;

	return async () => {
		pending ??= (async () => {
			const engine = await importEngine();

			return { corpus: await engine.loadWineCorpus(), measureConfig: engine.measureConfig };
		})().catch((error: unknown) => {
			pending = null;

			throw error;
		});

		return pending;
	};
}

/** Where the live timing bar is drawn: the inline styles {@link liveBarStyle} gives it. */
export interface LiveBarStyle {
	/** `0` for an empty bar, otherwise `1`. */
	readonly opacity: string;
	/** The `translateX()` that ends the bar where its width would. */
	readonly transform: string;
}

/**
 * The styles that end a full-width bar at `widthPercent` of its track.
 *
 * @remarks
 * The bar is as wide as its track and slides left, so its rounded right end sits where a bar of that
 * width would end; its left end is outside the track, which clips it to the track's own rounded
 * corner, the same radius. Scaling the bar instead would squash its rounded ends. An empty bar is also
 * made transparent: slid wholly out of the track, it would still cast its glow into it, where a bar of
 * no width casts none.
 *
 * @param widthPercent - Where the bar ends, as a percentage of the track (0–100).
 * @returns The bar's `opacity` and `transform`.
 */
export function liveBarStyle(widthPercent: number): LiveBarStyle {
	return { opacity: widthPercent > 0 ? '1' : '0', transform: `translateX(${widthPercent - 100}%)` };
}
