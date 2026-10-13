<script setup lang="ts">
/**
 * `<BenchmarkWidget>` — the Vue port of the About page's "try the optimizations live" payoff, at
 * parity with the React + SvelteKit widgets.
 *
 * Runs the real `simulate-per-option` workload in the browser over the 10k wine corpus with the three
 * acceleration layers toggled independently, and times it. The result count is cyan (data) and stays
 * constant across every configuration — only the phosphor timing moves. Everything numeric (the engine
 * workload, the timing statistics, the reference fallbacks) is the SAME React-free core imported from
 * `@filter-enginez/examples-shared/about-core`; only this stateful shell + markup is Vue. The markup
 * renders over the shared `fe-bench__*` classes in `@filter-enginez/ui-styles`.
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
import { computed, onMounted, onUnmounted, ref } from 'vue';

/** The three toggle rows, with their display copy. */
const LAYERS: readonly { readonly descriptor: string; readonly key: keyof BenchmarkConfig; readonly name: string }[] = [
	{ descriptor: 'bitmap AND instead of a linear scan', key: 'bitmap', name: 'roaring' },
	{ descriptor: 'skip impossible filter combinations', key: 'exclusionGraph', name: 'exclusionGraph' },
	{ descriptor: 'reuse answers to repeated what-ifs', key: 'memoization', name: 'memoization' },
];

const ALL_ON: BenchmarkConfig = { bitmap: true, exclusionGraph: true, memoization: true };

const config = ref<BenchmarkConfig>({ ...ALL_ON });
const displayMs = ref<number>(referenceMsFor(ALL_ON));
const mode = ref<'live' | 'reference'>('reference');
const resultCount = ref<number | null>(null);
const isMeasuring = ref(false);
const passCount = ref(0);

// Non-reactive scratch state (mirrors the React refs / Svelte plain `let`s): the resident corpus, the
// per-config live cache (a plain record — never rendered, so it needs no reactivity), and a monotonic
// token so a slow measurement from an earlier config can't clobber a newer one. Plain `let` bindings in
// `<script setup>` are per-instance and non-reactive — exactly right for this.
let corpus: null | readonly Wine[] = null;
let measured: Record<string, number> = {};
let requestToken = 0;
let isCancelled = false;

const speedup = computed(() => computeSpeedup(NAIVE_BASELINE_MS, displayMs.value));

/** Measure `next` live if the corpus is ready; otherwise fall back to the reference number. */
async function measure(next: BenchmarkConfig, heavy = false): Promise<void> {
	const localToken = (requestToken += 1);

	if (corpus === null) {
		mode.value = 'reference';
		displayMs.value = referenceMsFor(next);

		return;
	}

	const cached = heavy ? undefined : measured[configKey(next)];

	if (cached !== undefined) {
		mode.value = 'live';
		displayMs.value = cached;

		return;
	}

	isMeasuring.value = true;
	// Yield a frame so the "measuring" state paints before the synchronous sweep blocks the thread.
	await new Promise((resolve) => setTimeout(resolve, 0));

	const measurement = await measureConfig(corpus, next, heavy ? { timedPasses: HEAVY_TIMED_PASSES } : {});
	const assessment = assessSamples(measurement.samples);

	if (localToken !== requestToken) {
		return; // A newer measurement superseded this one.
	}

	resultCount.value = measurement.resultCount;
	passCount.value = measurement.samples.length;
	isMeasuring.value = false;

	if (assessment.mode === 'live') {
		measured[configKey(next)] = assessment.medianMs;
		mode.value = 'live';
		displayMs.value = assessment.medianMs;
	} else {
		mode.value = 'reference';
		displayMs.value = referenceMsFor(next);
	}
}

// On mount: load the corpus (a separate async chunk), then measure the default config live.
onMounted(() => {
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
});

onUnmounted(() => {
	isCancelled = true;
});

/** Toggle one acceleration layer + re-measure. */
function toggleLayer(key: keyof BenchmarkConfig): void {
	config.value = { ...config.value, [key]: !config.value[key] };
	void measure(config.value);
}

/** Clear the live cache and re-measure the current config (the "retry live" affordance). */
function retryLive(): void {
	measured = {};
	void measure(config.value);
}
</script>

<template>
	<div class="fe-bench">
		<!-- Left rail — the data (cyan) -->
		<div class="fe-bench__rail">
			<p class="fe-bench__corpus">
				<span class="fe-bench__corpus-count">
					{{ resultCount === null ? '10,000' : resultCount.toLocaleString() }}
				</span>
				{{ resultCount === null ? 'wines' : 'results' }} · 2 rules active
			</p>
			<p class="fe-bench__constant">same results, every configuration — only the work changes</p>

			<div class="fe-bench__toggles" role="group" aria-label="Acceleration layers">
				<button
					v-for="layer in LAYERS"
					:key="layer.key"
					type="button"
					role="switch"
					:aria-checked="config[layer.key]"
					class="fe-bench__toggle"
					:class="{ 'is-on': config[layer.key] }"
					@click="toggleLayer(layer.key)"
				>
					<span class="fe-bench__switch" aria-hidden="true">
						<span class="fe-bench__switch-thumb"></span>
					</span>
					<span class="fe-bench__toggle-text">
						<span class="fe-bench__toggle-name">{{ layer.name }}</span>
						<span class="fe-bench__toggle-desc">{{ layer.descriptor }}</span>
					</span>
				</button>
			</div>

			<button
				type="button"
				class="fe-bench__heavy"
				:disabled="isMeasuring || mode === 'reference'"
				@click="() => void measure(config, true)"
			>
				run 20 passes
			</button>
		</div>

		<!-- Right pane — the timing (phosphor) -->
		<div class="fe-bench__pane">
			<div class="fe-bench__headline">
				<span class="fe-bench__number" :class="{ 'is-measuring': isMeasuring }">{{ formatDuration(displayMs) }}</span>
				<span class="fe-bench__badge">{{ formatSpeedup(speedup) }} faster than naive scan</span>
			</div>
			<p class="fe-bench__number-sub">{{ isMeasuring ? 'measuring…' : `median of ${passCount || '—'} passes` }}</p>

			<div class="fe-bench__bars">
				<div class="fe-bench__bar-row">
					<span class="fe-bench__bar-label">naive linear scan</span>
					<div class="fe-bench__bar-track">
						<div class="fe-bench__bar is-naive" :style="{ width: `${logBarWidthPercent(NAIVE_BASELINE_MS)}%` }"></div>
					</div>
					<span class="fe-bench__bar-value">{{ formatDuration(NAIVE_BASELINE_MS) }}</span>
				</div>
				<div class="fe-bench__bar-row">
					<span class="fe-bench__bar-label">this configuration</span>
					<div class="fe-bench__bar-track">
						<div class="fe-bench__bar is-live" :style="{ width: `${logBarWidthPercent(displayMs)}%` }"></div>
					</div>
					<span class="fe-bench__bar-value">{{ formatDuration(displayMs) }}</span>
				</div>
				<div class="fe-bench__axis">
					<span>0.1</span>
					<span>1</span>
					<span>10</span>
					<span>ms</span>
				</div>
			</div>

			<p class="fe-bench__status">
				<span class="fe-bench__status-dot" :class="`is-${mode}`" aria-hidden="true"></span>
				{{ mode === 'live' ? 'measured on your machine' : REFERENCE_LABEL }}
				<button v-if="mode === 'reference'" type="button" class="fe-bench__retry" @click="retryLive">retry live</button>
			</p>
		</div>
	</div>
</template>
