<script lang="ts">
	/**
	 * `<BenchmarkWidget>` — the SvelteKit port of the About page's "try the optimizations live" payoff,
	 * at parity with the React widget.
	 *
	 * Runs the real `simulate-per-option` workload in the browser over the 10k wine corpus with the three
	 * acceleration layers toggled independently, and times it. The result count is cyan (data) and stays
	 * constant across every configuration — only the phosphor timing moves. Everything numeric (the engine
	 * workload, the timing statistics, the reference fallbacks) is the SAME React-free core imported from
	 * `@filter-enginez/examples-shared/about-core`; only this stateful shell + markup is Svelte. The
	 * markup renders over the shared `fe-bench__*` classes in `@filter-enginez/ui-styles`.
	 */

	import type { Wine } from '@filter-enginez/mock-data/wine';

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
	import { onMount } from 'svelte';

	/** The three toggle rows, with their display copy. */
	const LAYERS: readonly { readonly descriptor: string; readonly key: keyof BenchmarkConfig; readonly name: string }[] = [
		{ descriptor: 'bitmap AND instead of a linear scan', key: 'bitmap', name: 'roaring' },
		{ descriptor: 'skip impossible filter combinations', key: 'exclusionGraph', name: 'exclusionGraph' },
		{ descriptor: 'reuse answers to repeated what-ifs', key: 'memoization', name: 'memoization' },
	];

	const ALL_ON: BenchmarkConfig = { bitmap: true, exclusionGraph: true, memoization: true };

	let config = $state<BenchmarkConfig>({ ...ALL_ON });
	let displayMs = $state<number>(referenceMsFor(ALL_ON));
	let mode = $state<'live' | 'reference'>('reference');
	let resultCount = $state<number | null>(null);
	let isMeasuring = $state(false);
	let passCount = $state(0);

	// Non-reactive scratch state (mirrors the React refs): the resident corpus, the per-config live
	// cache (a plain record — never rendered, so it needs no Svelte reactivity), and a monotonic token
	// so a slow measurement from an earlier config can't clobber a newer one.
	let corpus: null | readonly Wine[] = null;
	let measured: Record<string, number> = {};
	let requestToken = 0;

	const speedup = $derived(computeSpeedup(NAIVE_BASELINE_MS, displayMs));

	/** Measure `next` live if the corpus is ready; otherwise fall back to the reference number. */
	async function measure(next: BenchmarkConfig, heavy = false): Promise<void> {
		const localToken = (requestToken += 1);

		if (corpus === null) {
			mode = 'reference';
			displayMs = referenceMsFor(next);

			return;
		}

		const cached = heavy ? undefined : measured[configKey(next)];

		if (cached !== undefined) {
			mode = 'live';
			displayMs = cached;

			return;
		}

		isMeasuring = true;
		// Yield a frame so the "measuring" state paints before the synchronous sweep blocks the thread.
		await new Promise((resolve) => setTimeout(resolve, 0));

		const measurement = await measureConfig(corpus, next, heavy ? { timedPasses: HEAVY_TIMED_PASSES } : {});
		const assessment = assessSamples(measurement.samples);

		if (localToken !== requestToken) {
			return; // A newer measurement superseded this one.
		}

		resultCount = measurement.resultCount;
		passCount = measurement.samples.length;
		isMeasuring = false;

		if (assessment.mode === 'live') {
			measured[configKey(next)] = assessment.medianMs;
			mode = 'live';
			displayMs = assessment.medianMs;
		} else {
			mode = 'reference';
			displayMs = referenceMsFor(next);
		}
	}

	// On mount: load the corpus (a separate async chunk), then measure the default config live.
	onMount(() => {
		let isCancelled = false;

		loadWineCorpus()
			.then(async (loaded) => {
				if (isCancelled) {
					return;
				}
				corpus = loaded;

				return measure(ALL_ON);
			})
			.catch(() => {
				// Corpus failed to load — the reference numbers already on screen stand in.
			});

		return () => {
			isCancelled = true;
		};
	});

	/** Toggle one acceleration layer + re-measure. */
	function toggleLayer(key: keyof BenchmarkConfig): void {
		config = { ...config, [key]: !config[key] };
		void measure(config);
	}

	/** Clear the live cache and re-measure the current config (the "retry live" affordance). */
	function retryLive(): void {
		measured = {};
		void measure(config);
	}
</script>

<div class="fe-bench">
	<!-- Left rail — the data (cyan) -->
	<div class="fe-bench__rail">
		<p class="fe-bench__corpus">
			<span class="fe-bench__corpus-count">{resultCount === null ? '10,000' : resultCount.toLocaleString()}</span>
			{resultCount === null ? 'wines' : 'results'} · 2 rules active
		</p>
		<p class="fe-bench__constant">same results, every configuration — only the work changes</p>

		<div class="fe-bench__toggles" role="group" aria-label="Acceleration layers">
			{#each LAYERS as layer (layer.key)}
				<button
					type="button"
					role="switch"
					aria-checked={config[layer.key]}
					class="fe-bench__toggle"
					class:is-on={config[layer.key]}
					onclick={() => toggleLayer(layer.key)}
				>
					<span class="fe-bench__switch" aria-hidden="true">
						<span class="fe-bench__switch-thumb"></span>
					</span>
					<span class="fe-bench__toggle-text">
						<span class="fe-bench__toggle-name">{layer.name}</span>
						<span class="fe-bench__toggle-desc">{layer.descriptor}</span>
					</span>
				</button>
			{/each}
		</div>

		<button
			type="button"
			class="fe-bench__heavy"
			onclick={() => void measure(config, true)}
			disabled={isMeasuring || mode === 'reference'}
		>
			run 20 passes
		</button>
	</div>

	<!-- Right pane — the timing (phosphor) -->
	<div class="fe-bench__pane">
		<div class="fe-bench__headline">
			<span class="fe-bench__number" class:is-measuring={isMeasuring}>{formatDuration(displayMs)}</span>
			<span class="fe-bench__badge">{formatSpeedup(speedup)} faster than naive scan</span>
		</div>
		<p class="fe-bench__number-sub">{isMeasuring ? 'measuring…' : `median of ${passCount || '—'} passes`}</p>

		<div class="fe-bench__bars">
			<div class="fe-bench__bar-row">
				<span class="fe-bench__bar-label">naive linear scan</span>
				<div class="fe-bench__bar-track">
					<div class="fe-bench__bar is-naive" style="width: {logBarWidthPercent(NAIVE_BASELINE_MS)}%"></div>
				</div>
				<span class="fe-bench__bar-value">{formatDuration(NAIVE_BASELINE_MS)}</span>
			</div>
			<div class="fe-bench__bar-row">
				<span class="fe-bench__bar-label">this configuration</span>
				<div class="fe-bench__bar-track">
					<div class="fe-bench__bar is-live" style="width: {logBarWidthPercent(displayMs)}%"></div>
				</div>
				<span class="fe-bench__bar-value">{formatDuration(displayMs)}</span>
			</div>
			<div class="fe-bench__axis">
				<span>0.1</span>
				<span>1</span>
				<span>10</span>
				<span>ms</span>
			</div>
		</div>

		<p class="fe-bench__status">
			<span class="fe-bench__status-dot is-{mode}" aria-hidden="true"></span>
			{mode === 'live' ? 'measured on your machine' : REFERENCE_LABEL}
			{#if mode === 'reference'}
				<button type="button" class="fe-bench__retry" onclick={retryLive}>
					retry live
				</button>
			{/if}
		</p>
	</div>
</div>
