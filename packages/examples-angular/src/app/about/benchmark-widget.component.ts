/**
 * `<fe-benchmark-widget>` — the About page's "try the optimizations live" payoff, at parity with the
 * React, SvelteKit and Vue widgets.
 *
 * @remarks
 * Runs the real `simulate-per-option` workload in the browser over the 10k wine corpus with the three
 * acceleration layers toggled independently, and times it. The result count is cyan (data) and stays
 * constant across every configuration — only the phosphor timing moves.
 *
 * Everything numeric — the engine workload, the timing statistics, the reference fallbacks — is the
 * SAME framework-free core imported from `@filter-enginez/examples-shared/about-core`; only this
 * stateful shell + markup is Angular. Nothing is re-implemented here. The markup renders over the
 * shared `fe-bench__*` classes in `@filter-enginez/ui-styles` (loaded app-wide via `app.css`), so this
 * component contributes no CSS of its own.
 *
 * Vue's `ref`s become signals and its `computed`s become Angular `computed`s; the deliberately
 * NON-reactive scratch state (the resident corpus, the per-config live cache, the staleness token)
 * stays as plain private fields, exactly as it is a plain `let` in the Vue and Svelte ports — none of
 * it is ever rendered, so making it reactive would only cost change detection.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import {
	ChangeDetectionStrategy,
	Component,
	computed,
	DestroyRef,
	inject,
	type OnInit,
	signal,
} from '@angular/core';
import {
	assessSamples,
	type BenchmarkConfig,
	computeSpeedup,
	configKey,
	formatDuration,
	formatSpeedup,
	HEAVY_TIMED_PASSES,
	loadWineCorpus,
	logBarWidthPercent,
	measureConfig,
	NAIVE_BASELINE_MS,
	REFERENCE_LABEL,
	referenceMsFor,
} from '@filter-enginez/examples-shared/about-core';

/** One toggle row: which layer it flips, plus its display copy. */
interface LayerRow {
	/** The sub-heading explaining what the layer buys, in plain language. */
	readonly descriptor: string;
	/** The `BenchmarkConfig` field this row toggles. */
	readonly key: keyof BenchmarkConfig;
	/** The layer's engine-facing name. */
	readonly name: string;
}

/** The three toggle rows, with their display copy. */
const LAYERS: readonly LayerRow[] = [
	{ descriptor: 'bitmap AND instead of a linear scan', key: 'bitmap', name: 'roaring' },
	{ descriptor: 'skip impossible filter combinations', key: 'exclusionGraph', name: 'exclusionGraph' },
	{ descriptor: 'reuse answers to repeated what-ifs', key: 'memoization', name: 'memoization' },
];

/** Every acceleration layer on — the configuration the widget opens on. */
const ALL_ON: BenchmarkConfig = { bitmap: true, exclusionGraph: true, memoization: true };

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'fe-benchmark-widget',
	template: `
		<div class="fe-bench">
			<!-- Left rail — the data (cyan) -->
			<div class="fe-bench__rail">
				<p class="fe-bench__corpus">
					<span class="fe-bench__corpus-count">{{ corpusCount() }}</span>
					{{ corpusNoun() }} · 2 rules active
				</p>
				<p class="fe-bench__constant">same results, every configuration — only the work changes</p>

				<div class="fe-bench__toggles" role="group" aria-label="Acceleration layers">
					@for (layer of layers; track layer.key) {
						<button
							type="button"
							role="switch"
							[attr.aria-checked]="config()[layer.key]"
							class="fe-bench__toggle"
							[class.is-on]="config()[layer.key]"
							(click)="toggleLayer(layer.key)"
						>
							<span class="fe-bench__switch" aria-hidden="true">
								<span class="fe-bench__switch-thumb"></span>
							</span>
							<span class="fe-bench__toggle-text">
								<span class="fe-bench__toggle-name">{{ layer.name }}</span>
								<span class="fe-bench__toggle-desc">{{ layer.descriptor }}</span>
							</span>
						</button>
					}
				</div>

				<button
					type="button"
					class="fe-bench__heavy"
					[disabled]="isMeasuring() || mode() === 'reference'"
					(click)="runHeavy()"
				>
					run 20 passes
				</button>
			</div>

			<!-- Right pane — the timing (phosphor) -->
			<div class="fe-bench__pane">
				<div class="fe-bench__headline">
					<span class="fe-bench__number" [class.is-measuring]="isMeasuring()">{{ displayLabel() }}</span>
					<span class="fe-bench__badge">{{ speedupLabel() }} faster than naive scan</span>
				</div>
				<p class="fe-bench__number-sub">{{ passesLabel() }}</p>

				<div class="fe-bench__bars">
					<div class="fe-bench__bar-row">
						<span class="fe-bench__bar-label">naive linear scan</span>
						<div class="fe-bench__bar-track">
							<div class="fe-bench__bar is-naive" [style.width.%]="naiveBarWidth"></div>
						</div>
						<span class="fe-bench__bar-value">{{ naiveLabel }}</span>
					</div>
					<div class="fe-bench__bar-row">
						<span class="fe-bench__bar-label">this configuration</span>
						<div class="fe-bench__bar-track">
							<div class="fe-bench__bar is-live" [style.width.%]="liveBarWidth()"></div>
						</div>
						<span class="fe-bench__bar-value">{{ displayLabel() }}</span>
					</div>
					<div class="fe-bench__axis">
						<span>0.1</span>
						<span>1</span>
						<span>10</span>
						<span>ms</span>
					</div>
				</div>

				<p class="fe-bench__status">
					<span class="fe-bench__status-dot" [class]="statusDotClass()" aria-hidden="true"></span>
					{{ statusLabel() }}
					@if (mode() === 'reference') {
						<button type="button" class="fe-bench__retry" (click)="retryLive()">retry live</button>
					}
				</p>
			</div>
		</div>
	`,
})
export class BenchmarkWidgetComponent implements OnInit {
	/** True once the component is torn down, so an in-flight corpus load stops short. */
	private _isCancelled = false;

	/** The per-config live cache. Never rendered, so it needs no reactivity. */
	private _measured: Record<string, number> = {};

	/** Monotonic token so a slow measurement from an earlier config can't clobber a newer one. */
	private _requestToken = 0;

	/** The resident wine corpus, or `null` until it loads (or if it never does). */
	private _corpus: null | readonly Wine[] = null;

	/** Which acceleration layers are currently on. */
	protected readonly config = signal<BenchmarkConfig>({ ...ALL_ON });

	/** The duration currently on screen, in milliseconds — live or reference. */
	protected readonly displayMs = signal<number>(referenceMsFor(ALL_ON));

	/** True while a measurement sweep is running. */
	protected readonly isMeasuring = signal(false);

	/** The three toggle rows, exposed for the template. */
	protected readonly layers = LAYERS;

	/** Whether the displayed number was measured here or read off the reference table. */
	protected readonly mode = signal<'live' | 'reference'>('reference');

	/** The naive-baseline bar's formatted duration. Constant. */
	protected readonly naiveLabel = formatDuration(NAIVE_BASELINE_MS);

	/** The naive-baseline bar's width, as a log-scaled percentage. Constant. */
	protected readonly naiveBarWidth = logBarWidthPercent(NAIVE_BASELINE_MS);

	/** How many timed passes produced the current number. */
	protected readonly passCount = signal(0);

	/** The result count — cyan, and constant across every configuration. `null` before first measure. */
	protected readonly resultCount = signal<number | null>(null);

	/** The headline count: the measured result count, or the corpus size before the first measure. */
	protected readonly corpusCount = computed<string>(() =>
		this.resultCount() === null ? '10,000' : (this.resultCount() ?? 0).toLocaleString(),
	);

	/** What the headline count is counting — wines before the first measure, results after. */
	protected readonly corpusNoun = computed<string>(() =>
		this.resultCount() === null ? 'wines' : 'results',
	);

	/** The current duration, formatted. */
	protected readonly displayLabel = computed<string>(() => formatDuration(this.displayMs()));

	/** The current configuration's bar width, as a log-scaled percentage. */
	protected readonly liveBarWidth = computed<number>(() => logBarWidthPercent(this.displayMs()));

	/** The sub-line under the headline number. */
	protected readonly passesLabel = computed<string>(() =>
		this.isMeasuring() ? 'measuring…' : `median of ${this.passCount() || '—'} passes`,
	);

	/** How much faster than a naive linear scan the current configuration is. */
	protected readonly speedup = computed<number>(() =>
		computeSpeedup(NAIVE_BASELINE_MS, this.displayMs()),
	);

	/** The speed-up factor, formatted. */
	protected readonly speedupLabel = computed<string>(() => formatSpeedup(this.speedup()));

	/** The provenance dot's classes — cyan for live, muted for the reference fallback. */
	protected readonly statusDotClass = computed<string>(
		() => `fe-bench__status-dot is-${this.mode()}`,
	);

	/** The provenance line beside the dot. */
	protected readonly statusLabel = computed<string>(() =>
		this.mode() === 'live' ? 'measured on your machine' : REFERENCE_LABEL,
	);

	public constructor() {
		inject(DestroyRef).onDestroy(() => {
			this._isCancelled = true;
		});
	}

	/**
	 * Load the corpus (a separate async chunk), then measure the default configuration live.
	 *
	 * @remarks
	 * The Angular counterpart to Vue's `onMounted`. If the corpus never arrives, the reference numbers
	 * already on screen stand in — the widget is useful either way.
	 */
	public ngOnInit(): void {
		loadWineCorpus()
			.then(async (loaded) => {
				if (this._isCancelled) {
					return;
				}
				this._corpus = loaded;

				return this._measure(ALL_ON);
			})
			.catch(() => {
				// Corpus failed to load — the reference numbers already on screen stand in.
			});
	}

	/** Clear the live cache and re-measure the current configuration (the "retry live" affordance). */
	protected retryLive(): void {
		this._measured = {};
		void this._measure(this.config());
	}

	/** Re-measure the current configuration over the heavier 20-pass budget. */
	protected runHeavy(): void {
		void this._measure(this.config(), true);
	}

	/** Toggle one acceleration layer + re-measure. */
	protected toggleLayer(key: keyof BenchmarkConfig): void {
		this.config.update((current) => ({ ...current, [key]: !current[key] }));
		void this._measure(this.config());
	}

	/**
	 * Measure `next` live if the corpus is ready; otherwise fall back to the reference number.
	 *
	 * @param next - The acceleration configuration to time.
	 * @param isHeavy - Whether to run the heavier 20-pass budget (and bypass the cache).
	 */
	private async _measure(next: BenchmarkConfig, isHeavy = false): Promise<void> {
		const localToken = (this._requestToken += 1);

		if (this._corpus === null) {
			this.mode.set('reference');
			this.displayMs.set(referenceMsFor(next));

			return;
		}

		const cached = isHeavy ? undefined : this._measured[configKey(next)];

		if (cached !== undefined) {
			this.mode.set('live');
			this.displayMs.set(cached);

			return;
		}

		this.isMeasuring.set(true);
		// Yield a frame so the "measuring" state paints before the synchronous sweep blocks the thread.
		await new Promise((resolve) => setTimeout(resolve, 0));

		const measurement = await measureConfig(
			this._corpus,
			next,
			isHeavy ? { timedPasses: HEAVY_TIMED_PASSES } : {},
		);
		const assessment = assessSamples(measurement.samples);

		if (localToken !== this._requestToken) {
			return; // A newer measurement superseded this one.
		}

		this.resultCount.set(measurement.resultCount);
		this.passCount.set(measurement.samples.length);
		this.isMeasuring.set(false);

		if (assessment.mode === 'live') {
			this._measured[configKey(next)] = assessment.medianMs;
			this.mode.set('live');
			this.displayMs.set(assessment.medianMs);
		} else {
			this.mode.set('reference');
			this.displayMs.set(referenceMsFor(next));
		}
	}
}
