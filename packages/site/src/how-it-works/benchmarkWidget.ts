/**
 * `how-it-works/benchmarkWidget` — the how-it-works page's "try the optimizations live" payoff.
 *
 * @remarks
 * Runs the real `simulate-per-option` workload in the browser over the 10k wine corpus with the three
 * acceleration layers toggled independently, and times it. The result count is cyan (data) and stays
 * constant across every configuration — only the phosphor timing moves. Everything numeric (the engine
 * workload, the timing statistics, the reference fallbacks) is the SAME framework-free core imported
 * from `@filter-enginez/examples-shared/how-it-works`; only this stateful shell + its hand-built DOM is
 * local. The markup renders over the `fe-bench__*` classes in `howItWorks.css`.
 *
 * Until the engine and the corpus have loaded, and whenever the browser's timing is too noisy to trust,
 * the widget shows the committed reference numbers and says so; a live measurement replaces them in
 * place, in boxes that are already laid out, so nothing on the page moves when it arrives. The engine
 * is not part of the page's startup JavaScript: it is fetched when the widget comes within a viewport
 * height of the screen, or as soon as a reader uses it (`benchmarkLive.ts`, `benchmarkEngine.ts`). A
 * fetch that fails leaves the reference numbers standing, and "retry live" fetches again.
 *
 * A configuration with bitmaps on is measured live only on the bitmap path. The loader initializes the
 * engine's Roaring bitmaps before the first measurement, and every measurement reports the path its
 * engine ran on. When init failed (the library is not installed, or did not load in this browser), or
 * a bitmap configuration still ran on the predicate path, the widget shows that configuration's
 * reference number, which was measured with bitmaps, and says why in the status line: a predicate
 * timing is never shown under the bitmap label. The state is
 * plain closure-local `let` bindings plus a single `render()` that re-applies every derived string —
 * the framework-less equivalent of a reactive re-render.
 *
 * The timing bar moves by `transform` (see {@link liveBarStyle}), so the browser animates it on the
 * compositor; under `prefers-reduced-motion: reduce` the tokens' global rule makes that transition
 * instant.
 *
 * @packageDocumentation
 */

import { el, setHidden } from '@filter-enginez/examples-shared/dom';
import {
	assessSamples,
	type BenchmarkConfig,
	BITMAP_REFERENCE_SUBLINE,
	type BitmapUnavailableReason,
	bitmapUnavailableStatus,
	computeSpeedup,
	configKey,
	formatDuration,
	formatSpeedup,
	HEAVY_TIMED_PASSES,
	logBarWidthPercent,
	NAIVE_BASELINE_MS,
	REFERENCE_LABEL,
	referenceMsFor,
} from '@filter-enginez/examples-shared/how-it-works';

import { createLiveBenchmarkLoader, liveBarStyle, type LiveBenchmark, whenNearViewport } from './benchmarkLive.js';

/** The three toggle rows, with their display copy. */
const LAYERS: readonly { readonly descriptor: string; readonly key: keyof BenchmarkConfig; readonly name: string }[] = [
	{ descriptor: 'bitmap AND instead of a linear scan', key: 'bitmap', name: 'roaring' },
	{ descriptor: 'skip impossible filter combinations', key: 'exclusionGraph', name: 'exclusionGraph' },
	{ descriptor: 'reuse answers to repeated what-ifs', key: 'memoization', name: 'memoization' },
];

/** Every acceleration layer on — the default configuration. */
const ALL_ON: BenchmarkConfig = { bitmap: true, exclusionGraph: true, memoization: true };

/** A mounted benchmark widget with its teardown. */
export interface BenchmarkWidget {
	/** The widget root. */
	readonly element: HTMLElement;
	/** Stop watching the viewport and cancel any in-flight load or measurement, so a late resolve can't touch a dead tree. */
	readonly dispose: () => void;
}

/**
 * Build the live benchmark widget.
 *
 * @returns The widget root plus a `dispose` the page calls on teardown.
 */
export function createBenchmarkWidget(): BenchmarkWidget {
	// ── State (the framework-less counterpart to a framework's reactive state) ──
	let config: BenchmarkConfig = { ...ALL_ON };
	let displayMs: number = referenceMsFor(ALL_ON);
	let measurementMode: 'live' | 'reference' = 'reference';
	// Set while the number on screen is a bitmap configuration's reference number, shown because the
	// bitmap path is unavailable here; `null` otherwise.
	let bitmapUnavailable: BitmapUnavailableReason | null = null;
	let resultCount: number | null = null;
	let isMeasuring = false;
	let passCount = 0;

	// Non-reactive scratch state: the loaded engine workload and corpus, the per-config live cache, and a
	// monotonic token so a slow measurement from an earlier config can't clobber a newer one.
	let live: LiveBenchmark | null = null;
	// The one dynamic import of the engine: a chunk of its own, fetched on first use.
	const loadLive = createLiveBenchmarkLoader(async () => import('./benchmarkEngine.js'));
	let measuredMsByKey: Record<string, number> = {};
	let requestToken = 0;
	let isCancelled = false;

	// ── Left rail — the data (cyan) ──
	const corpusCount = el('span', { className: 'fe-bench__corpus-count' });
	const corpusSuffix = document.createTextNode(' wines · 2 rules active');
	const corpusLine = el('p', { children: [corpusCount, corpusSuffix], className: 'fe-bench__corpus' });

	const toggleButtons = LAYERS.map((layer) =>
		el('button', {
			attrs: { role: 'switch', type: 'button' },
			children: [
				el('span', {
					attrs: { 'aria-hidden': 'true' },
					children: [el('span', { className: 'fe-bench__switch-thumb' })],
					className: 'fe-bench__switch',
				}),
				el('span', {
					children: [
						el('span', { className: 'fe-bench__toggle-name', text: layer.name }),
						el('span', { className: 'fe-bench__toggle-desc', text: layer.descriptor }),
					],
					className: 'fe-bench__toggle-text',
				}),
			],
			className: 'fe-bench__toggle',
			on: {
				click: () => {
					toggleLayer(layer.key);
				},
			},
		}),
	);

	const heavyButton = el('button', {
		attrs: { type: 'button' },
		className: 'fe-bench__heavy',
		on: {
			click: () => {
				void measure(config, true);
			},
		},
		text: 'run 20 passes',
	});

	const rail = el('div', {
		children: [
			corpusLine,
			el('p', { className: 'fe-bench__constant', text: 'same results, every configuration — only the work changes' }),
			el('div', {
				attrs: { 'aria-label': 'Acceleration layers', role: 'group' },
				children: toggleButtons,
				className: 'fe-bench__toggles',
			}),
			heavyButton,
		],
		className: 'fe-bench__rail',
	});

	// ── Right pane — the timing (phosphor) ──
	const numberLabel = el('span', { className: 'fe-bench__number' });
	const badge = el('span', { className: 'fe-bench__badge' });
	const numberSub = el('p', { className: 'fe-bench__number-sub' });

	const naiveBar = el('div', { className: 'fe-bench__bar is-naive' });
	const naiveValue = el('span', { className: 'fe-bench__bar-value', text: formatDuration(NAIVE_BASELINE_MS) });
	const liveBar = el('div', { className: 'fe-bench__bar is-live' });
	const liveValue = el('span', { className: 'fe-bench__bar-value' });

	// The naive bar never moves, so it keeps a plain width (and its dashed fill starts at the track's
	// edge); the live bar slides by transform in `render()`.
	naiveBar.style.width = `${logBarWidthPercent(NAIVE_BASELINE_MS)}%`;

	const statusDot = el('span', { attrs: { 'aria-hidden': 'true' }, className: 'fe-bench__status-dot' });
	const statusText = document.createTextNode(REFERENCE_LABEL);
	const retryButton = el('button', {
		attrs: { type: 'button' },
		className: 'fe-bench__retry',
		on: {
			click: () => {
				retryLive();
			},
		},
		text: 'retry live',
	});
	const statusLine = el('p', {
		children: [statusDot, statusText, retryButton],
		className: 'fe-bench__status',
	});

	const pane = el('div', {
		children: [
			el('div', { children: [numberLabel, badge], className: 'fe-bench__headline' }),
			numberSub,
			el('div', {
				children: [
					el('div', {
						children: [
							el('span', { className: 'fe-bench__bar-label', text: 'naive linear scan' }),
							el('div', { children: [naiveBar], className: 'fe-bench__bar-track' }),
							naiveValue,
						],
						className: 'fe-bench__bar-row',
					}),
					el('div', {
						children: [
							el('span', { className: 'fe-bench__bar-label', text: 'this configuration' }),
							el('div', { children: [liveBar], className: 'fe-bench__bar-track' }),
							liveValue,
						],
						className: 'fe-bench__bar-row',
					}),
					el('div', {
						children: [
							el('span', { text: '0.1' }),
							el('span', { text: '1' }),
							el('span', { text: '10' }),
							el('span', { text: 'ms' }),
						],
						className: 'fe-bench__axis',
					}),
				],
				className: 'fe-bench__bars',
			}),
			statusLine,
		],
		className: 'fe-bench__pane',
	});

	const element = el('div', { children: [rail, pane], className: 'fe-bench' });

	/**
	 * The line under the number: how many passes it is the median of, or, for a bitmap configuration
	 * that cannot be measured here, that it is the reference number.
	 *
	 * @returns The text.
	 */
	function subline(): string {
		return bitmapUnavailable === null ? `median of ${passCount || '—'} passes` : BITMAP_REFERENCE_SUBLINE;
	}

	/**
	 * The status line: where the number comes from, and why a bitmap configuration is not live.
	 *
	 * @returns The text.
	 */
	function status(): string {
		if (bitmapUnavailable !== null) {
			return bitmapUnavailableStatus(bitmapUnavailable);
		}

		return measurementMode === 'live' ? 'measured on your machine' : REFERENCE_LABEL;
	}

	/** Re-apply every derived string / class / width in place. */
	function render(): void {
		corpusCount.textContent = resultCount === null ? '10,000' : resultCount.toLocaleString();
		corpusSuffix.textContent = `${resultCount === null ? ' wines' : ' results'} · 2 rules active`;

		for (const [index, layer] of LAYERS.entries()) {
			const button = toggleButtons[index];

			if (button === undefined) {
				continue;
			}

			const isOn = config[layer.key];

			button.setAttribute('aria-checked', String(isOn));
			button.className = isOn ? 'fe-bench__toggle is-on' : 'fe-bench__toggle';
		}

		heavyButton.disabled = isMeasuring || measurementMode === 'reference';

		numberLabel.className = isMeasuring ? 'fe-bench__number is-measuring' : 'fe-bench__number';
		numberLabel.textContent = formatDuration(displayMs);
		badge.textContent = `${formatSpeedup(computeSpeedup(NAIVE_BASELINE_MS, displayMs))} faster than naive scan`;
		numberSub.textContent = isMeasuring ? 'measuring…' : subline();

		const barStyle = liveBarStyle(logBarWidthPercent(displayMs));

		liveBar.style.opacity = barStyle.opacity;
		liveBar.style.transform = barStyle.transform;
		liveValue.textContent = formatDuration(displayMs);

		statusDot.className = `fe-bench__status-dot is-${measurementMode}`;
		statusText.textContent = status();
		// Retrying cannot bring bitmaps back: the engine's init is final, whether it worked or not.
		setHidden(retryButton, measurementMode !== 'reference' || bitmapUnavailable !== null);
	}

	/**
	 * Show `next`'s reference number.
	 *
	 * @param next - The configuration on screen.
	 * @param reason - Why a bitmap configuration is not measured live, or `null` for the plain
	 *   fallback (nothing loaded yet, or a reading too noisy to trust).
	 */
	function showReference(next: BenchmarkConfig, reason: BitmapUnavailableReason | null): void {
		measurementMode = 'reference';
		bitmapUnavailable = reason;
		displayMs = referenceMsFor(next);
		render();
	}

	/**
	 * Measure `next` live if the engine and the corpus are ready, and on the bitmap path when `next` asks
	 * for bitmaps; otherwise fall back to the reference number.
	 *
	 * @param next - The configuration to time.
	 * @param isHeavy - Run the 20-pass sweep and bypass the cache.
	 */
	async function measure(next: BenchmarkConfig, isHeavy = false): Promise<void> {
		const localToken = (requestToken += 1);

		if (live === null) {
			showReference(next, null);

			return;
		}

		if (next.bitmap && live.bitmap.status === 'unavailable') {
			showReference(next, live.bitmap.reason);

			return;
		}

		const cached = isHeavy ? undefined : measuredMsByKey[configKey(next)];

		if (cached !== undefined) {
			measurementMode = 'live';
			bitmapUnavailable = null;
			displayMs = cached;
			render();

			return;
		}

		isMeasuring = true;
		render();
		// Yield a frame so the "measuring" state paints before the synchronous sweep blocks the thread.
		await new Promise((resolve) => setTimeout(resolve, 0));

		const measurement = await live.measureConfig(live.corpus, next, isHeavy ? { timedPasses: HEAVY_TIMED_PASSES } : {});
		const assessment = assessSamples(measurement.samples);

		if (localToken !== requestToken || isCancelled) {
			return; // A newer measurement superseded this one (or the widget went away).
		}

		resultCount = measurement.resultCount;
		isMeasuring = false;

		if (next.bitmap && measurement.path !== 'bitmap') {
			// Init resolved, yet the engine ran its predicates: that timing is not a bitmap timing.
			showReference(next, 'not-engaged');

			return;
		}

		passCount = measurement.samples.length;

		if (assessment.mode === 'live') {
			measuredMsByKey[configKey(next)] = assessment.medianMs;
			measurementMode = 'live';
			bitmapUnavailable = null;
			displayMs = assessment.medianMs;
			render();
		} else {
			showReference(next, null);
		}
	}

	/**
	 * Toggle one acceleration layer + re-measure.
	 *
	 * @param key - The layer to flip.
	 */
	function toggleLayer(key: keyof BenchmarkConfig): void {
		config = { ...config, [key]: !config[key] };
		render();
		goLive();
		void measure(config);
	}

	/**
	 * Clear the live cache and re-measure the current config (the "retry live" affordance); fetch the
	 * engine again if the last fetch failed.
	 */
	function retryLive(): void {
		measuredMsByKey = {};
		goLive();
		void measure(config);
	}

	/**
	 * Fetch the engine and the corpus (each a chunk of its own, loaded once) and initialize bitmaps, then
	 * measure the current config live. A failed fetch leaves the reference numbers on screen, and "retry live" calls this
	 * again.
	 */
	function goLive(): void {
		if (live !== null || isCancelled) {
			return;
		}

		loadLive()
			.then(async (loaded) => {
				if (isCancelled || live !== null) {
					return; // The widget went away, or an earlier call already went live.
				}
				live = loaded;

				return measure(config);
			})
			.catch(() => {
				// The engine or the corpus failed to load — the reference numbers already on screen stand in.
			});
	}

	render();

	const stopWatching = whenNearViewport(element, goLive);

	return {
		dispose: () => {
			stopWatching();
			isCancelled = true;
			requestToken += 1;
		},
		element,
	};
}
