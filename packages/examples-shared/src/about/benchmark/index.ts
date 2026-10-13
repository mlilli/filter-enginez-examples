/**
 * Barrel for the About-page live benchmark widget and its supporting pure/engine modules.
 *
 * @packageDocumentation
 */

export { BenchmarkWidget } from './BenchmarkWidget.js';
export {
	type AssessOptions,
	assessSamples,
	computeSpeedup,
	formatDuration,
	formatSpeedup,
	logBarWidthPercent,
	type MeasurementMode,
	median,
	medianAbsoluteDeviation,
	type SampleAssessment,
} from './benchmarkTiming.js';
export {
	DEFAULT_TIMED_PASSES,
	DEFAULT_WARMUP_PASSES,
	HEAVY_TIMED_PASSES,
	loadWineCorpus,
	measureConfig,
	type MeasureOptions,
	toAcceleration,
	type WorkloadSamples,
} from './benchmarkWorkload.js';
export {
	type BenchmarkConfig,
	configKey,
	NAIVE_BASELINE_MS,
	REFERENCE_CORPUS_SIZE,
	REFERENCE_LABEL,
	REFERENCE_MS_BY_CONFIG,
	referenceMsFor,
} from './referenceResults.js';
