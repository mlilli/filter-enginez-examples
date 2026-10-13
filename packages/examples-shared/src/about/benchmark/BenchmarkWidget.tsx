/**
 * `<BenchmarkWidget />` — the "try the optimizations live" payoff on the About page.
 *
 * @remarks
 * Runs the real `simulate-per-option` workload in the browser against the 10k wine corpus, with the
 * three acceleration layers toggled independently, and times it. The result count is cyan (data) and
 * stays constant across every configuration — only the phosphor timing moves — which is the brand
 * thesis in one row. If the browser's timing looks unreliable, or the corpus hasn't loaded yet, it
 * shows the committed reference numbers instead, clearly labeled; it never silently blends the two.
 *
 * @packageDocumentation
 */

import type { Wine } from '@filter-enginez/mock-data/wine';

import { useCallback, useEffect, useRef, useState } from 'react';

import { assessSamples, computeSpeedup, formatDuration, formatSpeedup, logBarWidthPercent } from './benchmarkTiming.js';
import { HEAVY_TIMED_PASSES, loadWineCorpus, measureConfig } from './benchmarkWorkload.js';
import {
	type BenchmarkConfig,
	configKey,
	NAIVE_BASELINE_MS,
	REFERENCE_LABEL,
	referenceMsFor,
} from './referenceResults.js';

/** The three toggle rows, with their display copy. */
const LAYERS: readonly { descriptor: string; key: keyof BenchmarkConfig; name: string }[] = [
	{ descriptor: 'bitmap AND instead of a linear scan', key: 'bitmap', name: 'roaring' },
	{ descriptor: 'skip impossible filter combinations', key: 'exclusionGraph', name: 'exclusionGraph' },
	{ descriptor: 'reuse answers to repeated what-ifs', key: 'memoization', name: 'memoization' },
];

const ALL_ON: BenchmarkConfig = { bitmap: true, exclusionGraph: true, memoization: true };

/**
 * The live benchmark widget.
 */
export const BenchmarkWidget = (): React.ReactElement => {
	const [config, setConfig] = useState<BenchmarkConfig>(ALL_ON);
	const [displayMs, setDisplayMs] = useState<number>(() => referenceMsFor(ALL_ON));
	const [mode, setMode] = useState<'live' | 'reference'>('reference');
	const [resultCount, setResultCount] = useState<number | null>(null);
	const [isMeasuring, setIsMeasuring] = useState(false);
	const [passCount, setPassCount] = useState<number>(0);

	const corpusRef = useRef<null | readonly Wine[]>(null);
	const measuredRef = useRef<Map<string, number>>(new Map());
	/** Monotonic token so a slow measurement from an earlier config can't clobber a newer one. */
	const tokenRef = useRef(0);

	/** Measure `next` live if the corpus is ready; otherwise fall back to the reference number. */
	const measure = useCallback(async (next: BenchmarkConfig, heavy = false): Promise<void> => {
		const corpus = corpusRef.current;
		const token = (tokenRef.current += 1);

		if (corpus === null) {
			setMode('reference');
			setDisplayMs(referenceMsFor(next));

			return;
		}

		const cached = heavy ? undefined : measuredRef.current.get(configKey(next));

		if (cached !== undefined) {
			setMode('live');
			setDisplayMs(cached);

			return;
		}

		setIsMeasuring(true);
		// Yield a frame so the "measuring" state paints before the synchronous sweep blocks the thread.
		await new Promise((resolve) => setTimeout(resolve, 0));

		const { resultCount: count, samples } = await measureConfig(corpus, next, heavy ? { timedPasses: HEAVY_TIMED_PASSES } : {});
		const assessment = assessSamples(samples);

		if (token !== tokenRef.current) {
			return; // A newer measurement superseded this one.
		}

		setResultCount(count);
		setPassCount(samples.length);
		setIsMeasuring(false);

		if (assessment.mode === 'live') {
			measuredRef.current.set(configKey(next), assessment.medianMs);
			setMode('live');
			setDisplayMs(assessment.medianMs);
		} else {
			setMode('reference');
			setDisplayMs(referenceMsFor(next));
		}
	}, []);

	// On mount: load the corpus (a separate async chunk), then measure the default config live.
	useEffect(() => {
		let isCancelled = false;

		loadWineCorpus()
			.then(async (corpus) => {
				if (isCancelled) {
					return;
				}
				corpusRef.current = corpus;

				return measure(ALL_ON);
			})
			.catch(() => {
				// Corpus failed to load — the reference numbers already on screen stand in.
			});

		return () => {
			isCancelled = true;
		};
	}, [measure]);

	const handleToggle = useCallback((key: keyof BenchmarkConfig): void => {
		setConfig((previous) => {
			const next = { ...previous, [key]: !previous[key] };

			void measure(next);

			return next;
		});
	}, [measure]);

	const handleHeavyRun = useCallback((): void => {
		void measure(config, true);
	}, [config, measure]);

	const handleRetry = useCallback((): void => {
		measuredRef.current.clear();
		void measure(config);
	}, [config, measure]);

	const speedup = computeSpeedup(NAIVE_BASELINE_MS, displayMs);

	return (
		<div className="fe-bench">
			{/* ── Left rail — the data (cyan) ── */}
			<div className="fe-bench__rail">
				<p className="fe-bench__corpus">
					<span className="fe-bench__corpus-count">{resultCount === null ? '10,000' : resultCount.toLocaleString()}</span>{' '}
					{resultCount === null ? 'wines' : 'results'} · 2 rules active
				</p>
				<p className="fe-bench__constant">same results, every configuration — only the work changes</p>

				<div className="fe-bench__toggles" role="group" aria-label="Acceleration layers">
					{LAYERS.map((layer) => {
						const isOn = config[layer.key];

						return (
							<button
								key={layer.key}
								type="button"
								role="switch"
								aria-checked={isOn}
								className={`fe-bench__toggle${isOn ? ' is-on' : ''}`}
								onClick={() => {
									handleToggle(layer.key);
								}}
							>
								<span className="fe-bench__switch" aria-hidden="true">
									<span className="fe-bench__switch-thumb" />
								</span>
								<span className="fe-bench__toggle-text">
									<span className="fe-bench__toggle-name">{layer.name}</span>
									<span className="fe-bench__toggle-desc">{layer.descriptor}</span>
								</span>
							</button>
						);
					})}
				</div>

				<button type="button" className="fe-bench__heavy" onClick={handleHeavyRun} disabled={isMeasuring || mode === 'reference'}>
					run 20 passes
				</button>
			</div>

			{/* ── Right pane — the timing (phosphor) ── */}
			<div className="fe-bench__pane">
				<div className="fe-bench__headline">
					<span className={`fe-bench__number${isMeasuring ? ' is-measuring' : ''}`}>{formatDuration(displayMs)}</span>
					<span className="fe-bench__badge">{formatSpeedup(speedup)} faster than naive scan</span>
				</div>
				<p className="fe-bench__number-sub">{isMeasuring ? 'measuring…' : `median of ${passCount || '—'} passes`}</p>

				<div className="fe-bench__bars">
					<div className="fe-bench__bar-row">
						<span className="fe-bench__bar-label">naive linear scan</span>
						<div className="fe-bench__bar-track">
							<div className="fe-bench__bar is-naive" style={{ width: `${logBarWidthPercent(NAIVE_BASELINE_MS)}%` }} />
						</div>
						<span className="fe-bench__bar-value">{formatDuration(NAIVE_BASELINE_MS)}</span>
					</div>
					<div className="fe-bench__bar-row">
						<span className="fe-bench__bar-label">this configuration</span>
						<div className="fe-bench__bar-track">
							<div className="fe-bench__bar is-live" style={{ width: `${logBarWidthPercent(displayMs)}%` }} />
						</div>
						<span className="fe-bench__bar-value">{formatDuration(displayMs)}</span>
					</div>
					<div className="fe-bench__axis">
						<span>0.1</span>
						<span>1</span>
						<span>10</span>
						<span>ms</span>
					</div>
				</div>

				<p className="fe-bench__status">
					<span className={`fe-bench__status-dot is-${mode}`} aria-hidden="true" />
					{mode === 'live' ? 'measured on your machine' : REFERENCE_LABEL}
					{mode === 'reference' ? (
						<button type="button" className="fe-bench__retry" onClick={handleRetry}>
							retry live
						</button>
					) : null}
				</p>
			</div>
		</div>
	);
};
