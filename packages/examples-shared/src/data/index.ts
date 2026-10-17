/**
 * `@filter-enginez/examples-shared/data` — framework-free corpus-loading utilities shared across
 * the example verticals.
 *
 * @packageDocumentation
 */

export { announceCorpusApi, hasCorpusApi } from './corpusApi.js';
export {
	type CorpusPageProgress,
	loadCorpusPaged,
	type LoadCorpusPagedOptions,
} from './loadCorpusPaged.js';
export {
	type DefaultTierCorpus,
	loadDefaultTierCorpus,
	type LoadDefaultTierCorpusOptions,
} from './loadDefaultTierCorpus.js';
